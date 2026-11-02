import { beforeEach, describe, expect, it, vi } from "vitest";
import { pesos } from "../domain/money.js";
import type { SetupInput } from "../domain/setup.js";

// A stand-in for Prisma with just what creating a group reads and writes.
const db = vi.hoisted(() => {
  const tx = {
    slot: { findMany: vi.fn() },
    group: { findFirst: vi.fn(), create: vi.fn() },
  };
  return { tx, prisma: { ...tx, $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
vi.mock("../lib/prisma.js", () => ({ prisma: db.prisma, prismaTransactionOptions: {} }));
vi.mock("../lib/audit.js", () => ({ audit: vi.fn() }));
vi.mock("../lib/today.js", async (actual) => ({
  ...(await actual<typeof import("../lib/today.js")>()),
  todayInManila: () => "2026-11-02",
}));

const { createGroup } = await import("./groups.js");

const input: SetupInput = {
  name: "Barkada",
  slotCount: 5,
  amountMode: "CONTRIBUTION",
  amount: pesos(2_000),
  frequency: "MONTHLY",
  startDate: "2026-12-01",
  interestPercent: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.tx.slot.findMany.mockResolvedValue([]);
  db.tx.group.findFirst.mockResolvedValue(null);
  db.tx.group.create.mockResolvedValue({ id: "g1" });
});

describe("R-DEC-39: no new paluwagan while in debt", () => {
  it("refuses while the user owes in two paluwagans, and creates nothing", async () => {
    db.tx.slot.findMany.mockResolvedValue([
      { groupId: "g8", debtPrincipal: 50_000n, debtInterest: 0n, group: { name: "Office" } },
      { groupId: "g9", debtPrincipal: 0n, debtInterest: 625n, group: { name: "Family" } },
    ]);
    await expect(createGroup("u1", input)).rejects.toMatchObject({
      status: 409,
      code: "IN_DEBT",
      message: "You still owe ₱506.25 across 2 paluwagans. Settle them before you start a new paluwagan.",
    });
    expect(db.tx.group.create).not.toHaveBeenCalled();
  });

  it("creates the paluwagan once nothing is owed", async () => {
    await expect(createGroup("u1", input)).resolves.toEqual({ id: "g1" });
    expect(db.tx.group.create).toHaveBeenCalledOnce();
  });
});
