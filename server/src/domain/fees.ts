import { interestOn, type Centavos, type RateBasisPoints } from "./money.js";

/**
 * The organizing fee (R-SET-08, R-DEC-39): an optional percentage the organizer charges for running
 * the paluwagan. It is paid on top of contributions and on top of debt principal repaid, never on
 * interest, and never goes into the pot, the room rule (R-DEC-29) or debt.
 */

/** rate × amount, rounded to the nearest centavo, half up (R-AMT-04), per payment. */
export function feeOn(amount: Centavos, rate: RateBasisPoints): Centavos {
  return interestOn(amount, rate);
}

/** The rate a slot pays: the organizer would only pay themselves, so none (R-DEC-39, like R-DEC-11). */
export function feeRateFor(isOrganizer: boolean, rate: RateBasisPoints): RateBasisPoints {
  return isOrganizer ? 0 : rate;
}

/**
 * R-DEC-39 / R-DBT-05: a debt payment goes to accrued interest first, and only the principal part
 * carries the fee. `interestAhead` is the interest still owed after pending debt payments, which
 * are applied first. Worked out when the payment is sent; the recorded fee stands even if interest
 * is charged before review (a known limit, R-DEC-39).
 */
export function debtPaymentFee(amount: Centavos, interestAhead: Centavos, rate: RateBasisPoints): Centavos {
  return feeOn(Math.max(0, amount - Math.max(0, interestAhead)), rate);
}

/**
 * R-DEC-39 on payout day: the most of `principal` the pot can settle when each peso of principal
 * also brings its fee, so principal + fee ≤ `available`. What's left stays as debt; its fee is paid
 * when it is repaid. When the money runs short it is all used, so nothing is handed over while debt
 * remains.
 */
export function principalWithFee(available: Centavos, principal: Centavos, rate: RateBasisPoints) {
  const total = (p: Centavos) => p + feeOn(p, rate);
  if (available <= 0 || principal <= 0) return { principal: 0, fee: 0 };
  if (total(principal) <= available) return { principal, fee: feeOn(principal, rate) };
  // Start just below the exact answer and step up; rounding moves it by a centavo at most.
  let p = Math.min(principal, Math.floor((available * 10_000) / (10_000 + rate)));
  while (p > 0 && total(p) > available) p--;
  while (p < principal && total(p + 1) <= available) p++;
  // The pot is used up: a rounding centavo goes to the fee rather than back to the recipient.
  return { principal: p, fee: available - p };
}
