import { formatPeso, type Centavos } from "./money.js";

/** R-SUB-01 */
export type SubmissionType = "CONTRIBUTION" | "DEBT_PAYMENT";
/** R-SUB-07 */
export type PeriodStatus = "PAID" | "PARTIAL" | "UNPAID";

/**
 * R-SUB-06: the most a new contribution submission can be: contribution − approved − pending, for
 * that member and period. For a debt payment pass the outstanding debt as `due`.
 */
export function submissionCap(due: Centavos, approved: Centavos, pending: Centavos): Centavos {
  return Math.max(0, due - approved - pending);
}

/** Why `amount` can't be submitted, or null. */
export function submissionAmountError(amount: Centavos, cap: Centavos): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return "Enter an amount greater than zero.";
  if (cap === 0) return "Nothing is left to pay here.";
  if (amount > cap) return "That's more than what's left to pay.";
  return null;
}

/** R-SUB-07: only approved amounts count. `pendingReview` is shown alongside the status. */
export function periodStatus(contribution: Centavos, approved: Centavos, pendingCount: number) {
  const status: PeriodStatus = approved >= contribution ? "PAID" : approved > 0 ? "PARTIAL" : "UNPAID";
  return { status, pendingReview: pendingCount > 0 };
}

/**
 * R-DSP-01 / R-DEC-13: why `proposed` can't replace an approved contribution of `current`, or null.
 * It may go down (a correction or a refund request) or up, but the member's approved total for
 * the period can't pass the contribution. `approvedTotal` includes `current`.
 */
export function disputeAmountError(
  proposed: Centavos,
  current: Centavos,
  approvedTotal: Centavos,
  contribution: Centavos,
): string | null {
  if (!Number.isInteger(proposed) || proposed < 0) return "Enter an amount of zero or more.";
  if (proposed === current) return "That's the amount already recorded.";
  const ceiling = contribution - (approvedTotal - current);
  if (proposed > ceiling) return `That would be more than the contribution. The most it can be is ${formatPeso(ceiling)}.`;
  return null;
}

/** The refund an approved correction creates (R-DSP-03): only a decrease refunds anything. */
export function refundFor(current: Centavos, proposed: Centavos): Centavos {
  return Math.max(0, current - proposed);
}

