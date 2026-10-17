import type { SubmissionType } from "@prisma/client";
import { NOTE_MAX_LENGTH } from "../domain/constants.js";
import { outstanding } from "../domain/debt.js";
import { can } from "../domain/lifecycle.js";
import { formatPeso } from "../domain/money.js";
import { contributionApprovalError, periodStatus, submissionAmountError, submissionCap } from "../domain/submissions.js";
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

/** Approved and pending contribution totals for one slot in one period (R-SUB-06, R-SUB-07). */
export async function periodTotals(db: Db, slotId: string, roundId: string) {
  const rows = await db.submission.findMany({
    where: { slotId, roundId, type: "CONTRIBUTION", status: { in: ["APPROVED", "PENDING"] } },
    select: { status: true, amount: true, effectiveAmount: true, appliedAs: true },
  });
  const approved = rows.filter((r) => r.status === "APPROVED" && r.appliedAs !== "DEBT_PAYMENT");
  const pending = rows.filter((r) => r.status === "PENDING");
  return { approved: sum(approved), pending: sum(pending), pendingCount: pending.length };
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
 * R-SUB-01 / R-SUB-02 / R-SUB-06: report a payment. A CONTRIBUTION is for the open period; a
 * DEBT_PAYMENT pays down what the slot owes (R-DBT-04), also after completion (R-DBT-11). Members
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
    const round = isDebt ? null : await openRound(tx, groupId);
    const [actor, slot] = await Promise.all([
      tx.slot.findFirstOrThrow({ where: { groupId, userId: actorUserId } }),
      tx.slot.findFirst({ where: { id: input.slotId, groupId }, include: { user: true } }),
    ]);
    if (!slot) throw notFound("Slot");
    const ownSlot = slot.id === actor.id;
    if (!ownSlot && !(actor.isOrganizer && !slot.userId)) {
      throw forbidden("You can report payments for your own slot only.");
    }

    const cap = round
      ? await (async () => {
          const totals = await periodTotals(tx, slot.id, round.id);
          return submissionCap(Number(group.contribution), totals.approved, totals.pending);
        })()
      : submissionCap(outstanding(debtOf(slot)), 0, await pendingAgainstDebt(tx, slot.id));
    const error = submissionAmountError(input.amount, cap);
    if (error) throw new AppError(400, error, "BAD_AMOUNT", { amount: error });

    const submission = await tx.submission.create({
      data: {
        groupId,
        slotId: slot.id,
        roundId: round?.id ?? null,
        type: input.type,
        amount: BigInt(input.amount),
        proofPath: input.proofPath ?? null,
        note,
        submittedById: actorUserId,
      },
    });
    await audit(tx, {
      groupId,
      actorUserId,
      action: "submission.created",
      targetSlotId: slot.id,
      targetName: slotName(slot),
      amounts: { amount: input.amount },
      after: { type: input.type, round: round?.number ?? null },
      proofAttached: !!input.proofPath,
    });
    // The organizer reviews everything (R-SUB-03); they don't need telling about their own reports.
    if (!actor.isOrganizer) {
      await notifyUsers(tx, [group.organizerId], {
        groupId,
        kind: "submission.pending",
        title: `${slotName(slot)} reported ${formatPeso(input.amount)}${isDebt ? " toward their debt" : ""}`,
        body: `${group.name}${round ? `, round ${round.number}` : ""}. ${input.proofPath ? "Proof attached." : "No proof attached."}`,
      });
    }
    return submission;
  });
}

