import { beforeEach, describe, expect, it, vi } from "vitest";
import { STANDARD_TERMS, TERMS_NOT_ACCEPTED } from "../domain/terms.js";

// A stand-in for Prisma with just what the link flows read; writes are spies that must stay unused.
const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    group: { findUniqueOrThrow: vi.fn() },
    slot: { findFirst: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
    claimLink: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    prisma: {
      ...tx,
      inviteLink: { findUnique: vi.fn() },
      claimLink: { findUnique: vi.fn() },
      $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
    },
  };
});
vi.mock("../lib/prisma.js", () => ({ prisma: db.prisma, prismaTransactionOptions: {} }));

const { claimPlaceholder, getClaim, getInvite, joinViaInvite } = await import("./roster.js");

const group = {
  id: "g1",
  name: "Barkada",
  organizerId: "org",
  state: "LOBBY",
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
};

beforeEach(() => {
  vi.clearAllMocks();
  db.prisma.inviteLink.findUnique.mockResolvedValue({
    id: "l1",
    groupId: "g1",
    revokedAt: null,
    group: { ...group, slots: [{ userId: "org" }] },
  });
  db.tx.group.findUniqueOrThrow.mockResolvedValue(group);
  db.tx.slot.findFirst.mockResolvedValue(null);
  db.tx.slot.count.mockResolvedValue(1);
  db.prisma.claimLink.findUnique.mockResolvedValue({
    id: "c1",
    revokedAt: null,
    claimedAt: null,
    slot: {
      id: "s2",
      placeholderName: "Ana",
      position: null,
      groupId: "g1",
      group: { ...group, slots: [{ id: "s1" }] },
    },
  });
  db.tx.claimLink.findUniqueOrThrow.mockResolvedValue({
    id: "c1",
    slotId: "s2",
    revokedAt: null,
    claimedAt: null,
    slot: { userId: null, placeholderName: "Ana" },
  });
});

describe("R-INV-08: invite terms", () => {
  it("hides the terms from guests", async () => {
    expect((await getInvite("t", undefined)).terms).toBeNull();
  });

  it("shows the terms to a signed-in visitor", async () => {
    expect((await getInvite("t", "u1")).terms).toBe(STANDARD_TERMS);
  });

  it("refuses to join without agreeing, and takes no slot", async () => {
    await expect(joinViaInvite("t", "u1", false)).rejects.toMatchObject({
      status: 400,
      message: TERMS_NOT_ACCEPTED,
    });
    expect(db.tx.slot.create).not.toHaveBeenCalled();
  });

  it("lets an existing member through without agreeing again", async () => {
    db.tx.slot.findFirst.mockResolvedValue({ id: "s1" });
    await expect(joinViaInvite("t", "u1", false)).resolves.toEqual({ groupId: "g1", alreadyMember: true });
  });
});

describe("R-CLM-07: claim terms", () => {
  it("hides the terms from guests", async () => {
    expect((await getClaim("t", undefined)).terms).toBeNull();
  });

  it("refuses to claim without agreeing, and leaves the placeholder", async () => {
    await expect(claimPlaceholder("t", "u1", false)).rejects.toMatchObject({
      status: 400,
      message: TERMS_NOT_ACCEPTED,
    });
    expect(db.tx.slot.update).not.toHaveBeenCalled();
  });
});
