// Client-side checks for the account forms (register, profile), mirroring server/src/routes/auth.ts.
// Paluwagan rules live in server/src/domain and are imported through @domain, so they never drift.

/** Character limits for a person's name and contact, matching the server schemas. */
export const LIMITS = {
  name: 100,
  contact: 200,
} as const;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}
