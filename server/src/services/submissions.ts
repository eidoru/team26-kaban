import { NOTE_MAX_LENGTH } from "../domain/constants.js";
import { can } from "../domain/lifecycle.js";
import { formatPeso } from "../domain/money.js";
import { periodStatus, submissionAmountError, submissionCap } from "../domain/submissions.js";
import { audit } from "../lib/audit.js";
import { AppError, badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { isProofPathFor, proofExists, proofViewUrls } from "../lib/storage.js";
import { notifyUsers } from "./notifications.js";
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
 * R-SUB-01 / R-SUB-02 / R-SUB-06: report a contribution for the open period. Members report their
 * own; the organizer reports for themselves and for placeholders. Everything starts PENDING.
 */
export async function submitContribution(
  groupId: string,
  actorUserId: string,
  input: { slotId: string; amount: number; proofPath?: string; note?: string },
) {
  const note = trimmedNote(input.note, "Notes");
  if (input.proofPath) {
    if (!isProofPathFor(groupId, input.proofPath)) throw badRequest("That proof doesn't belong to this paluwagan.");
    if (!(await proofExists(input.proofPath))) throw badRequest("The proof didn't finish uploading. Attach it again.");
  }

  return withGroupLock(groupId, async (tx, group) => {
    if (!can.submitContribution(group.state)) throw conflict("Payments open once the paluwagan starts.", "WRONG_STATE");
    const round = await openRound(tx, groupId);
    const [actor, slot] = await Promise.all([
      tx.slot.findFirstOrThrow({ where: { groupId, userId: actorUserId } }),
      tx.slot.findFirst({ where: { id: input.slotId, groupId }, include: { user: true } }),
    ]);
    if (!slot) throw notFound("Slot");
    const ownSlot = slot.id === actor.id;
    if (!ownSlot && !(actor.isOrganizer && !slot.userId)) {
      throw forbidden("You can report payments for your own slot only.");
    }

    const totals = await periodTotals(tx, slot.id, round.id);
    const cap = submissionCap(Number(group.contribution), totals.approved, totals.pending);
    const error = submissionAmountError(input.amount, cap);
    if (error) throw new AppError(400, error, "BAD_AMOUNT", { amount: error });

    const submission = await tx.submission.create({
      data: {
        groupId,
        slotId: slot.id,
        roundId: round.id,
        type: "CONTRIBUTION",
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
      after: { type: "CONTRIBUTION", round: round.number },
      proofAttached: !!input.proofPath,
    });
    // The organizer reviews everything (R-SUB-03); they don't need telling about their own reports.
    if (!actor.isOrganizer) {
      await notifyUsers(tx, [group.organizerId], {
        groupId,
        kind: "submission.pending",
        title: `${slotName(slot)} reported ${formatPeso(input.amount)}`,
        body: `${group.name}, round ${round.number}. ${input.proofPath ? "Proof attached." : "No proof attached."}`,
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
  const reason = decision.approve ? null : trimmedNote(decision.reason, "The reason");
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

    const selfApproved = decision.approve && submission.submittedById === reviewerUserId;
    const updated = await tx.submission.update({
      where: { id: submission.id },
      data: decision.approve
        ? {
            status: "APPROVED",
            appliedAs: submission.type,
            effectiveAmount: submission.amount,
            reviewedById: reviewerUserId,
            reviewedAt: new Date(),
            selfApproved,
          }
        : { status: "DENIED", denialReason: reason, reviewedById: reviewerUserId, reviewedAt: new Date() },
    });

    const amount = Number(submission.amount);
    await audit(tx, {
      groupId,
      actorUserId: reviewerUserId,
      action: decision.approve ? "submission.approved" : "submission.denied",
      targetSlotId: submission.slotId,
      targetName: slotName(submission.slot),
      amounts: { amount },
      after: decision.approve ? { round: submission.round?.number } : { reason },
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
        body: decision.approve ? `${group.name}, round ${submission.round?.number}.` : `Reason: ${reason}`,
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
 * Submissions for the open period that this viewer may see: all of them for the organizer, their
 * own slot's for a member. Others' amounts and statuses are public through the period view and the
 * audit log; proof photos stay with the submitter and the organizer, since screenshots can carry
 * account details.
 */
export async function visibleSubmissions(
  db: Db,
  groupId: string,
  roundId: string,
  viewer: { userId: string; slotId: string; isOrganizer: boolean },
) {
  const rows = await db.submission.findMany({
    where: { groupId, roundId, ...(viewer.isOrganizer ? {} : { slotId: viewer.slotId }) },
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
