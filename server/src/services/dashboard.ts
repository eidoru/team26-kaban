import { REMINDER_DAYS_BEFORE } from "../domain/constants.js";
import { roundHealth } from "../domain/health.js";
import { outstanding } from "../domain/debt.js";
import { processPayout } from "../domain/payout.js";
import { daysBetween } from "../domain/schedule.js";
import { submissionCap } from "../domain/submissions.js";
import { frequencyLabel } from "../domain/setup.js";
import { forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { todayInManila, toCalendarDate } from "../lib/today.js";
import { slotName } from "./common.js";
import { debtOf } from "./debts.js";
import { completionSummary, recordEvents } from "./records.js";
import { openPeriodView, periodTotals } from "./submissions.js";

/**
 * What each slot would get if its round paid out today, through the same rules as a real payout
 * (§7): the pot, less its own unpaid share (for the open round) and its whole debt now. Later
 * rounds assume the member pays their contributions in full.
 */
async function projectedPayouts(groupId: string) {
  const group = await prisma.group.findUniqueOrThrow({ where: { id: groupId }, include: { slots: true, rounds: true } });
  const open = group.rounds.find((r) => r.status === "OPEN");
  const members = await Promise.all(
    group.slots.map(async (slot) => ({
      id: slot.id,
      isOrganizer: slot.isOrganizer,
      approved: open ? (await periodTotals(prisma, slot.id, open.id)).approved : Number(group.contribution),
      debt: debtOf(slot),
    })),
  );
  const projections = new Map<string, number>();
  for (const round of group.rounds.filter((r) => r.status !== "CLOSED")) {
    const recipient = members.find((m) => m.id === round.recipientSlotId);
    if (!recipient) continue;
    // Only the open round knows what its recipient has paid; later rounds assume a full contribution.
    const assumed = round.status === "OPEN" ? members : members.map((m) => ({ ...m, approved: Number(group.contribution) }));
    const result = processPayout({
      contribution: Number(group.contribution),
      pot: Number(group.pot),
      rate: group.interestRate,
      feeRate: group.organizerFeeRate,
      recipientId: recipient.id,
      members: assumed,
    });
    projections.set(round.recipientSlotId, result.recipient.netPayout);
  }
  return projections;
}

/**
 * §15.1 for one paluwagan: the open round's health and projected payout, the money overview, the
 * collection rate per closed round (and, still to close, the open round so far and later rounds
 * paid ahead, R-DEC-31), and each member's reliability (on time, partial, missed).
 * Also the viewer's own projected payout (§15.3). Everyone sees it (R-DEC-06).
 */
export async function groupStats(groupId: string, viewerUserId: string) {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: { slots: { include: { user: true } }, rounds: { include: { results: true, payout: true }, orderBy: { number: "asc" } } },
  });
  const viewer = group.slots.find((s) => s.userId === viewerUserId)!;
  const contribution = Number(group.contribution);
  const expected = contribution * group.slotCount;
  const open = group.rounds.find((r) => r.status === "OPEN");
  const [projections, summary] = await Promise.all([projectedPayouts(groupId), completionSummary(groupId)]);

  let openRound = null;
  if (open) {
    const approved = (
      await Promise.all(group.slots.map((s) => periodTotals(prisma, s.id, open.id)))
    ).reduce((total, t) => total + Math.min(t.approved, contribution), 0);
    openRound = {
      number: open.number,
      periodStart: toCalendarDate(open.periodStart),
      payoutDate: toCalendarDate(open.payoutDate),
      health: roundHealth({
        approved,
        expected,
        periodStart: toCalendarDate(open.periodStart),
        payoutDate: toCalendarDate(open.payoutDate),
        today: todayInManila(),
      }),
      projectedPayout: projections.get(open.recipientSlotId) ?? null,
    };
  }

  const closed = group.rounds.filter((r) => r.status === "CLOSED");
  const bar = (r: (typeof group.rounds)[number], approved: number) => ({
    round: r.number,
    payoutDate: toCalendarDate(r.payoutDate),
    status: r.status,
    approved,
    expected,
    rate: expected ? approved / expected : 0,
  });
  // Rounds still to close: approved money so far, the open round's and what was paid ahead
  // (R-DEC-31). Upcoming rounds show up to the last one with anything in it.
  const later = group.rounds.filter((r) => r.status !== "CLOSED");
  const laterRows = await prisma.submission.findMany({
    where: { roundId: { in: later.map((r) => r.id) }, status: "APPROVED", appliedAs: "CONTRIBUTION" },
    select: { roundId: true, slotId: true, amount: true, effectiveAmount: true },
  });
  const laterBars = later.map((r) => {
    const bySlot = new Map<string, number>();
    for (const row of laterRows.filter((x) => x.roundId === r.id)) {
      bySlot.set(row.slotId, (bySlot.get(row.slotId) ?? 0) + Number(row.effectiveAmount ?? row.amount));
    }
    return bar(r, [...bySlot.values()].reduce((total, paid) => total + Math.min(paid, contribution), 0));
  });
  const lastPaidAhead = laterBars.reduce((last, b, i) => (b.status === "UPCOMING" && b.approved > 0 ? i : last), -1);
  const collection = [
    ...closed.map((r) => bar(r, r.results.reduce((total, x) => total + Math.min(Number(x.approved), Number(x.due)), 0))),
    ...laterBars.filter((b, i) => b.status === "OPEN" || i <= lastPaidAhead),
  ];
  const reliability = group.slots.map((slot) => {
    const results = closed.flatMap((r) => r.results.filter((x) => x.slotId === slot.id));
    return {
      slotId: slot.id,
      name: slotName(slot),
      onTime: results.filter((x) => x.approved >= x.due).length,
      partial: results.filter((x) => x.approved > 0n && x.approved < x.due).length,
      missed: results.filter((x) => x.approved === 0n).length,
    };
  });
  const unpaidRounds = group.rounds.filter((r) => !r.payout || r.payout.status === "AWAITING_HANDOVER").length;
  const myRound = group.rounds.find((r) => r.recipientSlotId === viewer.id);

  return {
    openRound,
    money: {
      collected: summary.totals.collected,
      paidOut: summary.totals.paidOut,
      // Pots not yet handed over, at their full size.
      toPayOut: unpaidRounds * Number(group.pot),
      coveredByOrganizer: summary.totals.coveredByOrganizer,
      owedToOrganizer: summary.totals.debtOutstanding,
      refunds: summary.totals.refunds,
      /** R-DEC-39: organizing fees, outside the pot. */
      fees: summary.totals.fees,
    },
    collection,
    reliability,
    myTurn: myRound
      ? {
          round: myRound.number,
          payoutDate: toCalendarDate(myRound.payoutDate),
          status: myRound.payout ? myRound.payout.status : myRound.status === "OPEN" ? "COLLECTING" : "UPCOMING",
          net: myRound.payout ? Number(myRound.payout.net) : null,
          projected: myRound.payout ? null : (projections.get(viewer.id) ?? null),
        }
      : null,
  };
}

