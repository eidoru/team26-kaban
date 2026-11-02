import { SWAP_LOCK_DAYS } from "./constants.js";
import { inDebtMessage, type DebtOwed } from "./debt.js";
import type { GroupState } from "./lifecycle.js";
import type { Centavos } from "./money.js";
import { addDays, type CalendarDate } from "./schedule.js";

/** The leaving slot as the rules see it. `turn` is null before the order exists (never after launch). */
export interface LeavingSlot {
  state: GroupState;
  isOrganizer: boolean;
  isPlaceholder: boolean;
  turn: { paidOut: boolean; isOpenRound: boolean; payoutDate: CalendarDate } | null;
}

/** Who reads the message: the member leaving, or the replacement or organizer looking at their slot. */
export type Audience = "leaver" | "other";

/**
 * Why this slot can't change hands today, or null (R-WDR-01, R-WDR-02). Checked when leaving starts,
 * when the replacement accepts and when the organizer approves, since time passes in between.
 */
export function leaveBlocker(slot: LeavingSlot, today: CalendarDate, who: Audience = "leaver"): string | null {
  if (slot.state === "LOBBY") return "Before launch you can just leave; your slot opens up again.";
  if (slot.state !== "LAUNCHED" && slot.state !== "ACTIVE") return "This paluwagan has ended.";
  if (slot.isOrganizer) return "The organizer can't leave their own paluwagan.";
  if (slot.isPlaceholder) return "A placeholder changes hands through its claim link.";
  if (!slot.turn) return "Payout turns aren't set yet.";
  if (slot.turn.paidOut) {
    return who === "leaver"
      ? "You've received your payout, so your slot can't change hands."
      : "This slot was paid out, so it can't change hands.";
  }
  if (slot.turn.isOpenRound && today >= addDays(slot.turn.payoutDate, -SWAP_LOCK_DAYS)) {
    const [whose, what] = who === "leaver" ? ["Your", "your slot"] : ["This slot's", "it"];
    return `${whose} payout is less than ${SWAP_LOCK_DAYS} days away, so ${what} is locked until then.`;
  }
  return null;
}

/** What still has to settle on the slot before it can be handed over (R-WDR-03). */
export interface LeaveStanding {
  /** Payments waiting for the organizer's review. */
  pendingPayments: number;
  /** Problem reports waiting, including ones asking a payment back (R-WDR-04). */
  pendingReports: number;
  swapInProgress: boolean;
}

/**
 * R-WDR-03: the to-dos left before the request can be sent, or approved. Empty means ready. Payments
 * for the open and later rounds aren't here: leaving them to the replacement is confirmed when the
 * request is sent, and asking them back is a problem report, which counts here while it waits.
 */
export function leaveTodos(standing: LeaveStanding, who: Audience = "leaver"): string[] {
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
  const { pendingPayments: payments, pendingReports: reports } = standing;
  const them = (n: number) => (n === 1 ? "it" : "them");
  const are = (n: number) => (n === 1 ? "is" : "are");
  const todos =
    who === "other"
      ? [
          payments > 0 && `${plural(payments, "payment")} on this slot ${are(payments)} waiting for review.`,
          reports > 0 && `${plural(reports, "problem report")} on this slot ${are(reports)} waiting.`,
          standing.swapInProgress && "This slot has a turn swap in progress.",
        ]
      : [
          payments > 0 && `Wait for the organizer to review your ${plural(payments, "payment")}, or withdraw ${them(payments)}.`,
          reports > 0 &&
            `Wait for the organizer to decide your ${plural(reports, "problem report")}, or withdraw ${them(reports)}.`,
          standing.swapInProgress && "Settle or withdraw your turn swap.",
        ];
  return todos.filter((t): t is string => !!t);
}

/** The person stepping in, as R-WDR-07 sees them. */
export interface Replacement {
  /** Already holds a slot in this paluwagan (the leaver included). */
  isMember: boolean;
  /** Already the replacement in another open request in this paluwagan. */
  replacingAnother: boolean;
  /** R-DEC-39: what they owe in any paluwagan. */
  debts: DebtOwed[];
}

/** Why this person can't take the slot, or null (R-WDR-07). Checked on accepting and on approval. */
export function replacementBlocker(person: Replacement): string | null {
  if (person.isMember) return "You already hold a slot in this paluwagan. One person can hold only one slot.";
  if (person.replacingAnother) return "You're already stepping in for another member of this paluwagan.";
  if (person.debts.length > 0) return inDebtMessage(person.debts, "join");
  return null;
}

/** R-WDR-10: a round closed short after they accepted, so they must look again. */
export function acceptanceStale(acceptedDebt: Centavos, debtNow: Centavos): boolean {
  return debtNow > acceptedDebt;
}
