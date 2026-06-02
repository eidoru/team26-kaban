import { GroupStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { shouldResetPayoutOrder } from "./groups.js";

describe("shouldResetPayoutOrder", () => {
  it("resets when forming roster drops below capacity with turns assigned", () => {
    expect(
      shouldResetPayoutOrder({
        groupStatus: GroupStatus.forming,
        filledCount: 5,
        slotCount: 6,
        assignedTurnCount: 6,
      }),
    ).toBe(true);
  });

  it("does not reset when roster is still full", () => {
    expect(
      shouldResetPayoutOrder({
        groupStatus: GroupStatus.forming,
        filledCount: 6,
        slotCount: 6,
        assignedTurnCount: 6,
      }),
    ).toBe(false);
  });

  it("does not reset when no turn order was assigned", () => {
    expect(
      shouldResetPayoutOrder({
        groupStatus: GroupStatus.forming,
        filledCount: 4,
        slotCount: 6,
        assignedTurnCount: 0,
      }),
    ).toBe(false);
  });

  it("does not reset after the group has activated", () => {
    expect(
      shouldResetPayoutOrder({
        groupStatus: GroupStatus.active,
        filledCount: 5,
        slotCount: 6,
        assignedTurnCount: 6,
      }),
    ).toBe(false);
  });
});
