import { submissionCap } from "@domain/submissions";
import type { GroupDetail } from "../../../api/client";

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
 * What can still be reported toward a slot's debt (R-SUB-06 applied to debt): what it owes, less
 * pending money that will land on the debt (debt payments, and contributions for closed periods).
 */
export function debtReportable(detail: GroupDetail, slotId: string) {
  const openRound = detail.period?.number ?? null;
  const pending = detail.submissions
    .filter(
      (s) =>
        s.slotId === slotId &&
        s.status === "PENDING" &&
        (s.type === "DEBT_PAYMENT" || (s.round !== null && s.round !== openRound)),
    )
    .reduce((total, s) => total + s.amount, 0);
  return submissionCap(owedBy(detail, slotId), 0, pending);
}

/** The oldest payout this viewer has to act on: hand over (organizer), or confirm receipt (recipient). */
export function payoutToActOn(detail: GroupDetail) {
  const oldestFirst = [...detail.payouts].reverse();
  const viewer = detail.viewer;
  return (
    oldestFirst.find((p) =>
      viewer.isOrganizer
        ? p.status === "AWAITING_HANDOVER"
        : p.status === "HANDED_OVER" && p.recipientSlotId === viewer.slotId,
    ) ?? null
  );
}
