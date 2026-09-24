/**
 * Human-readable calendar date for user-facing text: "Fri, Oct 9", or "Fri, Jan 1, 2027" outside
 * the current year. Due/start dates are stored as UTC midnight, so formatting in UTC keeps the day
 * stable. Mirrors client/src/lib/dates.ts formatDueDate.
 */
export function formatDisplayDate(value: Date | string, now: Date = new Date()): string {
  const date = typeof value === "string" ? parseCalendarDate(value) : value;
  if (!date || Number.isNaN(date.getTime())) return String(value);
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  return date.toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

function parseCalendarDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}