/**
 * R-SUB-04 / R-SUB-05 / R-SUB-09: the organizer approves or denies a pending submission. Several
 * pending submissions for one member and period are reviewed in the order they came in.
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

    const earlier = await tx.submission.findFirst({
      where: {
        slotId: submission.slotId,
        roundId: submission.roundId,
        type: submission.type,
        status: "PENDING",
        submittedAt: { lt: submission.submittedAt },
      },
    });
    if (earlier) {
      throw conflict(`Review ${slotName(submission.slot)}'s earlier submission first.`, "REVIEW_IN_ORDER");
    }

    const amount = Number(submission.amount);
    // Debt payments, and contributions for a period that already closed, pay down debt (R-DBT-06,
    // R-DEC-04): interest first, then principal (R-DBT-05).
    const toDebt = submission.type === "DEBT_PAYMENT" || submission.round?.status === "CLOSED";
    let repayment: Awaited<ReturnType<typeof repayDebt>> = null;
    if (decision.approve && toDebt) {
      repayment = await repayDebt(tx, submission.slot, amount, submission.id);
      if (!repayment) {
        // R-DEC-19
        const owed = outstanding(debtOf(submission.slot));
        throw conflict(
          owed > 0
            ? `${slotName(submission.slot)} only owes ${formatPeso(owed)} now, so this can't be approved. Deny it instead.`
            : `${slotName(submission.slot)} doesn't owe anything now, so this can't be approved. Deny it instead.`,
          "MORE_THAN_OWED",
        );
      }
    }
    if (decision.approve && !toDebt && submission.type === "CONTRIBUTION" && submission.roundId) {
      // R-DEC-29: an earlier approval or a problem-report increase may have filled the period.
      const { approved } = await periodTotals(tx, submission.slotId, submission.roundId);
      const error = contributionApprovalError(slotName(submission.slot), amount, approved, Number(group.contribution));
      if (error) throw conflict(error, "MORE_THAN_DUE");
    }

    const selfApproved = decision.approve && submission.submittedById === reviewerUserId;
    const updated = await tx.submission.update({
      where: { id: submission.id },
      data: decision.approve
        ? {
            status: "APPROVED",
            appliedAs: toDebt ? "DEBT_PAYMENT" : "CONTRIBUTION",
            effectiveAmount: submission.amount,
            reviewedById: reviewerUserId,
            reviewedAt: new Date(),
            selfApproved,
          }
        : { status: "DENIED", denialReason: reason, reviewedById: reviewerUserId, reviewedAt: new Date() },
    });

    await audit(tx, {
      groupId,
      actorUserId: reviewerUserId,
      action: decision.approve ? "submission.approved" : "submission.denied",
      targetSlotId: submission.slotId,
      targetName: slotName(submission.slot),
      amounts: repayment
        ? { amount, toInterest: repayment.toInterest, toPrincipal: repayment.toPrincipal }
        : { amount },
      after: decision.approve
        ? { round: submission.round?.number ?? null, appliedAs: toDebt ? "DEBT_PAYMENT" : "CONTRIBUTION" }
        : { reason },
      proofAttached: !!submission.proofPath,
      selfApproved,
    });
    // Tell whoever reported it, unless that's the reviewer.
    if (submission.submittedById !== reviewerUserId) {
      await notifyUsers(tx, [submission.submittedById], {
        groupId,
        kind: decision.approve ? "submission.approved" : "submission.denied",
        title: decision.approve
          ? `Your ${formatPeso(amount)} payment was approved`
          : `Your ${formatPeso(amount)} payment wasn't approved`,
        body: !decision.approve
          ? `Reason: ${reason}`
          : repayment
            ? repayment.remaining > 0
              ? `It went toward your debt. You still owe ${formatPeso(repayment.remaining)}.`
              : "Your debt is fully paid."
            : `${group.name}, round ${submission.round?.number}.`,
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
    return updated;
  });
}

/** R-SUB-04: the submitter can withdraw a submission while it's still pending. */
export async function cancelSubmission(groupId: string, userId: string, submissionId: string) {
  return withGroupLock(groupId, async (tx) => {
    const submission = await tx.submission.findFirst({
      where: { id: submissionId, groupId },
      include: { slot: { include: { user: true } } },
    });
    if (!submission) throw notFound("Submission");
    if (submission.submittedById !== userId) throw forbidden("Only whoever reported it can withdraw it.");
    if (submission.status !== "PENDING") throw conflict("Only pending submissions can be withdrawn.", "ALREADY_REVIEWED");
    await tx.submission.update({ where: { id: submission.id }, data: { status: "CANCELLED", reviewedAt: new Date() } });
    await audit(tx, {
      groupId,
      actorUserId: userId,
      action: "submission.cancelled",
      targetSlotId: submission.slotId,
      targetName: slotName(submission.slot),
      amounts: { amount: Number(submission.amount) },
    });
  });
}

/** Each slot's standing in the open period (R-SUB-07), for the group page. */
export async function openPeriodView(db: Db, groupId: string, contribution: number) {
  const round = await db.round.findFirst({ where: { groupId, status: "OPEN" } });
  if (!round) return null;
  const [slots, submissions] = await Promise.all([
    db.slot.findMany({ where: { groupId }, select: { id: true } }),
    db.submission.findMany({
      where: { roundId: round.id, type: "CONTRIBUTION", status: { in: ["APPROVED", "PENDING"] } },
      select: { slotId: true, status: true, amount: true, effectiveAmount: true, appliedAs: true },
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
      // This period's, anything still waiting, everything that went toward debt, and anything ever
      // disputed (so the dispute's outcome stays visible after the period closes).
      OR: [
        ...(openRoundId ? [{ roundId: openRoundId }] : []),
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
  }));
}
