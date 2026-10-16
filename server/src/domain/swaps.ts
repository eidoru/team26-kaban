import { SWAP_LOCK_DAYS } from "./constants.js";
import { addDays, type CalendarDate } from "./schedule.js";

/** One side of a swap: the round in which that slot gets the pot. */
export interface SwapTurn {
  slotId: string;
  roundNumber: number;
  /** The round's payout already happened (R-SWP-01: then it can't be swapped). */
  paidOut: boolean;
  /** This is the open period's round, so its recipient is "the current recipient" (R-SWP-03). */
  isOpenRound: boolean;
  payoutDate: CalendarDate;
}

/**
 * Why these two turns can't be swapped today, or null (R-SWP-01, R-SWP-03). Checked when a swap is
 * requested, accepted and approved, since time passes in between.
 */
export function swapBlocker(a: SwapTurn, b: SwapTurn, today: CalendarDate): string | null {
  if (a.slotId === b.slotId) return "Pick someone else's turn.";
  if (a.paidOut || b.paidOut) return "Turns that have already been paid out can't be swapped.";
  for (const turn of [a, b]) {
    if (turn.isOpenRound && today >= addDays(turn.payoutDate, -SWAP_LOCK_DAYS)) {
      return `This round's turn is locked within ${SWAP_LOCK_DAYS} days of its payout.`;
    }
  }
  return null;
}

/**
 * R-SWP-02 with R-DEC-22: the organizer's approval is the last step, unless the organizer already
 * agreed as a party (themselves, or acting for a placeholder).
 */
export function needsOrganizerApproval(parties: { requesterActsAsOrganizer: boolean; targetActsAsOrganizer: boolean }) {
  return !parties.requesterActsAsOrganizer && !parties.targetActsAsOrganizer;
}
