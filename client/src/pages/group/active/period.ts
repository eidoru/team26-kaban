import { submissionCap } from "@domain/submissions";
import type { DisputeView, GroupDetail, SubmissionView } from "../../../api/client";

/** Pending submissions in the order they came in: the order they must be reviewed in (R-SUB-05). */
export function reviewQueue(detail: GroupDetail) {
  return detail.submissions
    .filter((s) => s.status === "PENDING")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
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

/**
 * The Debts view has something to show: someone owes, a payment toward a debt is in review, or
 * (for the organizer) a refund is owed back (R-DSP-03).
 */
export function hasDebtsView(detail: GroupDetail) {
  const owing = detail.slots.some((s) => owedBy(detail, s.id) > 0 || pendingTowardDebt(detail, s.id).length > 0);
  return owing || (detail.viewer.isOrganizer && detail.disputes.some((d) => d.refund));
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
