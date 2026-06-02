import { ContributionSource, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import {
  getPaidAmount,
  getRoundCloseObligationAmount,
  getShortfall,
  obligationStatusFromAmounts,
} from "./obligations.js";

const d = (n: number | string) => new Prisma.Decimal(n);

describe("getPaidAmount", () => {
  it("returns amount when confirmed", () => {
    expect(getPaidAmount("confirmed", d(500)).toString()).toBe("500");
  });

  it("returns zero when not confirmed", () => {
    expect(getPaidAmount("reported", d(500)).toString()).toBe("0");
    expect(getPaidAmount("pending", d(500)).toString()).toBe("0");
  });
});

describe("getShortfall", () => {
  const expected = d(1000);

  it("returns zero for full confirmed payment", () => {
    expect(getShortfall(expected, "confirmed", d(1000)).toString()).toBe("0");
  });

  it("returns remainder for partial confirmed payment", () => {
    expect(getShortfall(expected, "confirmed", d(600)).toString()).toBe("400");
  });

  it("returns full expected for pending contribution", () => {
    expect(getShortfall(expected, "pending", d(0)).toString()).toBe("1000");
  });

  it("returns full expected for reported but unconfirmed payment", () => {
    expect(getShortfall(expected, "reported", d(1000)).toString()).toBe("1000");
  });
});

describe("getRoundCloseObligationAmount", () => {
  const expected = d(1000);

  it("records no debt for fully confirmed payments (member or manager-recorded)", () => {
    expect(
      getRoundCloseObligationAmount(expected, {
        status: "confirmed",
        amount: d(1000),
        source: ContributionSource.member,
      }).toString(),
    ).toBe("0");
    expect(
      getRoundCloseObligationAmount(expected, {
        status: "confirmed",
        amount: d(1000),
        source: ContributionSource.organizer,
      }).toString(),
    ).toBe("0");
  });

  it("records unpaid remainder for partial confirmed payments", () => {
    expect(
      getRoundCloseObligationAmount(expected, {
        status: "confirmed",
        amount: d(600),
        source: ContributionSource.member,
      }).toString(),
    ).toBe("400");
    expect(
      getRoundCloseObligationAmount(expected, {
        status: "confirmed",
        amount: d(600),
        source: ContributionSource.organizer,
      }).toString(),
    ).toBe("400");
  });

  it("records full expected for unpaid pending contributions", () => {
    expect(
      getRoundCloseObligationAmount(expected, {
        status: "pending",
        amount: d(0),
        source: ContributionSource.member,
      }).toString(),
    ).toBe("1000");
  });
});

describe("obligationStatusFromAmounts", () => {
  it("marks fully settled obligations", () => {
    expect(obligationStatusFromAmounts(d(1000), d(1000))).toBe("settled");
  });

  it("marks partially settled obligations", () => {
    expect(obligationStatusFromAmounts(d(1000), d(400))).toBe("partially_settled");
  });

  it("marks unsettled obligations", () => {
    expect(obligationStatusFromAmounts(d(1000), d(0))).toBe("unsettled");
  });
});
