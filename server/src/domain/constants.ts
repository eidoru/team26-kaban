// Configurable limits from docs/paluwagan-user-journey.md. `null` marks a value the spec leaves TBD
// (R-OQ-01, R-DEC-12): the rule isn't enforced until a value is decided. Don't fill these in without a decision.

/** R-SET-01 */
export const MAX_NAME_LENGTH: number | null = null;
/** R-SET-02 (minimum is an assumption) */
export const MIN_SLOTS = 2;
export const MAX_SLOTS: number | null = null;
/** R-SET-05 */
export const MIN_START_LEAD_DAYS = 7;
/** R-SET-06 */
export const MAX_INTEREST_PERCENT: number | null = null;
/** R-SET-06 (assumption) */
export const INTEREST_DECIMAL_PLACES = 2;
/** R-FRQ-05 */
export const MIN_CUSTOM_INTERVAL_DAYS = 7;
/** R-DEC-02: the first TWICE_MONTHLY payout is at least this many days after the start. */
export const MIN_HALF_MONTH_DAYS = 15;
/** R-SWP-03 */
export const SWAP_LOCK_DAYS = 3;
/** R-SWP-04 */
export const SWAP_REQUEST_EXPIRY_DAYS: number | null = null;
/** §12 (assumption) */
export const REMINDER_DAYS_BEFORE = 3;
/** R-DEC-07 */
export const RECEIPT_AUTO_CONFIRM_DAYS: number | null = null;
/** Notes on submissions and denial reasons (the pre-rewrite note limit; the spec sets none). */
export const NOTE_MAX_LENGTH = 500;
/** Largest proof image, matching the bucket's limit (assumption; the spec sets none). */
export const MAX_PROOF_BYTES = 5 * 1024 * 1024;
/** Dispute reasons (the pre-rewrite dispute limit; the spec sets none). */
export const DISPUTE_REASON_MAX_LENGTH = 1000;
