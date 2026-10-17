import { DISPUTE_REASON_MAX_LENGTH, NOTE_MAX_LENGTH } from "../domain/constants.js";
import { formatPeso } from "../domain/money.js";
import { disputeAmountError, refundFor } from "../domain/submissions.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { notifyUsers } from "./notifications.js";
import { periodTotals } from "./submissions.js";
import { slotName, withGroupLock, type Db } from "./common.js";

function requiredText(text: string, max: number, missing: string, label: string) {
  const value = text.trim();
  if (!value) throw badRequest(missing);
  if (value.length > max) throw badRequest(`${label} can be up to ${max} characters.`);
  return value;
}

/**
 * R-DSP-01 / R-DSP-04: ask to change an approved contribution to `proposedAmount`, while its period
 * is still open. The slot holder disputes their own; the organizer can for themselves and for
 * placeholders (as with submissions, R-SUB-02). One open dispute per submission.
 */
export async function raiseDispute(
  groupId: string,
  actorUserId: string,
  input: { submissionId: string; proposedAmount: number; reason: string },
) {
  const reason = requiredText(input.reason, DISPUTE_REASON_MAX_LENGTH, "Say what's wrong.", "The reason");
  return withGroupLock(groupId, async (tx, group) => {
    const submission = await tx.submission.findFirst({
      where: { id: input.submissionId, groupId },
      include: { slot: { include: { user: true } }, round: true, disputes: { where: { status: "PENDING" } } },
    });
    if (!submission) throw notFound("Payment");
    const actor = await tx.slot.findFirstOrThrow({ where: { groupId, userId: actorUserId } });
    const ownSlot = submission.slotId === actor.id;
    if (!ownSlot && !(actor.isOrganizer && !submission.slot.userId)) {
      throw forbidden("You can report problems with your own slot's payments only.");
    }
    if (submission.status !== "APPROVED" || submission.appliedAs !== "CONTRIBUTION") {
      throw conflict("Only approved contributions can be reported.", "NOT_DISPUTABLE");
    }
    if (submission.round?.status !== "OPEN") {
      throw conflict("Problem reports close when the period's payout happens.", "PERIOD_CLOSED");
    }
    if (submission.disputes.length > 0) throw conflict("This payment already has an open dispute.", "ALREADY_DISPUTED");

    const current = Number(submission.effectiveAmount ?? submission.amount);
    const { approved } = await periodTotals(tx, submission.slotId, submission.roundId!);
    const error = disputeAmountError(input.proposedAmount, current, approved, Number(group.contribution));
    if (error) throw new AppError(400, error, "BAD_AMOUNT", { proposedAmount: error });

    const dispute = await tx.dispute.create({
      data: {
        groupId,
        submissionId: submission.id,
        slotId: submission.slotId,
        raisedById: actorUserId,
        previousAmount: BigInt(current),
        proposedAmount: BigInt(input.proposedAmount),
        reason,
      },
    });
    await audit(tx, {
      groupId,
      actorUserId,
      action: "dispute.raised",
      targetSlotId: submission.slotId,
      targetName: slotName(submission.slot),
      before: { amount: current },
      after: { amount: input.proposedAmount, reason, round: submission.round.number },
    });
    if (!actor.isOrganizer) {
      await notifyUsers(tx, [group.organizerId], {
        groupId,
        kind: "dispute.raised",
        title: `${slotName(submission.slot)} reports a problem with a ${formatPeso(current)} payment`,
        body: `They ask to change it to ${formatPeso(input.proposedAmount)}. Resolve it before the payout date.`,
      });
    }
    return dispute;
  });
}

/**
 * R-DSP-02 / R-DSP-03: the organizer approves (the payment's amount changes; a decrease is recorded
 * as a refund owed to the member) or denies with a reason.
 */
