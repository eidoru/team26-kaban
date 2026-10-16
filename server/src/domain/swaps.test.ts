import { describe, expect, it } from "vitest";
import { needsOrganizerApproval, swapBlocker, type SwapTurn } from "./swaps.js";

const turn = (over: Partial<SwapTurn>): SwapTurn => ({
  slotId: "a",
  roundNumber: 3,
  paidOut: false,
  isOpenRound: false,
  payoutDate: "2027-02-01",
  ...over,
});

describe("swapBlocker (R-SWP-01, R-SWP-03)", () => {
  it("allows two upcoming turns", () => {
    expect(swapBlocker(turn({}), turn({ slotId: "b", roundNumber: 5 }), "2026-12-01")).toBeNull();
  });

  it("refuses a turn that was already paid out", () => {
    expect(swapBlocker(turn({ paidOut: true }), turn({ slotId: "b" }), "2026-12-01")).toMatch(/paid out/);
  });

  it("locks the current recipient's turn within 3 days of the payout", () => {
    const current = turn({ slotId: "b", roundNumber: 1, isOpenRound: true, payoutDate: "2026-12-01" });
    expect(swapBlocker(turn({}), current, "2026-11-27")).toBeNull();
    expect(swapBlocker(turn({}), current, "2026-11-28")).toMatch(/locked within 3 days/);
    expect(swapBlocker(turn({}), current, "2026-12-01")).not.toBeNull();
  });

  it("only locks the open round, not later ones near their own dates", () => {
    expect(swapBlocker(turn({ payoutDate: "2026-12-02" }), turn({ slotId: "b" }), "2026-12-01")).toBeNull();
  });

  it("refuses swapping with yourself", () => {
    expect(swapBlocker(turn({}), turn({}), "2026-12-01")).not.toBeNull();
  });
});

describe("needsOrganizerApproval (R-SWP-02, R-DEC-22)", () => {
  it("asks the organizer only when they aren't already a party", () => {
    expect(needsOrganizerApproval({ requesterActsAsOrganizer: false, targetActsAsOrganizer: false })).toBe(true);
    expect(needsOrganizerApproval({ requesterActsAsOrganizer: true, targetActsAsOrganizer: false })).toBe(false);
    expect(needsOrganizerApproval({ requesterActsAsOrganizer: false, targetActsAsOrganizer: true })).toBe(false);
  });
});
