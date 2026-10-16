import { describe, expect, it } from "vitest";
import { computeAmounts, recomputeForSlots } from "./amounts.js";
import { addDebt, applyRepayment, NO_DEBT, outstanding, type DebtState } from "./debt.js";
import { canTransition, can } from "./lifecycle.js";
import { formatPeso, interestOn, pesos, rateFromPercent } from "./money.js";
import { processPayout, type PayoutResult } from "./payout.js";
import { buildSchedule, payoutDates } from "./schedule.js";
import { disputeAmountError, periodStatus, refundFor, submissionAmountError, submissionCap } from "./submissions.js";

describe("money", () => {
  it("charges interest to the nearest centavo, half up (R-AMT-04)", () => {
    expect(interestOn(pesos(1_000), rateFromPercent(1.25))).toBe(pesos(12.5));
    expect(interestOn(pesos(1_500), rateFromPercent(1.25))).toBe(pesos(18.75));
    // 0.10 × 1.25% = 0.125 centavos → 0; 0.40 × 1.25% = 0.5 centavos → 1.
    expect(interestOn(10, 125)).toBe(0);
    expect(interestOn(40, 125)).toBe(1);
    expect(interestOn(pesos(1_000), 0)).toBe(0);
  });

  it("formats pesos", () => {
    expect(formatPeso(pesos(6_243.75))).toBe("₱6,243.75");
    expect(formatPeso(pesos(10_000))).toBe("₱10,000");
  });
});

describe("amounts (R-AMT-01, R-AMT-02, R-LOB-10)", () => {
  it("multiplies in contribution mode", () => {
    expect(computeAmounts("CONTRIBUTION", pesos(2_000), 5)).toEqual({
      contribution: pesos(2_000),
      pot: pesos(10_000),
      potAdjustedFrom: null,
    });
  });

  it("rounds the contribution up to a whole peso in pot mode and reports the adjustment", () => {
    expect(computeAmounts("POT", pesos(10_000), 3)).toEqual({
      contribution: pesos(3_334),
      pot: pesos(10_002),
      potAdjustedFrom: pesos(10_000),
    });
    expect(computeAmounts("POT", pesos(10_000), 5).potAdjustedFrom).toBeNull();
  });

  it("keeps the entered amount fixed when the slot count changes", () => {
    expect(recomputeForSlots("CONTRIBUTION", { contribution: pesos(2_000), enteredPot: 0 }, 6).pot).toBe(pesos(12_000));
    expect(
      recomputeForSlots("POT", { contribution: pesos(2_000), enteredPot: pesos(10_000) }, 4).contribution,
    ).toBe(pesos(2_500));
  });
});

describe("schedule (§4.3)", () => {
  it("matches the monthly example table", () => {
    expect(buildSchedule("2026-11-01", "MONTHLY", 5)).toEqual([
      { number: 1, periodStart: "2026-11-01", payoutDate: "2026-12-01" },
      { number: 2, periodStart: "2026-12-01", payoutDate: "2027-01-01" },
      { number: 3, periodStart: "2027-01-01", payoutDate: "2027-02-01" },
      { number: 4, periodStart: "2027-02-01", payoutDate: "2027-03-01" },
      { number: 5, periodStart: "2027-03-01", payoutDate: "2027-04-01" },
    ]);
  });

  it("clamps monthly dates to the month's end and keeps the anchor day (R-FRQ-04)", () => {
    expect(payoutDates("2026-12-31", "MONTHLY", 5)).toEqual([
      "2027-01-31",
      "2027-02-28",
      "2027-03-31",
      "2027-04-30",
      "2027-05-31",
    ]);
    expect(payoutDates("2027-12-31", "MONTHLY", 2)).toEqual(["2028-01-31", "2028-02-29"]);
  });

  it("steps weekly, every two weeks, and by a custom interval", () => {
    expect(payoutDates("2026-11-01", "WEEKLY", 2)).toEqual(["2026-11-08", "2026-11-15"]);
    expect(payoutDates("2026-11-01", "BI_WEEKLY", 2)).toEqual(["2026-11-15", "2026-11-29"]);
    expect(payoutDates("2026-12-25", "CUSTOM", 2, 10)).toEqual(["2027-01-04", "2027-01-14"]);
    expect(() => payoutDates("2026-11-01", "CUSTOM", 2)).toThrow();
  });

  it("starts twice-monthly on the first 15th or month-end a half-month out, then alternates (R-DEC-02)", () => {
    expect(payoutDates("2026-11-01", "TWICE_MONTHLY", 4)).toEqual([
      "2026-11-30",
      "2026-12-15",
      "2026-12-31",
      "2027-01-15",
    ]);
    expect(payoutDates("2026-11-20", "TWICE_MONTHLY", 3)).toEqual(["2026-12-15", "2026-12-31", "2027-01-15"]);
    // Exactly 15 days out counts.
    expect(payoutDates("2027-01-31", "TWICE_MONTHLY", 2)).toEqual(["2027-02-15", "2027-02-28"]);
  });
});

