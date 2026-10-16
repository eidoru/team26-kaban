import { interestOn, type Centavos, type RateBasisPoints } from "./money.js";

/**
 * What one member owes the organizer (§8). Interest is simple: charges are only ever computed on
 * principal, never on accrued interest (R-DBT-03).
 */
export interface DebtState {
  principal: Centavos;
  /** Accrued, unpaid interest. */
  interest: Centavos;
}

export const NO_DEBT: DebtState = { principal: 0, interest: 0 };

export function outstanding(debt: DebtState): Centavos {
  return debt.principal + debt.interest;
}

/**
 * R-DBT-01 / R-DBT-02: the organizer covered `shortfall`, so it becomes principal, with an interest
 * charge of rate × shortfall added right away.
 */
export function addDebt(debt: DebtState, shortfall: Centavos, rate: RateBasisPoints) {
  const interestCharged = interestOn(shortfall, rate);
  return {
    debt: { principal: debt.principal + shortfall, interest: debt.interest + interestCharged },
    interestCharged,
  };
}

/** R-DBT-03: a later payout date passed with principal unpaid; charge rate × remaining principal. */
export function chargePeriodInterest(debt: DebtState, rate: RateBasisPoints) {
  const interestCharged = interestOn(debt.principal, rate);
  return { debt: { ...debt, interest: debt.interest + interestCharged }, interestCharged };
}

/**
 * R-DBT-05: a repayment (or a payout deduction) goes to accrued interest first, then principal.
 * `excess` is whatever was left over once the debt reached zero.
 */
export function applyRepayment(debt: DebtState, amount: Centavos) {
  const toInterest = Math.min(amount, debt.interest);
  const toPrincipal = Math.min(amount - toInterest, debt.principal);
  return {
    debt: { principal: debt.principal - toPrincipal, interest: debt.interest - toInterest },
    toInterest,
    toPrincipal,
    excess: amount - toInterest - toPrincipal,
  };
}
