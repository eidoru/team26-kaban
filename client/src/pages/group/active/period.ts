import { submissionCap } from "@domain/submissions";
import type { DisputeView, GroupDetail, SubmissionView } from "../../../api/client";

/** Pending submissions in the order they came in: the order they must be reviewed in (R-SUB-05). */
export function reviewQueue(detail: GroupDetail) {
  return detail.submissions
    .filter((s) => s.status === "PENDING")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/**
 * R-SUB-05: a slot's pending payments for the same round and type as `payment`, oldest first. The
 * server reviews each such stack in order, so only its first can be decided.
 */
export function stackOf(detail: GroupDetail, payment: SubmissionView) {
  return reviewQueue(detail).filter(
    (s) => s.slotId === payment.slotId && s.round === payment.round && s.type === payment.type,
  );
}

/**
 * A slot's standing in the open period, plus what can still be reported for it (R-SUB-06). Under
 * the room rule (R-DEC-29), `waiting` is everything that holds room until reviewed: pending payments
 * and the increases pending corrections ask for.
 */
export function standingOf(detail: GroupDetail, slotId: string) {
  const standing = detail.period?.slots.find((s) => s.slotId === slotId);
  if (!standing) return null;
  const waiting = standing.pending + standing.pendingIncrease;
  return { ...standing, waiting, reportable: submissionCap(standing.due, standing.approved, waiting) };
}

export function owedBy(detail: GroupDetail, slotId: string) {
  const slot = detail.slots.find((s) => s.id === slotId);
  return slot ? slot.debt.principal + slot.debt.interest : 0;
}

/**
 * Pending submissions that will land on a slot's debt once approved: debt payments, and
 * contributions for closed periods (R-DBT-06). Oldest first, the order they're reviewed in (R-SUB-05).
 */
export function pendingTowardDebt(detail: GroupDetail, slotId: string) {
  const openRound = detail.period?.number ?? null;
  return reviewQueue(detail).filter(
    (s) => s.slotId === slotId && (s.type === "DEBT_PAYMENT" || (s.round !== null && s.round !== openRound)),
  );
}

/** What can still be reported toward a slot's debt (R-SUB-06 applied to debt): what it owes, less what's pending. */
export function debtReportable(detail: GroupDetail, slotId: string) {
  const pending = pendingTowardDebt(detail, slotId).reduce((total, s) => total + s.amount, 0);
  return submissionCap(owedBy(detail, slotId), 0, pending);
}

/** Payouts this viewer has to act on, oldest first: hand over (organizer), or confirm receipt (recipient). */
export function payoutsToActOnFor(detail: GroupDetail) {
  const viewer = detail.viewer;
  return [...detail.payouts]
    .reverse()
    .filter((p) =>
      viewer.isOrganizer
        ? p.status === "AWAITING_HANDOVER"
        : p.status === "HANDED_OVER" && p.recipientSlotId === viewer.slotId,
    );
}

/** Pending disputes, oldest first: reviewed before payments, since they expire at the payout (R-DEC-21). */
export function disputeQueue(detail: GroupDetail) {
  return detail.disputes.filter((d) => d.status === "PENDING");
}

/** The latest dispute about a submission, if any. */
export function latestDispute(detail: GroupDetail, submissionId: string) {
  return detail.disputes.filter((d) => d.submissionId === submissionId).at(-1) ?? null;
}

export type ReviewItem = { kind: "dispute"; item: DisputeView } | { kind: "payment"; item: SubmissionView };

/** Disputes first (they expire at the payout, R-DEC-21), then payments in the order they came in. */
export function reviewItems(detail: GroupDetail): ReviewItem[] {
  return [
    ...disputeQueue(detail).map((item) => ({ kind: "dispute" as const, item })),
    ...reviewQueue(detail).map((item) => ({ kind: "payment" as const, item })),
  ];
}