describe("submissions (R-SUB-06, R-SUB-07)", () => {
  it("caps a new submission at what's left after approved and pending amounts", () => {
    expect(submissionCap(pesos(2_000), pesos(500), pesos(700))).toBe(pesos(800));
    expect(submissionCap(pesos(2_000), pesos(2_000), 0)).toBe(0);
    expect(submissionAmountError(pesos(900), pesos(800))).not.toBeNull();
    expect(submissionAmountError(pesos(800), pesos(800))).toBeNull();
    expect(submissionAmountError(0, pesos(800))).not.toBeNull();
  });

  it("counts only approved amounts", () => {
    expect(periodStatus(pesos(2_000), pesos(2_000), 0)).toEqual({ status: "PAID", pendingReview: false });
    expect(periodStatus(pesos(2_000), pesos(500), 1)).toEqual({ status: "PARTIAL", pendingReview: true });
    expect(periodStatus(pesos(2_000), 0, 2)).toEqual({ status: "UNPAID", pendingReview: true });
  });
});

describe("disputes (R-DSP-01, R-DEC-13, R-DSP-03)", () => {
  const contribution = pesos(2_000);
  it("allows lowering an approved amount, down to zero", () => {
    expect(disputeAmountError(pesos(1_500), pesos(2_000), pesos(2_000), contribution)).toBeNull();
    expect(disputeAmountError(0, pesos(2_000), pesos(2_000), contribution)).toBeNull();
    expect(refundFor(pesos(2_000), pesos(1_500))).toBe(pesos(500));
  });

  it("allows raising it, but not past the contribution", () => {
    // ₱500 and ₱1,000 approved; the ₱500 one can go up to ₱1,000.
    expect(disputeAmountError(pesos(1_000), pesos(500), pesos(1_500), contribution)).toBeNull();
    expect(disputeAmountError(pesos(1_001), pesos(500), pesos(1_500), contribution)).toMatch(/₱1,000/);
    expect(refundFor(pesos(500), pesos(1_000))).toBe(0);
  });

  it("rejects no change and negative amounts", () => {
    expect(disputeAmountError(pesos(2_000), pesos(2_000), pesos(2_000), contribution)).not.toBeNull();
    expect(disputeAmountError(-1, pesos(2_000), pesos(2_000), contribution)).not.toBeNull();
  });
});

describe("debt (§8)", () => {
  it("applies repayments to interest first, then principal (R-DBT-05)", () => {
    const { debt } = addDebt(NO_DEBT, pesos(1_000), 125);
    const paid = applyRepayment(debt, pesos(100));
    expect(paid.toInterest).toBe(pesos(12.5));
    expect(paid.toPrincipal).toBe(pesos(87.5));
    expect(paid.debt).toEqual({ principal: pesos(912.5), interest: 0 });
    expect(applyRepayment(paid.debt, pesos(1_000)).excess).toBe(pesos(87.5));
  });
});

describe("lifecycle (§3)", () => {
  it("cancels only from the lobby (R-DEC-03)", () => {
    expect(canTransition("LOBBY", "CANCELLED")).toBe(true);
    expect(canTransition("LAUNCHED", "CANCELLED")).toBe(false);
    expect(canTransition("ACTIVE", "CANCELLED")).toBe(false);
    expect(can.claimPlaceholder("ACTIVE")).toBe(true);
    expect(can.editSettings("LAUNCHED")).toBe(false);
  });
});

/**
 * Runs a whole cycle: `paid[k][member]` is what each member had approved in period k+1. Debt
 * repayments aren't modelled here; members carry debt until their payout or the end.
 */
function runCycle(options: {
  contribution: number;
  ratePercent: number;
  order: string[];
  paid: Record<string, number>[];
  repayBefore?: Record<number, Record<string, number>>;
}) {
  const contribution = pesos(options.contribution);
  const pot = contribution * options.order.length;
  const rate = rateFromPercent(options.ratePercent);
  const debts: Record<string, DebtState> = Object.fromEntries(options.order.map((id) => [id, NO_DEBT]));
  const results: PayoutResult[] = [];
  options.order.forEach((recipientId, index) => {
    for (const [id, amount] of Object.entries(options.repayBefore?.[index + 1] ?? {})) {
      debts[id] = applyRepayment(debts[id], pesos(amount)).debt;
    }
    const result = processPayout({
      contribution,
      pot,
      rate,
      recipientId,
      members: options.order.map((id) => ({
        id,
        isOrganizer: false,
        approved: pesos(options.paid[index][id] ?? options.contribution),
        debt: debts[id],
      })),
    });
    debts[recipientId] = result.recipient.debt;
    for (const other of result.others) debts[other.id] = other.debt;
    results.push(result);
  });
  return { results, debts };
}

