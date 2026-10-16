/** An expected failure with a message the user can read. The error handler sends it as-is. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Stable machine-readable reason, for clients that branch on it (e.g. "FULL"). */
    readonly code?: string,
    /** Per-field messages for forms, keyed by field name. */
    readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`, "NOT_FOUND");
export const forbidden = (message: string) => new AppError(403, message, "FORBIDDEN");
export const conflict = (message: string, code?: string) => new AppError(409, message, code ?? "CONFLICT");
export const badRequest = (message: string, code?: string) => new AppError(400, message, code ?? "BAD_REQUEST");