export async function reviewDispute(
  groupId: string,
  organizerUserId: string,
  disputeId: string,
  decision: { approve: true } | { approve: false; note: string },
) {
  // `=== false`, not truthiness: Vercel compiles the function non-strict, where only this narrows the union.
  const note =
    decision.approve === false
      ? requiredText(decision.note, NOTE_MAX_LENGTH, "Say why, so the member understands.", "The reason")
      : null;
  return withGroupLock(groupId, async (tx, group) => {
    const dispute = await tx.dispute.findFirst({
      where: { id: disputeId, groupId },
      include: { submission: { include: { round: true } }, slot: { include: { user: true } } },
    });
    if (!dispute) throw notFound("Problem report");
    if (dispute.status !== "PENDING") throw conflict("This report was already handled.", "ALREADY_REVIEWED");
    const previous = Number(dispute.previousAmount);
    const proposed = Number(dispute.proposedAmount);
    let refund = 0;

    if (decision.approve) {
      // Other approvals since it was raised may have used up room for an increase (R-DEC-13).
      const { approved } = await periodTotals(tx, dispute.slotId, dispute.submission.roundId!);
      const current = Number(dispute.submission.effectiveAmount ?? dispute.submission.amount);
      const error = disputeAmountError(proposed, current, approved, Number(group.contribution));
      if (error) throw conflict(`${error} Deny this report instead.`, "BAD_AMOUNT");
      await tx.submission.update({ where: { id: dispute.submissionId }, data: { effectiveAmount: BigInt(proposed) } });
      refund = refundFor(current, proposed);
      if (refund > 0) {
        await tx.refund.create({ data: { groupId, slotId: dispute.slotId, disputeId: dispute.id, amount: BigInt(refund) } });
      }
    }
    await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: decision.approve ? "APPROVED" : "DENIED",
        reviewedById: organizerUserId,
        reviewedAt: new Date(),
        reviewNote: note,
      },
    });
    await audit(tx, {
      groupId,
      actorUserId: organizerUserId,
      action: decision.approve ? "dispute.approved" : "dispute.denied",
      targetSlotId: dispute.slotId,
      targetName: slotName(dispute.slot),
      before: { amount: previous },
      after: decision.approve ? { amount: proposed } : { reason: note },
      selfApproved: decision.approve && dispute.raisedById === organizerUserId,
    });
    if (refund > 0) {
      await audit(tx, {
        groupId,
        actorUserId: organizerUserId,
        action: "refund.recorded",
        targetSlotId: dispute.slotId,
        targetName: slotName(dispute.slot),
        amounts: { refund },
        after: { round: dispute.submission.round?.number },
      });
    }
    if (dispute.raisedById !== organizerUserId) {
      await notifyUsers(tx, [dispute.raisedById], {
        groupId,
        kind: decision.approve ? "dispute.approved" : "dispute.denied",
        title: decision.approve
          ? `Your payment is now ${formatPeso(proposed)}`
          : `Your report about ${formatPeso(previous)} wasn't accepted`,
        body: decision.approve
          ? refund > 0
            ? `The organizer owes you a ${formatPeso(refund)} refund.`
            : "The correction is recorded."
          : `Reason: ${note}`,
      });
    }
  });
}

/** The person who raised a dispute can withdraw it while it's pending. */
export async function cancelDispute(groupId: string, userId: string, disputeId: string) {
  return withGroupLock(groupId, async (tx) => {
    const dispute = await tx.dispute.findFirst({ where: { id: disputeId, groupId }, include: { slot: { include: { user: true } } } });
    if (!dispute) throw notFound("Problem report");
    if (dispute.raisedById !== userId) throw forbidden("Only whoever raised it can withdraw it.");
    if (dispute.status !== "PENDING") throw conflict("Only pending reports can be withdrawn.", "ALREADY_REVIEWED");
    await tx.dispute.update({ where: { id: dispute.id }, data: { status: "CANCELLED", reviewedAt: new Date() } });
    await audit(tx, {
      groupId,
      actorUserId: userId,
      action: "dispute.cancelled",
      targetSlotId: dispute.slotId,
      targetName: slotName(dispute.slot),
    });
  });
}

/** R-DEC-21: when a period closes, its pending disputes expire and the approved amounts stand. */
export async function expireDisputes(db: Db, groupId: string, roundId: string, roundNumber: number) {
  const pending = await db.dispute.findMany({
    where: { groupId, status: "PENDING", submission: { roundId } },
    include: { slot: { include: { user: true } }, group: { select: { name: true } } },
  });
  for (const dispute of pending) {
    await db.dispute.update({ where: { id: dispute.id }, data: { status: "EXPIRED", reviewedAt: new Date() } });
    await audit(db, {
      groupId,
      actorUserId: null,
      action: "dispute.expired",
      targetSlotId: dispute.slotId,
      targetName: slotName(dispute.slot),
      before: { amount: Number(dispute.previousAmount) },
      after: { proposed: Number(dispute.proposedAmount), round: roundNumber },
    });
    await notifyUsers(db, [dispute.raisedById], {
      groupId,
      kind: "dispute.expired",
      title: `Your problem report expired with round ${roundNumber}`,
      body: `It wasn't resolved before the payout, so ${formatPeso(Number(dispute.previousAmount))} stands. You can still pay anything missing toward your debt.`,
    });
  }
}

/** Disputes this viewer may see: all for the organizer, their own slot's for a member (as submissions). */
export async function visibleDisputes(db: Db, groupId: string, viewer: { userId: string; slotId: string; isOrganizer: boolean }) {
  const rows = await db.dispute.findMany({
    where: { groupId, ...(viewer.isOrganizer ? {} : { slotId: viewer.slotId }) },
    include: { refund: true, submission: { include: { round: { select: { number: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((d) => ({
    id: d.id,
    submissionId: d.submissionId,
    slotId: d.slotId,
    round: d.submission.round?.number ?? null,
    previousAmount: Number(d.previousAmount),
    proposedAmount: Number(d.proposedAmount),
    reason: d.reason,
    status: d.status,
    createdAt: d.createdAt.toISOString(),
    reviewedAt: d.reviewedAt?.toISOString() ?? null,
    reviewNote: d.reviewNote,
    /** Raised by the viewer, who may withdraw it while pending. */
    mine: d.raisedById === viewer.userId,
    refund: d.refund ? Number(d.refund.amount) : null,
  }));
}
