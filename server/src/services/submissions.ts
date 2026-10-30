import { randomUUID } from "node:crypto";
import type { SubmissionType } from "@prisma/client";
import { NOTE_MAX_LENGTH } from "../domain/constants.js";
import { outstanding } from "../domain/debt.js";
import { can } from "../domain/lifecycle.js";
import { formatPeso } from "../domain/money.js";
import {
  contributionApprovalError,
  contributionAmountError,
  contributionRooms,
  correctionIncrease,
  periodStatus,
  roundsLabel,
  splitContribution,
  submissionAmountError,
  submissionCap,
} from "../domain/submissions.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { isProofPathFor, proofExists, proofViewUrls } from "../lib/storage.js";
import { debtOf, groupHasDebt, repayDebt } from "./debts.js";
import { lastRemindedAt } from "./reminders.js";
import { notifyUsers } from "./notifications.js";
import { memberUserIds } from "./common.js";
import { slotName, withGroupLock, type Db } from "./common.js";

const sum = (rows: { amount: bigint; effectiveAmount: bigint | null }[]) =>
  rows.reduce((total, r) => total + Number(r.effectiveAmount ?? r.amount), 0);

/**
 * Approved and pending contribution totals for one slot in one period (R-SUB-06, R-SUB-07), and
 * the increases its pending corrections ask for (R-DEC-29), less the one `exceptDisputeId` names.
 */
export async function periodTotals(db: Db, slotId: string, roundId: string, exceptDisputeId?: string) {
  const [rows, disputes] = await Promise.all([
    db.submission.findMany({
      where: { slotId, roundId, type: "CONTRIBUTION", status: { in: ["APPROVED", "PENDING"] } },
      select: { status: true, amount: true, effectiveAmount: true, appliedAs: true },
    }),
    db.dispute.findMany({
      where: { slotId, status: "PENDING", submission: { roundId }, ...(exceptDisputeId ? { id: { not: exceptDisputeId } } : {}) },
      select: { previousAmount: true, proposedAmount: true },
    }),
  ]);
  const approved = rows.filter((r) => r.status === "APPROVED" && r.appliedAs !== "DEBT_PAYMENT");
  const pending = rows.filter((r) => r.status === "PENDING");
  const pendingIncrease = disputes.reduce(
    (total, d) => total + correctionIncrease(Number(d.previousAmount), Number(d.proposedAmount)),
    0,
  );
  return { approved: sum(approved), pending: sum(pending), pendingCount: pending.length, pendingIncrease };
}

/**
 * Pending money that will go to a slot's debt once approved: debt payments, and contributions for
 * periods that have already closed (R-DBT-06, R-DEC-04). Counts against the debt-payment cap.
 */
async function pendingAgainstDebt(db: Db, slotId: string) {
  const rows = await db.submission.findMany({
    where: {
      slotId,
      status: "PENDING",
      OR: [{ type: "DEBT_PAYMENT" }, { type: "CONTRIBUTION", round: { status: "CLOSED" } }],
    },
    select: { amount: true, effectiveAmount: true },
  });
  return sum(rows);
}

async function openRound(db: Db, groupId: string) {
  const round = await db.round.findFirst({ where: { groupId, status: "OPEN" } });
  if (!round) throw conflict("No contribution period is open right now.", "NO_OPEN_PERIOD");
  return round;
}

function trimmedNote(note: string | undefined, label: string) {
  const text = note?.trim() || null;
  if (text && text.length > NOTE_MAX_LENGTH) throw badRequest(`${label} can be up to ${NOTE_MAX_LENGTH} characters.`);
  return text;
}

/**
 * Room still free in each of a slot's `rounds` under the room rule (R-DEC-29): contribution less
 * approved and pending contributions and the increases pending corrections ask for.
 */
