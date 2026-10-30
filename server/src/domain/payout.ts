import { addDebt, applyRepayment, chargePeriodInterest, type DebtState } from "./debt.js";
import type { Centavos, RateBasisPoints } from "./money.js";

export interface PayoutMemberInput {
  id: string;
  isOrganizer: boolean;
  /** Approved contributions for this period. Pending ones don't count (R-SUB-07, R-DEC-04). */
  approved: Centavos;
  /** Debt before this payout date. */
  debt: DebtState;
}

export interface PayoutInput {
  contribution: Centavos;
  pot: Centavos;
  rate: RateBasisPoints;
  recipientId: string;
  members: PayoutMemberInput[];
}

export interface MemberPayoutOutcome {
  id: string;
  /** contribution − approved, never negative. */
  shortfall: Centavos;
  /** R-PAY-02: the organizer put this into the pot on the member's behalf. */
  coveredByOrganizer: Centavos;
  /** R-DBT-03: charge on principal carried in from earlier periods. */
  periodInterest: Centavos;
  /** R-DBT-02: charge on this period's new debt. */
  newDebtInterest: Centavos;
  /** Debt after this payout date. */
  debt: DebtState;
}

export interface RecipientOutcome {
  id: string;
  ownShortfall: Centavos;
  /** The part of the recipient's accumulated debt settled out of the pot (R-PAY-03). */
  debtDeducted: { interest: Centavos; principal: Centavos };
  /** What the organizer hands over (R-PAY-04: never below zero). */
  netPayout: Centavos;
  /** Debt left after the deduction; non-zero only when deductions exceed the pot. */
  debt: DebtState;
}

export interface PayoutResult {
  recipient: RecipientOutcome;
  /** Every non-recipient member. */
  others: MemberPayoutOutcome[];
  /** Total the organizer put in for others' shortfalls. */
  organizerCovered: Centavos;
}

/**
 * Steps 2–4 of §7 on payout date k: cover every non-recipient's shortfall (it becomes debt, with
 * interest), and pay the recipient the pot less their own shortfall and their whole accumulated debt.
 * A recipient is never charged for anyone else's shortfall.
 */
export function processPayout(input: PayoutInput): PayoutResult {
  const { contribution, pot, rate, recipientId } = input;
  const recipientInput = input.members.find((m) => m.id === recipientId);
  if (!recipientInput) throw new Error("The recipient is not a member");

  const others = input.members
    .filter((m) => m.id !== recipientId)
    .map((member): MemberPayoutOutcome => {
      const shortfall = Math.max(0, contribution - member.approved);
      // R-DEC-11: the organizer covers their own shortfall and never owes themselves.
      if (member.isOrganizer) {
        return {
          id: member.id,
          shortfall,
          coveredByOrganizer: shortfall,
          periodInterest: 0,
          newDebtInterest: 0,
          debt: member.debt,
        };
      }
      // Existing principal is charged first; the new debt then gets its own creation charge.
      const period = chargePeriodInterest(member.debt, rate);
      const created = shortfall > 0 ? addDebt(period.debt, shortfall, rate) : { debt: period.debt, interestCharged: 0 };
      return {
        id: member.id,
        shortfall,
        coveredByOrganizer: shortfall,
        periodInterest: period.interestCharged,
        newDebtInterest: created.interestCharged,
        debt: created.debt,
      };
    });

  // R-DEC-05: no interest charge on the recipient's own payout date. R-DEC-10: the pot
  // covers the recipient's own shortfall first, then debt interest, then principal; whatever the pot
  // can't cover stays as existing debt, so payout day never creates new debt.
  const ownShortfall = Math.max(0, contribution - recipientInput.approved);
  const afterShortfall = Math.max(0, pot - ownShortfall);
  const deduction = applyRepayment(recipientInput.debt, afterShortfall);
  const recipient: RecipientOutcome = {
    id: recipientId,
    ownShortfall,
    debtDeducted: { interest: deduction.toInterest, principal: deduction.toPrincipal },
    netPayout: deduction.excess,
    debt: deduction.debt,
  };

  return {
    recipient,
    others,
    organizerCovered: others.reduce((sum, m) => sum + m.coveredByOrganizer, 0),
  };
}
