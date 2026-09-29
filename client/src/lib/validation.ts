// Client-side mirrors of the server's input rules (server/src/lib/validation.ts), so forms can
// explain a problem before submitting. The server still enforces every rule.

/** Largest per-member contribution. */
export const MAX_CONTRIBUTION = 1_000_000;
/** Largest single payment or settlement. */
export const MAX_PAYMENT = 100_000_000;

/** Character limits, matching the server schemas. */
export const LIMITS = {
  name: 100,
  contact: 200,
  note: 500,
  disputeReason: 1000,
  resolution: 2000,
} as const;

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** Why `value` isn't a usable peso amount (positive, centavo precision, at most `max`), or null. */
export function pesoAmountError(value: number, max: number): string | null {
  if (!Number.isFinite(value) || value <= 0) return "Enter an amount greater than zero.";
  if (!hasAtMostTwoDecimals(value)) return "Amounts can have at most 2 decimal places.";
  if (value > max) return `Amount can't be more than ₱${max.toLocaleString("en-US")}.`;
  return null;
}

/** Parses a typed amount; blank or non-numeric text (including "1e3") becomes NaN. */
export function parseAmountInput(raw: string): number {
  const trimmed = raw.trim().replace(/,/g, "");
  return /^\d*\.?\d+$|^\d+\.$/.test(trimmed) ? Number(trimmed) : NaN;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

/** Today's date in the viewer's time zone as YYYY-MM-DD, for date input `min` and past checks. */
export function todayDateInput(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** YYYY-MM-DD strings compare correctly as text. */
export function isPastDateInput(value: string): boolean {
  return value.slice(0, 10) < todayDateInput();
}
