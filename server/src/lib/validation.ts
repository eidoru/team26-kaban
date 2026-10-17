import { z } from "zod";

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
