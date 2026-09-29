import { describe, expect, it } from "vitest";
import { buildAttentionItems } from "./homeOverview.js";

const base = {
  formingDetails: [],
  pendingConfirmations: 0,
  confirmGroup: null,
  dueContributions: [],
  totalOwed: null,
  debts: [],
  queue: { claims: [], disputes: [] },
};

describe("buildAttentionItems", () => {
  it("is empty when nothing needs the user", () => {
    expect(buildAttentionItems(base)).toEqual([]);
  });

  it("tells members what they owe per group, linking to that group's Issues tab", () => {
    const items = buildAttentionItems({
      ...base,
      debts: [
        {
          groupId: "g1",
          groupName: "Barkada",
          groupStatus: "active",
          remaining: "210",
          interest: "0",
          obligationCount: 1,
          hasPendingClaim: false,
        },
      ],
    });
    expect(items).toEqual([
      expect.objectContaining({
        kind: "you_owe",
        title: "You owe ₱210 in Barkada",
        link: "/groups/g1?tab=issues",
        priority: "high",
      }),
    ]);
  });

  it("queues settlement claims and disputes for organizers ahead of normal items", () => {
    const items = buildAttentionItems({
      ...base,
      totalOwed: "2576",
      queue: {
        claims: [{ groupId: "g1", groupName: "Barkada", count: 2 }],
        disputes: [{ groupId: "g1", groupName: "Barkada", count: 1 }],
      },
    });
    expect(items.map((i) => i.kind)).toEqual(["claims_to_review", "disputes_open", "owed_outstanding"]);
    expect(items[0].title).toBe("Review 2 debt payments in Barkada");
    expect(items[2].link).toBe("/money");
  });
});
