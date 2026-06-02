import { describe, expect, it } from "vitest";
import { canRaiseContributionDispute } from "./disputes.js";

const base = {
  groupStarted: true,
  isManager: false,
  viewerMembershipId: "mem-a",
  contributionMembershipId: "mem-a",
  contributionStatus: "reported",
  hasOpenDispute: false,
};

describe("canRaiseContributionDispute", () => {
  it("allows a member to dispute their own reported contribution", () => {
    expect(canRaiseContributionDispute(base)).toBe(true);
  });

  it("allows a member to dispute their own confirmed contribution", () => {
    expect(
      canRaiseContributionDispute({ ...base, contributionStatus: "confirmed" }),
    ).toBe(true);
  });

  it("denies managers", () => {
    expect(canRaiseContributionDispute({ ...base, isManager: true })).toBe(false);
  });

  it("denies disputing another member's contribution", () => {
    expect(
      canRaiseContributionDispute({ ...base, contributionMembershipId: "mem-b" }),
    ).toBe(false);
  });

  it("denies when group has not started", () => {
    expect(canRaiseContributionDispute({ ...base, groupStarted: false })).toBe(false);
  });

  it("denies when an open dispute already exists", () => {
    expect(canRaiseContributionDispute({ ...base, hasOpenDispute: true })).toBe(false);
  });

  it("denies pending or other statuses", () => {
    expect(canRaiseContributionDispute({ ...base, contributionStatus: "pending" })).toBe(
      false,
    );
  });
});