async function roomsFor(db: Db, slotId: string, rounds: { id: string; number: number }[], contribution: number) {
  const roundIds = rounds.map((r) => r.id);
  const [rows, disputes] = await Promise.all([
    db.submission.findMany({
      where: { slotId, roundId: { in: roundIds }, type: "CONTRIBUTION", status: { in: ["APPROVED", "PENDING"] } },
      select: { roundId: true, status: true, amount: true, effectiveAmount: true, appliedAs: true },
    }),
    db.dispute.findMany({
      where: { slotId, status: "PENDING", submission: { roundId: { in: roundIds } } },
      select: { previousAmount: true, proposedAmount: true, submission: { select: { roundId: true } } },
    }),
  ]);
  return rounds.map((round) => {
    const mine = rows.filter((r) => r.roundId === round.id);
    const approved = sum(mine.filter((r) => r.status === "APPROVED" && r.appliedAs !== "DEBT_PAYMENT"));
    const waiting =
      sum(mine.filter((r) => r.status === "PENDING")) +
      disputes
        .filter((d) => d.submission.roundId === round.id)
        .reduce((total, d) => total + correctionIncrease(Number(d.previousAmount), Number(d.proposedAmount)), 0);
    return { round: round.number, room: submissionCap(contribution, approved, waiting) };
  });
}

/**
 * R-SUB-01 / R-SUB-02 / R-SUB-06: report a payment. A CONTRIBUTION fills what's left of the open
 * period, then later ones once the slot's debt is covered (paying ahead, R-DEC-31); a payment that
 * reaches more than one round is stored as one submission per round, linked by a batch (R-DEC-33).
 * A DEBT_PAYMENT pays down what the slot owes (R-DBT-04), also after completion (R-DBT-11). Members
 * report their own; the organizer reports for themselves and for placeholders. All start PENDING.
 */
export async function submitPayment(
  groupId: string,
  actorUserId: string,
  input: { slotId: string; type: SubmissionType; amount: number; proofPath?: string; note?: string },
) {
  const note = trimmedNote(input.note, "Notes");
  if (input.proofPath) {
    if (!isProofPathFor(groupId, input.proofPath)) throw badRequest("That proof doesn't belong to this paluwagan.");
    if (!(await proofExists(input.proofPath))) throw badRequest("The proof didn't finish uploading. Attach it again.");
  }

  return withGroupLock(groupId, async (tx, group) => {
    const isDebt = input.type === "DEBT_PAYMENT";
    if (isDebt ? !can.submitDebtPayment(group.state) : !can.submitContribution(group.state)) {
      throw conflict(isDebt ? "There's no debt to pay in this paluwagan." : "Payments open once the paluwagan starts.", "WRONG_STATE");
    }
    const open = isDebt ? null : await openRound(tx, groupId);
    const [actor, slot] = await Promise.all([
      tx.slot.findFirstOrThrow({ where: { groupId, userId: actorUserId } }),
      tx.slot.findFirst({ where: { id: input.slotId, groupId }, include: { user: true } }),
    ]);
    if (!slot) throw notFound("Slot");
    const ownSlot = slot.id === actor.id;
    if (!ownSlot && !(actor.isOrganizer && !slot.userId)) {
      throw forbidden("You can report payments for your own slot only.");
    }

    const debtLeft = submissionCap(outstanding(debtOf(slot)), 0, await pendingAgainstDebt(tx, slot.id));
    let parts: { roundId: string | null; round: number | null; amount: number }[];
    if (open) {
      const rounds = await tx.round.findMany({
        where: { groupId, status: { in: ["OPEN", "UPCOMING"] } },
        orderBy: { number: "asc" },
        select: { id: true, number: true },
      });
      const rooms = await roomsFor(tx, slot.id, rounds, Number(group.contribution));
      const openRoom = rooms.find((r) => r.round === open.number)!;
      const fillable = contributionRooms({ open: openRoom, upcoming: rooms.filter((r) => r !== openRoom), debtLeft });
      const cap = fillable.reduce((total, r) => total + r.room, 0);
      // Paying ahead would be possible but for the debt: say so (R-DEC-31).
      const blockedByDebt = debtLeft > 0 && rooms.some((r) => r !== openRoom && r.room > 0);
      const error = contributionAmountError(input.amount, cap, blockedByDebt);
      if (error) throw new AppError(400, error, "BAD_AMOUNT", { amount: error });
      const idOf = new Map(rounds.map((r) => [r.number, r.id]));
      parts = splitContribution(input.amount, fillable).map((p) => ({ ...p, roundId: idOf.get(p.round)! }));
    } else {
      const error = submissionAmountError(input.amount, debtLeft);
      if (error) throw new AppError(400, error, "BAD_AMOUNT", { amount: error });
      parts = [{ roundId: null, round: null, amount: input.amount }];
    }

    const batchId = parts.length > 1 ? randomUUID() : null;
    for (const part of parts) {
      await tx.submission.create({
        data: {
          groupId,
          slotId: slot.id,
          roundId: part.roundId,
          type: input.type,
          amount: BigInt(part.amount),
          proofPath: input.proofPath,
          note,
          submittedById: actorUserId,
          batchId,
        },
      });
    }
    const rounds = parts.flatMap((p) => (p.round == null ? [] : [p.round]));
    const ahead = !!open && rounds.some((r) => r !== open.number);
    await audit(tx, {
      groupId,
      actorUserId,
      action: "submission.created",
      targetSlotId: slot.id,
      targetName: slotName(slot),
      amounts: { amount: input.amount },
      after: {
        type: input.type,
        round: rounds[0] ?? null,
        ...(batchId ? { rounds, parts: parts.map((p) => p.amount) } : {}),
        ...(ahead ? { ahead: true } : {}),
      },
      proofAttached: !!input.proofPath,
    });
    // The organizer reviews everything (R-SUB-03); they don't need telling about their own reports.
    if (!actor.isOrganizer) {
      await notifyUsers(tx, [group.organizerId], {
        groupId,
        kind: "submission.pending",
        title: `${slotName(slot)} reported ${formatPeso(input.amount)}${
          isDebt ? " toward their debt" : batchId ? ` for ${roundsLabel(rounds)}` : ahead ? " ahead" : ""
        }`,
        body: `${group.name}${rounds.length === 1 ? `, round ${rounds[0]}` : ""}. ${
          input.proofPath ? "Proof attached." : "No proof attached."
        }`,
      });
    }
  });
}