describe("payout processing (§7, worked example §8.1)", () => {
  // 5 slots, 2,000 each, pot 10,000, 1.25%. C is 4th; everyone else always pays in full.
  const example = () =>
    runCycle({
      contribution: 2_000,
      ratePercent: 1.25,
      order: ["A", "B", "D", "C", "E"],
      paid: [{ C: 1_000 }, { C: 2_000 }, { C: 500 }, { C: 800 }, { C: 0 }],
    });

  it("charges C at creation and on every later payout date", () => {
    const { results } = example();
    const c = (k: number) => results[k].others.find((m) => m.id === "C")!;
    expect(c(0).debt).toEqual({ principal: pesos(1_000), interest: pesos(12.5) });
    expect(c(1).debt).toEqual({ principal: pesos(1_000), interest: pesos(25) });
    expect(c(2).debt).toEqual({ principal: pesos(2_500), interest: pesos(56.25) });
  });

  it("deducts C's own shortfall and whole debt from C's payout, with no charge that day (R-DEC-05)", () => {
    const { results } = example();
    const payout = results[3].recipient;
    expect(payout.ownShortfall).toBe(pesos(1_200));
    expect(payout.debtDeducted).toEqual({ interest: pesos(56.25), principal: pesos(2_500) });
    expect(payout.netPayout).toBe(pesos(6_243.75));
    expect(payout.debt).toEqual(NO_DEBT);
  });

  it("leaves C owing 2,025 at completion", () => {
    const { debts, results } = example();
    expect(debts.C).toEqual({ principal: pesos(2_000), interest: pesos(25) });
    expect(outstanding(debts.C)).toBe(pesos(2_025));
    // Everyone else's payout is the full pot: never reduced by C's shortfalls.
    for (const k of [0, 1, 2, 4]) expect(results[k].recipient.netPayout).toBe(pesos(10_000));
    expect(results[0].organizerCovered).toBe(pesos(1_000));
  });

  it("first recipient: every later shortfall is post-payout debt (R-DBT-09)", () => {
    const { results, debts } = runCycle({
      contribution: 1_000,
      ratePercent: 1,
      order: ["A", "B", "C"],
      paid: [{}, { A: 0 }, { A: 0 }],
    });
    expect(results[0].recipient.netPayout).toBe(pesos(3_000));
    // Period 2: 1,000 + 10. Period 3: +10 on 1,000, then 1,000 + 10.
    expect(debts.A).toEqual({ principal: pesos(2_000), interest: pesos(30) });
  });

  it("last recipient: all their debt comes off the final pot", () => {
    const { results, debts } = runCycle({
      contribution: 1_000,
      ratePercent: 1,
      order: ["A", "B", "C"],
      paid: [{ C: 0 }, { C: 500 }, {}],
    });
    // 1,000 + 10, +10, then 500 + 5 → principal 1,500, interest 25.
    expect(results[2].recipient.debtDeducted).toEqual({ interest: pesos(25), principal: pesos(1_500) });
    expect(results[2].recipient.netPayout).toBe(pesos(3_000 - 1_525));
    expect(debts.C).toEqual(NO_DEBT);
  });

  it("a member who pays nothing: with interest, deductions exceed the pot (R-PAY-04)", () => {
    const { results, debts } = runCycle({
      contribution: 1_000,
      ratePercent: 10,
      order: ["A", "B", "C"],
      paid: [{ C: 0 }, { C: 0 }, { C: 0 }],
    });
    // Before C's payout: 1,000 + 100, +100, 1,000 + 100 → principal 2,000, interest 300.
    // The 3,000 pot covers C's own 1,000 shortfall, the 300 interest, then 1,700 of principal.
    const payout = results[2].recipient;
    expect(payout.netPayout).toBe(0);
    expect(payout.debtDeducted).toEqual({ interest: pesos(300), principal: pesos(1_700) });
    expect(debts.C).toEqual({ principal: pesos(300), interest: 0 });
  });

  it("without interest, deductions never exceed the pot (R-DBT-10)", () => {
    const { results } = runCycle({
      contribution: 1_000,
      ratePercent: 0,
      order: ["A", "B", "C"],
      paid: [{ C: 0 }, { C: 0 }, { C: 0 }],
    });
    expect(results[2].recipient.netPayout).toBe(0);
    expect(results[2].recipient.debt).toEqual(NO_DEBT);
  });

  it("early repayment: a member who clears their debt gets the full pot (R-DBT-08)", () => {
    const { results } = runCycle({
      contribution: 1_000,
      ratePercent: 1,
      order: ["A", "B", "C"],
      paid: [{ C: 0 }, {}, {}],
      // Before payout 2, C repays 1,000 + 10 creation interest; nothing is left to charge on.
      repayBefore: { 2: { C: 1_010 } },
    });
    expect(results[1].others.find((m) => m.id === "C")!.periodInterest).toBe(0);
    expect(results[2].recipient.netPayout).toBe(pesos(3_000));
  });

  it("the organizer covers their own shortfall without owing themselves", () => {
    const result = processPayout({
      contribution: pesos(1_000),
      pot: pesos(2_000),
      rate: 125,
      recipientId: "M",
      members: [
        { id: "O", isOrganizer: true, approved: 0, debt: NO_DEBT },
        { id: "M", isOrganizer: false, approved: pesos(1_000), debt: NO_DEBT },
      ],
    });
    expect(result.others[0]).toMatchObject({ coveredByOrganizer: pesos(1_000), debt: NO_DEBT });
    expect(result.recipient.netPayout).toBe(pesos(2_000));
  });
});
