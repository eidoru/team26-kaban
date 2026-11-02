import { beforeEach, describe, expect, it, vi } from "vitest";
import { STANDARD_TERMS } from "../domain/terms.js";

// A stand-in for Prisma with just what the replacement link's landing page reads.
const db = vi.hoisted(() => ({
  prisma: {
    withdrawal: { findUnique: vi.fn(), count: vi.fn() },
    group: { findUniqueOrThrow: vi.fn() },
    slot: { findUniqueOrThrow: vi.fn(), count: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("../lib/prisma.js", () => ({ prisma: db.prisma, prismaTransactionOptions: {} }));
vi.mock("../lib/audit.js", () => ({ audit: vi.fn() }));
vi.mock("./notifications.js", () => ({ notifyUsers: vi.fn() }));

const { getReplacement } = await import("./withdrawals.js");

const group = {
  id: "g1",
  name: "Barkada",
  organizerId: "org",
  state: "ACTIVE",
  slotCount: 5,
  amountMode: "CONTRIBUTION",
  contribution: 200_000n,
  pot: 1_000_000n,
  enteredPot: null,
  frequency: "MONTHLY",
  intervalDays: null,
  startDate: new Date("2026-11-15"),
  interestRate: 0,
  terms: STANDARD_TERMS,
  launchedAt: null,
  activatedAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  organizer: { displayName: "Org" },
  slots: [{ id: "s1" }],
};

const approved = {
  id: "w1",
  groupId: "g1",
  slotId: "s1",
  token: "t1",
  status: "APPROVED",
  leaverUserId: "leaver",
  replacementUserId: "new",
  expiresAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.withdrawal.findUnique.mockResolvedValue(approved);
  db.prisma.withdrawal.count.mockResolvedValue(0);
  db.prisma.group.findUniqueOrThrow.mockResolvedValue(group);
  // After approval the slot is the replacement's (R-WDR-09).
  db.prisma.slot.findUniqueOrThrow.mockResolvedValue({ id: "s1", userId: "new", user: { displayName: "Nina" } });
  db.prisma.slot.count.mockResolvedValue(1);
  db.prisma.slot.findMany.mockResolvedValue([]);
});

describe("getReplacement after approval (R-WDR-09)", () => {
  it("tells the replacement the slot is theirs, so the link leads into the group", async () => {
    const landing = await getReplacement("t1", "new");
    expect(landing.status).toBe("APPROVED");
    expect(landing.record).toBeNull();
  });

  it("shows a guest a closed request", async () => {
    expect((await getReplacement("t1", undefined)).status).toBe("CLOSED");
  });
});