/**
 * R-SUB-04 / R-SUB-05 / R-SUB-09: the organizer approves or denies a pending submission. Several
 * pending submissions for one member and period are reviewed in the order they came in. A payment
 * split across rounds is decided as one: every part, or none (R-DEC-33).
 */
export async function reviewSubmission(
  groupId: string,
  reviewerUserId: string,
  submissionId: string,
  decision: { approve: true } | { approve: false; reason: string },
) {
  // `=== false`, not truthiness: Vercel compiles the function non-strict, where only this narrows the union.
  const reason = decision.approve === false ? trimmedNote(decision.reason, "The reason") : null;
  if (!decision.approve && !reason) throw badRequest("Say why, so the member knows what to fix.");

  return withGroupLock(groupId, async (tx, group) => {
    const submission = await tx.submission.findFirst({
      where: { id: submissionId, groupId },
      include: { slot: { include: { user: true } }, round: true },
    });
    if (!submission) throw notFound("Submission");
    if (submission.status !== "PENDING") throw conflict("This submission was already handled.", "ALREADY_REVIEWED");
    const name = slotName(submission.slot);
    const { batchId } = submission;
    // R-DEC-33: every part of a split payment, in round order.
    const parts = batchId
      ? (await tx.submission.findMany({ where: { batchId, status: "PENDING" }, include: { round: true } })).sort(
          (a, b) => (a.round?.number ?? 0) - (b.round?.number ?? 0),
        )
      : [submission];

    for (const part of parts) {
      const earlier = await tx.submission.findFirst({
        where: {
          slotId: part.slotId,
          roundId: part.roundId,
          type: part.type,
          status: "PENDING",
          submittedAt: { lt: part.submittedAt },
          ...(batchId ? { OR: [{ batchId: null }, { batchId: { not: batchId } }] } : {}),
        },
      });
      if (earlier) throw conflict(`Review ${name}'s earlier submission first.`, "REVIEW_IN_ORDER");
    }

    const amount = parts.reduce((total, p) => total + Number(p.amount), 0);
    const rounds = parts.flatMap((p) => (p.round ? [p.round.number] : []));
    // Debt payments, and contributions for a period that already closed, pay down debt (R-DBT-06,
    // R-DEC-04): interest first, then principal (R-DBT-05).
    const toDebtOf = (part: (typeof parts)[number]) => part.type === "DEBT_PAYMENT" || part.round?.status === "CLOSED";
    // What the parts paid toward debt, added up.
    const repaid = { toInterest: 0, toPrincipal: 0, remaining: 0, any: false };
    if (decision.approve) {
      for (const part of parts) {
        const partAmount = Number(part.amount);
        if (toDebtOf(part)) {
          // Fresh each time: an earlier part may have paid some of it down.
          const slot = await tx.slot.findUniqueOrThrow({ where: { id: part.slotId } });
          const paid = await repayDebt(tx, slot, partAmount, part.id);
          if (!paid) {
            // R-DEC-19
            const owed = outstanding(debtOf(slot));
            throw conflict(
              owed > 0
                ? `${name} only owes ${formatPeso(owed)} now, so this can't be approved. Deny it instead.`
                : `${name} doesn't owe anything now, so this can't be approved. Deny it instead.`,
              "MORE_THAN_OWED",
            );
          }
          repaid.toInterest += paid.toInterest;
          repaid.toPrincipal += paid.toPrincipal;
          repaid.remaining = paid.remaining;
          repaid.any = true;
        } else if (part.type === "CONTRIBUTION" && part.roundId) {
          // R-DEC-29: an earlier approval or a problem-report increase may have filled the period.
          const { approved } = await periodTotals(tx, part.slotId, part.roundId);
          const error = contributionApprovalError(name, partAmount, approved, Number(group.contribution));
          // Name the round when it's one of several parts.
          if (error) throw conflict(rounds.length > 1 ? `Round ${part.round!.number}: ${error}` : error, "MORE_THAN_DUE");
        }
      }
    }

    const selfApproved = decision.approve && submission.submittedById === reviewerUserId;
    for (const part of parts) {
      await tx.submission.update({
        where: { id: part.id },
        data: decision.approve
          ? {
              status: "APPROVED",
              appliedAs: toDebtOf(part) ? "DEBT_PAYMENT" : "CONTRIBUTION",
              effectiveAmount: part.amount,
              reviewedById: reviewerUserId,
              reviewedAt: new Date(),
              selfApproved,
            }
          : { status: "DENIED", denialReason: reason, reviewedById: reviewerUserId, reviewedAt: new Date() },
      });
    }
    const allToDebt = parts.every(toDebtOf);
    const repayment = repaid.any ? repaid : null;

    await audit(tx, {
      groupId,
      actorUserId: reviewerUserId,
      action: decision.approve ? "submission.approved" : "submission.denied",
      targetSlotId: submission.slotId,
      targetName: name,
      amounts: repayment
        ? { amount, toInterest: repayment.toInterest, toPrincipal: repayment.toPrincipal }
        : { amount },
      after: decision.approve
        ? {
            round: rounds[0] ?? null,
            ...(batchId ? { rounds } : {}),
            appliedAs: allToDebt ? "DEBT_PAYMENT" : "CONTRIBUTION",
          }
        : { reason },
      proofAttached: !!submission.proofPath,
      selfApproved,
    });
    // Tell whoever reported it, unless that's the reviewer.
    if (submission.submittedById !== reviewerUserId) {
      const owes = repayment
        ? repayment.remaining > 0
          ? `You still owe ${formatPeso(repayment.remaining)}.`
          : "Your debt is fully paid."
        : "";
      await notifyUsers(tx, [submission.submittedById], {
        groupId,
        kind: decision.approve ? "submission.approved" : "submission.denied",
        title: decision.approve
          ? `Your ${formatPeso(amount)} payment was approved`
          : `Your ${formatPeso(amount)} payment wasn't approved`,
        body: !decision.approve
          ? `Reason: ${reason}`
          : repayment && allToDebt
            ? `It went toward your debt. ${owes}`
            : `${group.name}, ${roundsLabel(rounds)}.${repayment ? ` Part went toward your debt. ${owes}` : ""}`,
      });
    }
    // R-CMP-03: the last debt settled after completion closes the books.
    if (repayment && group.state === "COMPLETED_WITH_OUTSTANDING_DEBT" && !(await groupHasDebt(tx, groupId))) {
      await tx.group.update({ where: { id: groupId }, data: { state: "COMPLETED" } });
      await audit(tx, { groupId, actorUserId: null, action: "group.completed", after: { outstandingDebt: false } });
      await notifyUsers(tx, await memberUserIds(tx, groupId), {
        groupId,
        kind: "group.completed",
        title: `${group.name} is fully settled`,
        body: "Every debt has been paid.",
      });
    }
  });
}

