import { MIN_HALF_MONTH_DAYS } from "./constants.js";

/** A calendar date with no time or zone, "YYYY-MM-DD". Dates are Philippine calendar days. */
export type CalendarDate = string;

/** R-SET-04 */
export type Frequency = "WEEKLY" | "BI_WEEKLY" | "TWICE_MONTHLY" | "MONTHLY" | "CUSTOM";

function parse(date: CalendarDate): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`Not a calendar date: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function format(y: number, m: number, d: number): CalendarDate {
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function toUtc(date: CalendarDate): number {
  const { y, m, d } = parse(date);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): CalendarDate {
  const date = new Date(ms);
  return format(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  return fromUtc(toUtc(date) + days * 86_400_000);
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function daysBetween(a: CalendarDate, b: CalendarDate): number {
  return Math.round((toUtc(b) - toUtc(a)) / 86_400_000);
}

/** R-FRQ-04: `months` after `start`, keeping start's day and clamping to the month's last day. */
function addMonthsClamped(start: CalendarDate, months: number): CalendarDate {
  const { y, m, d } = parse(start);
  const index = y * 12 + (m - 1) + months;
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return format(year, month, Math.min(d, daysInMonth(year, month)));
}

/** The 15th or last day of the month on or after `date`. */
function nextHalfMonthBoundary(date: CalendarDate): CalendarDate {
  const { y, m, d } = parse(date);
  if (d <= 15) return format(y, m, 15);
  return format(y, m, daysInMonth(y, m));
}

/** The boundary after `boundary` (a 15th → that month's last day; a month-end → next month's 15th). */
function followingHalfMonthBoundary(boundary: CalendarDate): CalendarDate {
  const { y, m, d } = parse(boundary);
  if (d === 15) return format(y, m, daysInMonth(y, m));
  return m === 12 ? format(y + 1, 1, 15) : format(y, m + 1, 15);
}

/**
 * Payout dates 1…`slots` (§4.3). Payout k is the k-th schedule date after `start`; nothing is paid
 * on the start date itself. `customDays` is required for CUSTOM (R-FRQ-05).
 */
export function payoutDates(
  start: CalendarDate,
  frequency: Frequency,
  slots: number,
  customDays?: number,
): CalendarDate[] {
  const dates: CalendarDate[] = [];
  switch (frequency) {
    case "WEEKLY":
    case "BI_WEEKLY":
    case "CUSTOM": {
      const step = frequency === "WEEKLY" ? 7 : frequency === "BI_WEEKLY" ? 14 : customDays;
      if (!step || step < 1) throw new Error("CUSTOM frequency needs an interval in days");
      for (let k = 1; k <= slots; k++) dates.push(addDays(start, step * k));
      return dates;
    }
    case "MONTHLY":
      for (let k = 1; k <= slots; k++) dates.push(addMonthsClamped(start, k));
      return dates;
    case "TWICE_MONTHLY": {
      // R-DEC-02: the first 15th or month-end at least a half-month after the start, then alternate.
      let next = nextHalfMonthBoundary(addDays(start, MIN_HALF_MONTH_DAYS));
      for (let k = 1; k <= slots; k++) {
        dates.push(next);
        next = followingHalfMonthBoundary(next);
      }
      return dates;
    }
  }
}

export interface ScheduledRound {
  number: number;
  /** Contribution Period k opens on payout date k−1 (or the start date for k = 1)… */
  periodStart: CalendarDate;
  /** …and closes on payout date k. */
  payoutDate: CalendarDate;
}

/** Rounds 1…`slots` with their contribution periods (§4.3). */
export function buildSchedule(
  start: CalendarDate,
  frequency: Frequency,
  slots: number,
  customDays?: number,
): ScheduledRound[] {
  const dates = payoutDates(start, frequency, slots, customDays);
  return dates.map((payoutDate, index) => ({
    number: index + 1,
    periodStart: index === 0 ? start : dates[index - 1],
    payoutDate,
  }));
}