/** §15.3 "My history": one slot's events, inherited ones labeled. Members see their own; the organizer any. */
export async function slotHistory(groupId: string, viewerUserId: string, slotId?: string) {
  const slots = await prisma.slot.findMany({ where: { groupId } });
  const viewer = slots.find((s) => s.userId === viewerUserId)!;
  const slot = slots.find((s) => s.id === (slotId ?? viewer.id));
  if (!slot) throw notFound("Slot");
  if (slot.id !== viewer.id && !viewer.isOrganizer) throw forbidden("You can only see your own history.");
  const events = await recordEvents(groupId, slot.id);
  return {
    slotId: slot.id,
    claimedAt: slot.claimedAt?.toISOString() ?? null,
    events: events.reverse().map((e) => ({ ...e, at: e.at.toISOString() })),
  };
}

/** §15.2: the member's home across every paluwagan: what's due soon, what's waiting on them, each group's standing. */
export async function homeDashboard(userId: string) {
  const mySlots = await prisma.slot.findMany({
    where: { userId, group: { state: { not: "CANCELLED" } } },
    include: {
      group: {
        include: {
          rounds: { include: { payout: true }, orderBy: { number: "asc" } },
          slots: { include: { user: true } },
          swaps: { where: { status: { in: ["AWAITING_TARGET", "AWAITING_ORGANIZER"] } } },
        },
      },
    },
  });

  const groups = [];
  const due = [];

  for (const slot of mySlots) {
    const group = slot.group;
    const contribution = Number(group.contribution);
    const open = group.rounds.find((r) => r.status === "OPEN");
    const standing = open ? await periodTotals(prisma, slot.id, open.id) : null;
    // R-SUB-06 / R-DEC-29: pending corrections hold their increases, as in the pay form.
    const reportable = standing ? submissionCap(contribution, standing.approved, standing.pending + standing.pendingIncrease) : 0;
    const owed = outstanding(debtOf(slot));
    const myRound = group.rounds.find((r) => r.recipientSlotId === slot.id);

    // Things only this person can move forward.
    const [toReview, disputesToReview] = slot.isOrganizer
      ? await Promise.all([
          // R-DEC-33: a payment split across rounds is one review.
          prisma.submission
            .findMany({ where: { groupId: group.id, status: "PENDING" }, select: { batchId: true } })
            .then((rows) => {
              const batches = new Set(rows.map((r) => r.batchId).filter(Boolean));
              return rows.filter((r) => !r.batchId).length + batches.size;
            }),
          prisma.dispute.count({ where: { groupId: group.id, status: "PENDING" } }),
        ])
      : [0, 0];
    const speaksFor = (slotId: string) => {
      const s = group.slots.find((x) => x.id === slotId);
      return !!s && (s.id === slot.id || (slot.isOrganizer && !s.userId));
    };
    const waiting = {
      reviews: toReview + disputesToReview + (slot.isOrganizer ? group.swaps.filter((s) => s.status === "AWAITING_ORGANIZER").length : 0),
      swapsToAnswer: group.swaps.filter((s) => s.status === "AWAITING_TARGET" && speaksFor(s.targetSlotId)).length,
      payoutsToHandOver: slot.isOrganizer ? group.rounds.filter((r) => r.payout?.status === "AWAITING_HANDOVER").length : 0,
      receiptsToConfirm: group.rounds.filter((r) => r.recipientSlotId === slot.id && r.payout?.status === "HANDED_OVER").length,
      placeholdersToRecord: 0,
      membersToRemind: 0,
    };
    // The organizer's collection tasks, on the same terms as the group page's To do list.
    if (slot.isOrganizer && open) {
      const period = await openPeriodView(prisma, group.id, contribution);
      const userOf = new Map(group.slots.map((s) => [s.id, s.userId]));
      // Placeholders pay the organizer outside the app; the organizer records it for them (R-SUB-02).
      waiting.placeholdersToRecord =
        period?.slots.filter((s) => !userOf.get(s.slotId) && s.due - s.approved - s.pending > 0).length ?? 0;
      // Late payers once the reminder window opens (§12), not reminded in the last day.
      if (daysBetween(todayInManila(), toCalendarDate(open.payoutDate)) <= REMINDER_DAYS_BEFORE) {
        waiting.membersToRemind =
          period?.slots.filter(
            (s) =>
              !!userOf.get(s.slotId) &&
              s.slotId !== slot.id &&
              s.status !== "PAID" &&
              s.pending === 0 &&
              !s.remindedRecently,
          ).length ?? 0;
      }
    }

    groups.push({
      id: group.id,
      name: group.name,
      state: group.state,
      isOrganizer: slot.isOrganizer,
      contribution,
      frequencyLabel: frequencyLabel(group.frequency, group.intervalDays),
      slotCount: group.slotCount,
      occupied: group.slots.length,
      startDate: toCalendarDate(group.startDate),
      openRound: open ? { number: open.number, payoutDate: toCalendarDate(open.payoutDate) } : null,
      myStanding: standing ? { due: contribution, approved: standing.approved, pending: standing.pending, reportable } : null,
      myTurn: myRound
        ? { round: myRound.number, payoutDate: toCalendarDate(myRound.payoutDate), paid: !!myRound.payout && myRound.payout.status !== "AWAITING_HANDOVER" }
        : null,
      owed,
      waiting,
    });

    if (open && reportable > 0) {
      due.push({ groupId: group.id, groupName: group.name, kind: "CONTRIBUTION" as const, amount: reportable, dueDate: toCalendarDate(open.payoutDate), round: open.number });
    }
    if (owed > 0) {
      due.push({ groupId: group.id, groupName: group.name, kind: "DEBT" as const, amount: owed, dueDate: null, round: null });
    }
  }

  // Contributions by due date first, then debts.
  due.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  return { groups, due };
}