/** R-SUB-04: the submitter can withdraw a submission while it's still pending; a split payment as one (R-DEC-33). */
export async function cancelSubmission(groupId: string, userId: string, submissionId: string) {
  return withGroupLock(groupId, async (tx) => {
    const submission = await tx.submission.findFirst({
      where: { id: submissionId, groupId },
      include: { slot: { include: { user: true } } },
    });
    if (!submission) throw notFound("Submission");
    if (submission.submittedById !== userId) throw forbidden("Only whoever reported it can withdraw it.");
    if (submission.status !== "PENDING") throw conflict("Only pending submissions can be withdrawn.", "ALREADY_REVIEWED");
    const parts = submission.batchId
      ? await tx.submission.findMany({ where: { batchId: submission.batchId, status: "PENDING" } })
      : [submission];
    await tx.submission.updateMany({
      where: { id: { in: parts.map((p) => p.id) } },
      data: { status: "CANCELLED", reviewedAt: new Date() },
    });
    await audit(tx, {
      groupId,
      actorUserId: userId,
      action: "submission.cancelled",
      targetSlotId: submission.slotId,
      targetName: slotName(submission.slot),
      amounts: { amount: parts.reduce((total, p) => total + Number(p.amount), 0) },
    });
  });
}

/** Each slot's standing in the open period (R-SUB-07), for the group page. */
export async function openPeriodView(db: Db, groupId: string, contribution: number) {
  const round = await db.round.findFirst({ where: { groupId, status: "OPEN" } });
  if (!round) return null;
  const [slots, submissions, disputes] = await Promise.all([
    db.slot.findMany({ where: { groupId }, select: { id: true } }),
    db.submission.findMany({
      where: { roundId: round.id, type: "CONTRIBUTION", status: { in: ["APPROVED", "PENDING"] } },
      select: { slotId: true, status: true, amount: true, effectiveAmount: true, appliedAs: true },
    }),
    db.dispute.findMany({
      where: { status: "PENDING", submission: { roundId: round.id } },
      select: { slotId: true, previousAmount: true, proposedAmount: true },
    }),
  ]);
  const reminded = await lastRemindedAt(round.id);
  const bySlot = slots.map(({ id }) => {
    const mine = submissions.filter((s) => s.slotId === id);
    const approved = sum(mine.filter((s) => s.status === "APPROVED" && s.appliedAs !== "DEBT_PAYMENT"));
    const pendingRows = mine.filter((s) => s.status === "PENDING");
    return {
      slotId: id,
      due: contribution,
      approved,
      pending: sum(pendingRows),
      /** R-DEC-29: the increases this slot's pending corrections ask for; they hold room like pending payments. */
      pendingIncrease: disputes
        .filter((d) => d.slotId === id)
        .reduce((total, d) => total + correctionIncrease(Number(d.previousAmount), Number(d.proposedAmount)), 0),
      ...periodStatus(contribution, approved, pendingRows.length),
      /** Last time the organizer sent this slot a reminder this round. */
      remindedAt: reminded.get(id) ?? null,
      /** Reminded within the last day, so another reminder isn't allowed yet (§15.1). */
      remindedRecently: !!reminded.get(id) && Date.now() - Date.parse(reminded.get(id)!) < 24 * 3_600_000,
    };
  });
  return {
    roundId: round.id,
    number: round.number,
    periodStart: round.periodStart.toISOString().slice(0, 10),
    payoutDate: round.payoutDate.toISOString().slice(0, 10),
    recipientSlotId: round.recipientSlotId,
    expected: contribution * slots.length,
    approvedTotal: bySlot.reduce((total, s) => total + Math.min(s.approved, s.due), 0),
    pendingTotal: bySlot.reduce((total, s) => total + s.pending, 0),
    slots: bySlot,
  };
}

