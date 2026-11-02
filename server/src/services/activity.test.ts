import { readFileSync } from "node:fs";
import { describe as suite, expect, it } from "vitest";
import { categoryOf, describe } from "./activity.js";

// Every action the code can write (lib/audit.ts), so a new one can't ship without a sentence.
const actions = [...readFileSync(new URL("../lib/audit.ts", import.meta.url), "utf8").matchAll(/\| "([a-z_]+\.[a-z_]+)"/g)].map((m) => m[1]);

suite("activity sentences (R-AUD-03)", () => {
  it("knows every audit action", () => {
    expect(actions.length).toBeGreaterThan(40);
    for (const action of actions) {
      const text = describe({ action, actor: "Ana", target: "Mia", amounts: {}, before: {}, after: {} });
      expect(text.title, action).not.toBe(action);
    }
  });

  it("writes amounts and before/after values in pesos", () => {
    expect(
      describe({ action: "dispute.raised", actor: "Mia", target: "Mia", amounts: {}, before: { amount: 200_000 }, after: { amount: 150_000, reason: "Refund" } }),
    ).toEqual({ title: "Mia reported a problem with their payment: ₱2,000 → ₱1,500", detail: "Refund" });
    expect(
      describe({ action: "submission.approved", actor: "Ana", target: "Ana", amounts: { amount: 200_000 }, before: {}, after: { round: 2 } }).title,
    ).toBe("Ana approved their own ₱2,000 in round 2");
    expect(
      describe({ action: "group.edited", actor: "Ana", target: null, amounts: {}, before: { slotCount: "5" }, after: { slotCount: "6" } }).detail,
    ).toBe("Slots: 5 → 6");
  });

  it("names the stars in ratings, which the log shows to every member (R-DEC-43)", () => {
    expect(
      describe({ action: "rating.given", actor: "Olive", target: "Mia", amounts: {}, before: {}, after: { stars: 4, role: "MEMBER" } }).title,
    ).toBe("Olive rated Mia 4 stars as a member");
    expect(
      describe({ action: "rating.given", actor: "Mia", target: "Olive", amounts: {}, before: {}, after: { stars: 1, role: "ORGANIZER" } }).title,
    ).toBe("Mia rated Olive 1 star as the organizer");
    expect(
      describe({ action: "rating.changed", actor: "Olive", target: "Mia", amounts: {}, before: { stars: 3 }, after: { stars: 5, role: "MEMBER" } }).title,
    ).toBe("Olive changed Mia's rating from 3 stars to 5 stars");
  });

  it("files actions under their filter", () => {
    expect(categoryOf("submission.approved")).toBe("payments");
    expect(categoryOf("debt.interest_charged")).toBe("debts");
    expect(categoryOf("swap.approved")).toBe("swaps");
    expect(categoryOf("placeholder.claimed")).toBe("members");
    expect(categoryOf("withdrawal.approved")).toBe("members");
    expect(categoryOf("rating.given")).toBe("members");
  });
});
