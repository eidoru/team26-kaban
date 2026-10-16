const DAY_MS = 24 * 60 * 60 * 1000;

/** Round dates arrive as YYYY-MM-DD; parse as a local date so the day never shifts across time zones. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatDay(date: Date): string {
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/**
 * The app's one date style for calendar dates (due/start dates): "Fri, Oct 9", or
 * "Fri, Jan 1, 2027" outside the current year. Falls back to the raw value.
 */
export function formatDueDate(value: string | null | undefined): string {
  const date = parseDateOnly(value);
  return date ? formatDay(date) : (value ?? "");
}

/** Same style for real timestamps (expiry, completion), shown as the viewer's local day. */
export function formatLocalDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : formatDay(date);
}

/**
 * A calendar date split for a date column: `day` "Nov 15" over `weekday` "Sun", which carries the
 * year outside the current one ("Fri · 2027").
 */
export function formatDateParts(value: string | null | undefined): { day: string; weekday: string } | null {
  const date = parseDateOnly(value);
  if (!date) return null;
  const weekday = date.toLocaleDateString(undefined, { weekday: "short" });
  return {
    day: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
    weekday: date.getFullYear() === new Date().getFullYear() ? weekday : `${weekday} · ${date.getFullYear()}`,
  };
}

/** Whole days from today to a calendar date: 0 today, negative once it's past. */
export function daysUntil(value: string | null | undefined): number | null {
  const date = parseDateOnly(value);
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

/** Relative hint for a due date: "today", "tomorrow", "in 3 days", "2 days overdue". */
export function dueHint(value: string | null | undefined): { label: string; overdue: boolean } | null {
  const days = daysUntil(value);
  if (days === null) return null;
  if (days === 0) return { label: "today", overdue: false };
  if (days === 1) return { label: "tomorrow", overdue: false };
  if (days > 1) return { label: `in ${days} days`, overdue: false };
  const late = -days;
  return { label: `${late} day${late === 1 ? "" : "s"} overdue`, overdue: true };
}

/** Section heading for a local day: "Today", "Yesterday", or the app date style ("Fri, Oct 9"). */
export function formatDayHeading(date: Date): string {
  const now = new Date();
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOf(now) - startOf(date)) / DAY_MS);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return formatDay(date);
}

/** Today in the Philippines as YYYY-MM-DD: the day the server's date rules use. */
export function todayInManila(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila" }).format(now);
}
