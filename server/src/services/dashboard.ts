import { roundHealth } from "../domain/health.js";
import { outstanding } from "../domain/debt.js";
import { processPayout } from "../domain/payout.js";
import { frequencyLabel } from "../domain/setup.js";
import { forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { todayInManila, toCalendarDate } from "../lib/today.js";
import { slotName } from "./common.js";
import { debtOf } from "./debts.js";
import { completionSummary, recordEvents } from "./records.js";
import { periodTotals } from "./submissions.js";

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
      recipientId: recipient.id,
      members: assumed,
    });
    projections.set(round.recipientSlotId, result.recipient.netPayout);
  }
  return projections;
}

/**
 * §15.1 for one paluwagan: the open round's health and projected payout, the money overview, the
 * collection rate per closed round, and each member's reliability (on time, partial, missed).
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
  const collection = closed.map((r) => {
    const approved = r.results.reduce((total, x) => total + Math.min(Number(x.approved), Number(x.due)), 0);
    return { round: r.number, payoutDate: toCalendarDate(r.payoutDate), approved, expected, rate: expected ? approved / expected : 0 };
  });
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

/**
 * §15.2: the member's home across every paluwagan: what's due soon, what's waiting on them, each
 * group's standing, their payouts, and money totals (also the Money page).
 */
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
  const payouts = [];
  const debts = [];
  const owedToMe = [];
  const totals = { contributed: 0, received: 0, owed: 0, owedToMe: 0, refundsToMe: 0, refundsIOwe: 0 };

  for (const slot of mySlots) {
    const group = slot.group;
    const contribution = Number(group.contribution);
    const open = group.rounds.find((r) => r.status === "OPEN");
    const standing = open ? await periodTotals(prisma, slot.id, open.id) : null;
    const reportable = standing ? Math.max(0, contribution - standing.approved - standing.pending) : 0;
    const owed = outstanding(debtOf(slot));
    const myRound = group.rounds.find((r) => r.recipientSlotId === slot.id);
    const summary = group.state === "LOBBY" || group.state === "LAUNCHED" ? null : await completionSummary(group.id);
    const mine = summary?.members.find((m) => m.slotId === slot.id);

    // Things only this person can move forward.
    const [toReview, disputesToReview] = slot.isOrganizer
      ? await Promise.all([
          prisma.submission.count({ where: { groupId: group.id, status: "PENDING" } }),
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
    };

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
      debts.push({ groupId: group.id, groupName: group.name, principal: Number(slot.debtPrincipal), interest: Number(slot.debtInterest) });
      due.push({ groupId: group.id, groupName: group.name, kind: "DEBT" as const, amount: owed, dueDate: null, round: null });
    }
    if (myRound) {
      payouts.push({
        groupId: group.id,
        groupName: group.name,
        round: myRound.number,
        payoutDate: toCalendarDate(myRound.payoutDate),
        status: myRound.payout?.status ?? (myRound.status === "OPEN" ? "COLLECTING" : group.state === "LOBBY" ? "NOT_STARTED" : "UPCOMING"),
        net: myRound.payout ? Number(myRound.payout.net) : null,
      });
    }
    if (slot.isOrganizer && summary) {
      for (const member of summary.members.filter((m) => m.slotId !== slot.id && m.debtOutstanding > 0)) {
        owedToMe.push({ groupId: group.id, groupName: group.name, name: member.name, amount: member.debtOutstanding });
      }
      totals.owedToMe += summary.members.filter((m) => m.slotId !== slot.id).reduce((t, m) => t + m.debtOutstanding, 0);
      totals.refundsIOwe += summary.totals.refunds;
    }
    totals.contributed += mine?.contributed ?? 0;
    totals.received += mine?.received ?? 0;
    totals.owed += owed;
    totals.refundsToMe += mine?.refunds ?? 0;
  }

  // Contributions by due date first, then debts.
  due.sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
  payouts.sort((a, b) => a.payoutDate.localeCompare(b.payoutDate));
  return { groups, due, payouts, debts, owedToMe, totals };
}
