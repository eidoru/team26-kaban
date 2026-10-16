import type { CalendarDate } from "../domain/schedule.js";

/** Users are in the Philippines; "today" and every due date are Manila calendar days. */
export const APP_TIME_ZONE = "Asia/Manila";

export function todayInManila(now: Date = new Date()): CalendarDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(now);
}

/** A Date from a @db.Date column (UTC midnight) as a calendar date. */
export function toCalendarDate(value: Date): CalendarDate {
  return value.toISOString().slice(0, 10);
}

/** A calendar date as the UTC-midnight Date that @db.Date columns expect. */
export function fromCalendarDate(value: CalendarDate): Date {
  return new Date(`${value}T00:00:00.000Z`);
}
