import { ContributionStatus, Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { canReportContribution, ContributionError, resolvePaidAmount } from "./contributions.js";

const d = (n: number | string) => new Prisma.Decimal(n);

describe("resolvePaidAmount", () => {
  const expected = d(500);

  it("returns the full expected amount when no amount is given", () => {
    expect(resolvePaidAmount(expected).toString()).toBe("500");
  });

  it("accepts a partial amount within (0, expected]", () => {
    expect(resolvePaidAmount(expected, 200).toString()).toBe("200");
    expect(resolvePaidAmount(expected, 500).toString()).toBe("500");
  });

  it("rejects zero or negative amounts", () => {
    expect(() => resolvePaidAmount(expected, 0)).toThrow(ContributionError);
    expect(() => resolvePaidAmount(expected, -10)).toThrow(ContributionError);
  });

  it("rejects amounts greater than expected", () => {
    expect(() => resolvePaidAmount(expected, 501)).toThrow(ContributionError);
  });
});

describe("canReportContribution", () => {
  it("allows the owner to report a pending contribution", () => {
    expect(canReportContribution(ContributionStatus.pending, true)).toBe(true);
  });

  it("allows the owner to top up a reported-but-unconfirmed contribution", () => {
    expect(canReportContribution(ContributionStatus.reported, true)).toBe(true);
  });

  it("denies a confirmed contribution regardless of ownership", () => {
    expect(canReportContribution(ContributionStatus.confirmed, true)).toBe(false);
  });

  it("denies a non-owner regardless of status", () => {
    expect(canReportContribution(ContributionStatus.pending, false)).toBe(false);
    expect(canReportContribution(ContributionStatus.reported, false)).toBe(false);
  });
});
