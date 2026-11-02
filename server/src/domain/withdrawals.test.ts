import { describe, expect, it } from "vitest";
import { acceptanceStale, leaveBlocker, leaveTodos, replacementBlocker, type LeavingSlot } from "./withdrawals.js";

const slot = (over: Partial<LeavingSlot> = {}): LeavingSlot => ({
  state: "ACTIVE",
  isOrganizer: false,
  isPlaceholder: false,
  turn: { paidOut: false, isOpenRound: false, payoutDate: "2027-02-01" },
  ...over,
});

describe("leaveBlocker (R-WDR-01, R-WDR-02)", () => {
  it("lets a member with an upcoming turn leave while it runs or before it starts", () => {
    expect(leaveBlocker(slot(), "2026-12-01")).toBeNull();
    expect(leaveBlocker(slot({ state: "LAUNCHED" }), "2026-12-01")).toBeNull();
  });

  it("points lobby members to plain leaving and refuses ended paluwagans", () => {
    expect(leaveBlocker(slot({ state: "LOBBY" }), "2026-12-01")).toMatch(/just leave/);
    for (const state of ["COMPLETED", "COMPLETED_WITH_OUTSTANDING_DEBT", "CANCELLED"] as const) {
      expect(leaveBlocker(slot({ state }), "2026-12-01")).toMatch(/ended/);
    }
  });

  it("never lets the organizer leave, and leaves placeholders to claim links", () => {
    expect(leaveBlocker(slot({ isOrganizer: true }), "2026-12-01")).toMatch(/organizer/);
    expect(leaveBlocker(slot({ isPlaceholder: true }), "2026-12-01")).toMatch(/claim link/);
  });

  it("refuses a slot that was paid out", () => {
    expect(leaveBlocker(slot({ turn: { paidOut: true, isOpenRound: false, payoutDate: "2026-12-01" } }), "2027-01-05")).toMatch(
      /received your payout/,
    );
  });

  it("locks the open round's recipient within 3 days of the payout, as swaps (R-SWP-03)", () => {
    const current = slot({ turn: { paidOut: false, isOpenRound: true, payoutDate: "2026-12-01" } });
    expect(leaveBlocker(current, "2026-11-27")).toBeNull();
    expect(leaveBlocker(current, "2026-11-28")).toMatch(/less than 3 days/);
    expect(leaveBlocker(current, "2026-12-01")).not.toBeNull();
  });

  it("words it for the replacement and the organizer too", () => {
    const paid = slot({ turn: { paidOut: true, isOpenRound: false, payoutDate: "2026-12-01" } });
    expect(leaveBlocker(paid, "2027-01-05", "other")).toBe("This slot was paid out, so it can't change hands.");
    const current = slot({ turn: { paidOut: false, isOpenRound: true, payoutDate: "2026-12-01" } });
    expect(leaveBlocker(current, "2026-11-30", "other")).toBe("This slot's payout is less than 3 days away, so it is locked until then.");
  });

  it("doesn't lock a later turn near its own date", () => {
    expect(leaveBlocker(slot({ turn: { paidOut: false, isOpenRound: false, payoutDate: "2026-12-02" } }), "2026-12-01")).toBeNull();
  });
});

describe("leaveTodos (R-WDR-03)", () => {
  it("is empty once nothing is waiting", () => {
    expect(leaveTodos({ pendingPayments: 0, pendingReports: 0, swapInProgress: false })).toEqual([]);
  });

  it("lists every kind of item still waiting", () => {
    expect(leaveTodos({ pendingPayments: 2, pendingReports: 1, swapInProgress: true })).toEqual([
      "Wait for the organizer to review your 2 payments, or withdraw them.",
      "Wait for the organizer to decide your 1 problem report, or withdraw it.",
      "Settle or withdraw your turn swap.",
    ]);
  });

  it("words it for the replacement and the organizer", () => {
    expect(leaveTodos({ pendingPayments: 1, pendingReports: 2, swapInProgress: false }, "other")).toEqual([
      "1 payment on this slot is waiting for review.",
      "2 problem reports on this slot are waiting.",
    ]);
  });
});

describe("replacementBlocker (R-WDR-07)", () => {
  const person = { isMember: false, replacingAnother: false, debts: [] };

  it("accepts a newcomer with no debt", () => {
    expect(replacementBlocker(person)).toBeNull();
  });

  it("refuses a current member, including the leaver", () => {
    expect(replacementBlocker({ ...person, isMember: true })).toMatch(/only one slot/);
  });

  it("refuses someone already stepping in for another member here", () => {
    expect(replacementBlocker({ ...person, replacingAnother: true })).toMatch(/another member/);
  });

  it("refuses someone in debt anywhere (R-DEC-39)", () => {
    expect(replacementBlocker({ ...person, debts: [{ groupId: "g2", groupName: "Opisina", owed: 150_000 }] })).toBe(
      "You still owe ₱1,500 in Opisina. Settle it before you join another paluwagan.",
    );
  });
});

describe("acceptanceStale (R-WDR-10)", () => {
  it("resets only when the slot's debt grew after acceptance", () => {
    expect(acceptanceStale(100_000, 100_000)).toBe(false);
    expect(acceptanceStale(100_000, 50_000)).toBe(false);
    expect(acceptanceStale(100_000, 101_250)).toBe(true);
  });
});