/**
 * R-DEC-31: what each slot has paid ahead, per round that hasn't opened yet, so the pay form can say
 * what's left in each. Only rounds with something in them are listed. Amounts are public (R-DEC-06).
 */
export async function aheadView(db: Db, groupId: string) {
  const [submissions, disputes] = await Promise.all([
    db.submission.findMany({
      where: { groupId, type: "CONTRIBUTION", status: { in: ["APPROVED", "PENDING"] }, round: { status: "UPCOMING" } },
      select: { slotId: true, status: true, amount: true, effectiveAmount: true, round: { select: { number: true } } },
    }),
    db.dispute.findMany({
      where: { groupId, status: "PENDING", submission: { round: { status: "UPCOMING" } } },
      select: {
        slotId: true,
        previousAmount: true,
        proposedAmount: true,
        submission: { select: { round: { select: { number: true } } } },
      },
    }),
  ]);
  type Row = { slotId: string; round: number; approved: number; pending: number; pendingIncrease: number };
  const rows = new Map<string, Row>();
  const rowOf = (slotId: string, round: number) => {
    const key = `${slotId}:${round}`;
    if (!rows.has(key)) rows.set(key, { slotId, round, approved: 0, pending: 0, pendingIncrease: 0 });
    return rows.get(key)!;
  };
  for (const s of submissions) {
    const row = rowOf(s.slotId, s.round!.number);
    row[s.status === "APPROVED" ? "approved" : "pending"] += Number(s.effectiveAmount ?? s.amount);
  }
  for (const d of disputes) {
    rowOf(d.slotId, d.submission.round!.number).pendingIncrease += correctionIncrease(
      Number(d.previousAmount),
      Number(d.proposedAmount),
    );
  }
  return [...rows.values()].sort((a, b) => a.round - b.round);
}

