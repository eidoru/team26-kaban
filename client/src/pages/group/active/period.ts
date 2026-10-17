import { contributionApprovalError, leftAfterPending, submissionCap } from "@domain/submissions";
import type { DisputeView, GroupDetail, SubmissionView } from "../../../api/client";

/** Pending submissions in the order they came in: the order they must be reviewed in (R-SUB-05). */
export function reviewQueue(detail: GroupDetail) {
  return detail.submissions
    .filter((s) => s.status === "PENDING")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/**
 * Where a pending payment falls among the same slot's pending payments for the same round and type,
 * the group the server reviews in order (R-SUB-05): `{ number: 2, of: 3 }`. Several pending ₱500s
 * look alike, so the review queue numbers them.
 */
export function paymentOrder(detail: GroupDetail, payment: SubmissionView) {
  const same = reviewQueue(detail).filter(
    (s) => s.slotId === payment.slotId && s.round === payment.round && s.type === payment.type,
  );
  return { number: same.findIndex((s) => s.id === payment.id) + 1, of: same.length };
}

/**
 * R-DEC-29: why a pending contribution for the open period can't be approved (the period
 * is already filled, or this would pass it), or null. The server refuses it too. `left` is what the
 * approved amounts leave; `waiting` is the member's other pending payments that still fit, taken in
 * review order (R-SUB-05); `sendable` is what's left after those, the same cap the member's pay form
 * will show once this one is denied.
 */
export function overfill(detail: GroupDetail, payment: SubmissionView, name: string) {
  if (payment.type !== "CONTRIBUTION" || payment.round !== detail.period?.number) return null;
  const standing = detail.period?.slots.find((s) => s.slotId === payment.slotId);
  if (!standing) return null;
  const error = contributionApprovalError(name, payment.amount, standing.approved, standing.due);
  if (!error) return null;
  const left = Math.max(0, standing.due - standing.approved);
  const others = reviewQueue(detail).filter(
    (s) => s.slotId === payment.slotId && s.round === payment.round && s.type === payment.type && s.id !== payment.id,
  );
  return { error, left, ...leftAfterPending(left, others.map((s) => s.amount)) };
}

/** A slot's standing in the open period, plus what can still be reported for it (R-SUB-06). */
export function standingOf(detail: GroupDetail, slotId: string) {
  const standing = detail.period?.slots.find((s) => s.slotId === slotId);
  if (!standing) return null;
  return { ...standing, reportable: submissionCap(standing.due, standing.approved, standing.pending) };
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
