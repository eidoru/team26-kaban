const DAY_MS = 24 * 60 * 60 * 1000;

/** Round dates arrive as YYYY-MM-DD; parse as a local date so the day never shifts across time zones. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** "Fri, Oct 9" — adds the year only when it isn't the current one. Falls back to the raw value. */
export function formatDueDate(value: string | null | undefined): string {
  const date = parseDateOnly(value);
  if (!date) return value ?? "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Relative hint for a due date: "today", "tomorrow", "in 3 days", "2 days overdue". */
export function dueHint(value: string | null | undefined): { label: string; overdue: boolean } | null {
  const date = parseDateOnly(value);
  if (!date) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((date.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return { label: "today", overdue: false };
  if (days === 1) return { label: "tomorrow", overdue: false };
  if (days > 1) return { label: `in ${days} days`, overdue: false };
  const late = -days;
  return { label: `${late} day${late === 1 ? "" : "s"} overdue`, overdue: true };
}
