import { z } from "zod";

/** Largest per-member contribution. A full 30-slot pot stays well inside the Decimal(12, 2) columns. */
export const MAX_CONTRIBUTION = 1_000_000;
/** Largest single payment or settlement; a debt can span several rounds plus interest. */
export const MAX_PAYMENT = 100_000_000;

export function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

/** A positive peso amount with centavo precision, capped at `max`. */
export function pesoAmount(max: number) {
  return z
    .number({ invalid_type_error: "Enter an amount" })
    .positive("Amount must be greater than zero")
    .max(max, `Amount can't be more than ₱${max.toLocaleString("en-US")}`)
    .refine(hasAtMostTwoDecimals, "Amount can have at most 2 decimal places");
}

/** Trimmed text that must not be blank. */
export function requiredText(label: string, max: number) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);
}

/** Trimmed text that may be empty. */
export function optionalText(label: string, max: number) {
  return z.string().trim().max(max, `${label} must be ${max} characters or fewer`);
}

export const emailField = z.string().trim().email("Enter a valid email address");

export const newPasswordField = z.string().min(8, "Password must be at least 8 characters");

/**
 * The earliest calendar date that is still "today" somewhere (UTC−12). Clients block past dates in
 * the user's own time zone; the server only needs to reject dates that are past for everyone.
 */
export function earliestStartDate(now: Date = new Date()): string {
  return new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function isPastStartDate(value: Date | string, now: Date = new Date()): boolean {
  const date = typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
  return date < earliestStartDate(now);
}

/** A YYYY-MM-DD start date that is today or later. */
export const startDateField = z
  .string()
  .date("Enter a valid date")
  .refine((value) => !isPastStartDate(value), "Start date can't be in the past");
