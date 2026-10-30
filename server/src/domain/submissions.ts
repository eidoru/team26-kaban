import { formatPeso, type Centavos } from "./money.js";

/** R-SUB-01 */
export type SubmissionType = "CONTRIBUTION" | "DEBT_PAYMENT";
/** R-SUB-07 */
export type PeriodStatus = "PAID" | "PARTIAL" | "UNPAID";

/**
 * R-SUB-06: the most a new contribution submission can be: contribution − approved − pending, for
 * that member and period. For a contribution, `pending` also holds the increases asked for in
 * pending corrections (R-DEC-29). For a debt payment pass the outstanding debt as `due`.
 */
export function submissionCap(due: Centavos, approved: Centavos, pending: Centavos): Centavos {
  return Math.max(0, due - approved - pending);
}

/** The room a round still has for a slot's contributions (R-DEC-29). */
export type RoundRoom = { round: number; room: Centavos };

/**
 * R-DEC-31 / R-DEC-33: the rounds a contribution may fill, in the order it fills them: what's left
 * of the open round, then every later round (paying ahead, no limit: R-DEC-36) once the slot's
 * debt is covered.
 */
export function contributionRooms(input: {
  open: RoundRoom;
  upcoming: RoundRoom[];
  debtLeft: Centavos;
}): RoundRoom[] {
  const rooms = input.open.room > 0 ? [input.open] : [];
  if (input.debtLeft > 0) return rooms;
  const ahead = [...input.upcoming]
    .sort((a, b) => a.round - b.round)
    .filter((r) => r.room > 0 && r.round > input.open.round);
  return [...rooms, ...ahead];
}

/** R-DEC-33: one payment split over `rooms` in order, each round taking what it has room for. */
export function splitContribution(amount: Centavos, rooms: RoundRoom[]): { round: number; amount: Centavos }[] {
  const parts: { round: number; amount: Centavos }[] = [];
  let left = amount;
  for (const { round, room } of rooms) {
    if (left <= 0) break;
    const take = Math.min(left, room);
    parts.push({ round, amount: take });
    left -= take;
  }
  return parts;
}

/** "round 3" or "rounds 1–4", for a payment's parts. */
export function roundsLabel(rounds: number[]): string {
  if (rounds.length === 0) return "";
  const sorted = [...rounds].sort((a, b) => a - b);
  return sorted.length === 1 ? `round ${sorted[0]}` : `rounds ${sorted[0]}–${sorted.at(-1)}`;
}

/**
 * R-SUB-06 / R-DEC-31: why a contribution of `amount` can't be sent, or null. `cap` is the room in
 * every round it may fill; `blockedByDebt` says paying ahead would be possible but for the debt.
 */
export function contributionAmountError(amount: Centavos, cap: Centavos, blockedByDebt: boolean): string | null {
  const error = submissionAmountError(amount, cap);
  if (!error || !blockedByDebt || !Number.isInteger(amount) || amount <= 0) return error;
  return `${error} Pay off the debt before paying ahead.`;
}

/**
 * R-DEC-37: why a payment (contribution or debt payment, also one the organizer records for a
 * placeholder) or a payout handover can't be recorded without a proof photo, or null.
 */
export function proofError(attached: boolean): string | null {
  return attached ? null : "Attach a photo of the payment as proof.";
}

/** Why `amount` can't be submitted, or null. */
export function submissionAmountError(amount: Centavos, cap: Centavos): string | null {
  if (!Number.isInteger(amount) || amount <= 0) return "Enter an amount greater than zero.";
  if (cap === 0) return "Nothing is left to pay here.";
  if (amount > cap) return "That's more than what's left to pay.";
  return null;
}

/**
 * R-DEC-29: why a pending contribution for an open period can't be approved, or null. The room rule
 * means this never fails for anything sent under it; it is the safety net that keeps the approved
 * total from passing the contribution (the extra would count toward nothing).
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

/** R-DEC-29: the room a pending correction holds: its increase. A decrease frees nothing until approved. */
export function correctionIncrease(previous: Centavos, proposed: Centavos): Centavos {
  return Math.max(0, proposed - previous);
}

/** R-SUB-07: only approved amounts count. `pendingReview` is shown alongside the status. */
export function periodStatus(contribution: Centavos, approved: Centavos, pendingCount: number) {
  const status: PeriodStatus = approved >= contribution ? "PAID" : approved > 0 ? "PARTIAL" : "UNPAID";
  return { status, pendingReview: pendingCount > 0 };
}

/**
 * R-DSP-01 / R-DEC-13 / R-DEC-29: why `proposed` can't replace an approved contribution of `current`,
 * or null. It may go down (a correction or a refund request) or up, but not past the room left:
 * the contribution less the member's other approved amounts and everything `waiting` for review
 * (pending contributions and other corrections' increases). `approvedTotal` includes `current`.
 */
export function disputeAmountError(
  proposed: Centavos,
  current: Centavos,
  approvedTotal: Centavos,
  contribution: Centavos,
  waiting: Centavos = 0,
): string | null {
  if (!Number.isInteger(proposed) || proposed < 0) return "Enter an amount of zero or more.";
  if (proposed === current) return "That's the amount already recorded.";
  const ceiling = contribution - (approvedTotal - current) - waiting;
  if (proposed <= current || proposed <= ceiling) return null;
  if (waiting === 0) return `That would be more than the contribution. The most it can be is ${formatPeso(ceiling)}.`;
  return ceiling <= current
    ? `${formatPeso(waiting)} is still waiting for review, so this can't go higher. If this correction includes those payments, withdraw them first.`
    : `${formatPeso(waiting)} is still waiting for review, so the most it can be is ${formatPeso(ceiling)}. If this correction includes those payments, withdraw them first.`;
}

/** The refund an approved correction creates (R-DSP-03): only a decrease refunds anything. */
export function refundFor(current: Centavos, proposed: Centavos): Centavos {
  return Math.max(0, current - proposed);
}

