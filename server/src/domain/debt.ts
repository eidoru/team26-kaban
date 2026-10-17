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

/** One recorded change to a slot's debt: a DebtEntry, as the breakdown needs it. */
export interface DebtChange {
  kind: "SHORTFALL_COVERED" | "INTEREST_CHARGED" | "REPAYMENT" | "PAYOUT_DEDUCTION";
  /** The round whose payout made the change; repayments have none. */
  round: number | null;
  principalDelta: Centavos;
  interestDelta: Centavos;
}

/** What a slot's debt is made of, by the round that added it, and what has come off it. */
export interface DebtBreakdown {
  /** Rounds that added to the debt, oldest first: the shortfall covered (R-DBT-01) and interest charged (R-DBT-02/03). */
  rounds: { round: number; shortfall: Centavos; interest: Centavos }[];
  /** Paid back through debt payments and late contributions (R-DBT-04, R-DBT-06). */
  repaid: Centavos;
  /** Taken from the slot's own payout (R-PAY-03). */
  deducted: Centavos;
}

/**
 * Groups a slot's debt changes by round, so the organizer sees what each round added. Repayments
 * aren't assigned to rounds: they go to interest first, then principal (R-DBT-05), not to a round.
 * Sum of the rounds less `repaid` and `deducted` is what's owed now.
 */
export function debtBreakdown(changes: DebtChange[]): DebtBreakdown {
  const byRound = new Map<number, { round: number; shortfall: Centavos; interest: Centavos }>();
  let repaid = 0;
  let deducted = 0;
  for (const c of changes) {
    const total = c.principalDelta + c.interestDelta;
    if (c.kind === "REPAYMENT") repaid -= total;
    else if (c.kind === "PAYOUT_DEDUCTION") deducted -= total;
    else if (c.round !== null) {
      const row = byRound.get(c.round) ?? { round: c.round, shortfall: 0, interest: 0 };
      row.shortfall += c.principalDelta;
      row.interest += c.interestDelta;
      byRound.set(c.round, row);
    }
  }
  return { rounds: [...byRound.values()].sort((a, b) => a.round - b.round), repaid, deducted };
}
