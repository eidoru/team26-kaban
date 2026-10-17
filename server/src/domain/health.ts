import { REMINDER_DAYS_BEFORE } from "./constants.js";
import { daysBetween, type CalendarDate } from "./schedule.js";

export type Health = "ON_TRACK" | "AT_RISK" | "SHORT";

/** How far behind the calendar collection may fall before the round is at risk (R-DEC-26). */
export const AT_RISK_MARGIN = 0.1;

/**
 * §15.1 health indicator (R-DEC-26, assumption): compare the share of the pot collected (approved
 * money only) with the share of the period that has passed. Inside the reminder window, anything
 * less than the full pot is SHORT: the organizer will likely have to cover it.
 */
export function roundHealth(input: {
  approved: number;
  expected: number;
  periodStart: CalendarDate;
  payoutDate: CalendarDate;
  today: CalendarDate;
}): Health {
  const collected = input.expected > 0 ? input.approved / input.expected : 1;
  if (collected >= 1) return "ON_TRACK";
  const length = Math.max(1, daysBetween(input.periodStart, input.payoutDate));
  const daysLeft = daysBetween(input.today, input.payoutDate);
  if (daysLeft <= REMINDER_DAYS_BEFORE) return "SHORT";
  const elapsed = Math.min(1, Math.max(0, daysBetween(input.periodStart, input.today) / length));
  return collected + AT_RISK_MARGIN < elapsed ? "AT_RISK" : "ON_TRACK";
}
