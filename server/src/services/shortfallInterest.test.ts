import { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  computeAccruedInterest,
  countInterestPeriods,
  getObligationTotalRemaining,
  getRemainingPrincipal,
  resolveInterestAccrualRound,
  splitSettlementPayment,
  toShortfallInterestTerms,
} from "./shortfallInterest.js";

const d = (n: number | string) => new Prisma.Decimal(n);

const monthlyTerms = toShortfallInterestTerms({
  shortfallInterestRatePercent: d(5),
  frequency: "monthly",
  frequencyDays: null,
});

describe("resolveInterestAccrualRound", () => {
  it("uses the current round when the cycle is active", () => {
    expect(
      resolveInterestAccrualRound({ lastClosedRoundNumber: 1, currentRoundNumber: 2 }),
    ).toBe(2);
  });

  it("uses the last closed round when the cycle has finished", () => {
    expect(
      resolveInterestAccrualRound({ lastClosedRoundNumber: 5, currentRoundNumber: null }),
    ).toBe(5);
  });
});

describe("countInterestPeriods", () => {
  it("returns zero while the source round is still the latest closed round", () => {
    expect(
      countInterestPeriods(1, { lastClosedRoundNumber: 1, currentRoundNumber: null }),
    ).toBe(0);
  });

  it("accrues one period when the next round has opened", () => {
    expect(
      countInterestPeriods(1, { lastClosedRoundNumber: 1, currentRoundNumber: 2 }),
    ).toBe(1);
  });

  it("accrues one period per subsequent round that has started", () => {
    expect(
      countInterestPeriods(1, { lastClosedRoundNumber: 3, currentRoundNumber: 4 }),
    ).toBe(3);
  });

  it("never returns negative periods", () => {
    expect(
      countInterestPeriods(3, { lastClosedRoundNumber: 1, currentRoundNumber: 2 }),
    ).toBe(0);
  });
});

describe("computeAccruedInterest", () => {
  it("returns zero when rate is zero", () => {
    const terms = toShortfallInterestTerms({
      shortfallInterestRatePercent: d(0),
      frequency: "monthly",
      frequencyDays: null,
    });
    expect(computeAccruedInterest(d(1000), terms, 2).toString()).toBe("0");
  });

  it("applies simple interest per elapsed round period", () => {
    expect(computeAccruedInterest(d(1000), monthlyTerms, 2).toString()).toBe("100");
  });
});

describe("getObligationTotalRemaining", () => {
  it("includes principal and accrued interest", () => {
    const total = getObligationTotalRemaining(
      {
        amount: d(1000),
        settledAmount: d(200),
      },
      monthlyTerms,
      {
        sourceRoundNumber: 1,
        lastClosedRoundNumber: 1,
        currentRoundNumber: 2,
      },
    );
    // 800 principal + 5% of 800 for one started round = 40
    expect(total.toString()).toBe("840");
  });
});

describe("getRemainingPrincipal", () => {
  it("never returns negative principal", () => {
    expect(getRemainingPrincipal(d(500), d(600)).toString()).toBe("0");
  });
});

describe("splitSettlementPayment", () => {
  it("pays interest before principal", () => {
    const { interestPaid, principalPaid } = splitSettlementPayment(d(150), d(800), d(40));
    expect(interestPaid.toString()).toBe("40");
    expect(principalPaid.toString()).toBe("110");
  });

  it("applies full payment to interest when principal is zero", () => {
    const { interestPaid, principalPaid } = splitSettlementPayment(d(25), d(0), d(40));
    expect(interestPaid.toString()).toBe("25");
    expect(principalPaid.toString()).toBe("0");
  });
});