/**
 * Submissions this viewer may see (the open period's, anything pending, and debt payments): all of
 * them for the organizer, their own slot's for a member. Others' amounts and statuses are public through the period view and the
 * audit log; proof photos stay with the submitter and the organizer, since screenshots can carry
 * account details.
 */
export async function visibleSubmissions(
  db: Db,
  groupId: string,
  openRoundId: string | null,
  viewer: { userId: string; slotId: string; isOrganizer: boolean },
) {
  const rows = await db.submission.findMany({
    where: {
      groupId,
      ...(viewer.isOrganizer ? {} : { slotId: viewer.slotId }),
      // This period's, later periods' (paid ahead, R-DEC-31), anything still waiting, everything that
      // went toward debt, and anything ever disputed (so the dispute's outcome stays visible after the
      // period closes).
      OR: [
        ...(openRoundId ? [{ roundId: openRoundId }] : []),
        { round: { status: "UPCOMING" as const } },
        { status: "PENDING" },
        { type: "DEBT_PAYMENT" },
        { appliedAs: "DEBT_PAYMENT" },
        { disputes: { some: {} } },
      ],
    },
    include: { round: { select: { number: true } } },
    orderBy: { submittedAt: "asc" },
  });
  const urls = await proofViewUrls(rows.filter((r) => r.proofPath).map((r) => r.proofPath!)).catch(
    () => new Map<string, string>(),
  );
  return rows.map((r) => ({
    id: r.id,
    slotId: r.slotId,
    round: r.round?.number ?? null,
    type: r.type,
    /** How an approved submission counted: a late contribution counts as a DEBT_PAYMENT. */
    appliedAs: r.appliedAs,
    amount: Number(r.amount),
    effectiveAmount: r.effectiveAmount == null ? null : Number(r.effectiveAmount),
    status: r.status,
    note: r.note,
    proofAttached: !!r.proofPath,
    proofUrl: r.proofPath ? (urls.get(r.proofPath) ?? null) : null,
    submittedAt: r.submittedAt.toISOString(),
    /** Reported by the viewer, so they may withdraw it while pending. */
    mine: r.submittedById === viewer.userId,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    denialReason: r.denialReason,
    selfApproved: r.selfApproved,
    /** R-DEC-33: shared by the parts of one payment split across rounds; null otherwise. */
    batchId: r.batchId,
  }));
}
