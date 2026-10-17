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

/**
 * R-DEC-29: why a pending contribution for an open period can't be approved, or null.
 * The cap at submission counts pending payments, but a later approval or a problem-report increase
 * can still fill the period first; approving then would take the approved total past the
 * contribution, and the extra would count toward nothing. The organizer denies it instead.
 */
export function contributionApprovalError(
  name: string,
  amount: Centavos,
  approved: Centavos,
  contribution: Centavos,
): string | null {
  const left = Math.max(0, contribution - approved);
  if (amount <= left) return null;
  return left === 0
    ? `${name} has already paid in full this round, so this can't be approved. Deny it instead.`
    : `${name} has only ${formatPeso(left)} left to pay this round, so this can't be approved. Deny it instead.`;
}

/**
 * R-DEC-29: with `left` to pay, which of a member's other pending contributions (in review
 * order) still fit, and what's left after them: the cap the member's pay form shows once the ones
 * that don't fit are denied. Those are skipped here; each will be refused on its own turn.
 */
export function leftAfterPending(left: Centavos, pending: Centavos[]) {
  let sendable = Math.max(0, left);
  const waiting: Centavos[] = [];
  for (const amount of pending) {
    if (amount > sendable) continue;
    waiting.push(amount);
    sendable -= amount;
  }
  return { waiting, sendable };
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

