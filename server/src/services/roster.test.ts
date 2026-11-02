import { beforeEach, describe, expect, it, vi } from "vitest";
import { STANDARD_TERMS, TERMS_NOT_ACCEPTED } from "../domain/terms.js";

// A stand-in for Prisma with just what the link flows read; writes are spies that must stay unused.
const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    group: { findUniqueOrThrow: vi.fn() },
    slot: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
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
vi.mock("../lib/audit.js", () => ({ audit: vi.fn() }));
vi.mock("./notifications.js", () => ({ notifyUsers: vi.fn() }));

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
  db.tx.slot.findMany.mockResolvedValue([]);
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

// A slot this user holds elsewhere that still owes: ₱1,000 principal and ₱12.50 interest.
const owingSlot = { groupId: "g9", debtPrincipal: 100_000n, debtInterest: 1_250n, group: { name: "Office" } };
const inDebt = {
  status: 409,
  code: "IN_DEBT",
  message: "You still owe ₱1,012.50 in Office. Settle it before you join another paluwagan.",
};

describe("R-DEC-39: no joining while in debt", () => {
  it("looks only at the user's own slots that still owe", async () => {
    await getInvite("t", "u1");
    expect(db.tx.slot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "u1", OR: [{ debtPrincipal: { gt: 0 } }, { debtInterest: { gt: 0 } }] },
      }),
    );
  });

  it("shows the invite as blocked, with what's owed where", async () => {
    db.tx.slot.findMany.mockResolvedValue([owingSlot]);
    expect(await getInvite("t", "u1")).toMatchObject({
      status: "IN_DEBT",
      debts: [{ groupId: "g9", groupName: "Office", owed: 101_250 }],
    });
  });

  it("keeps the invite open for a user who owes nothing", async () => {
    expect(await getInvite("t", "u1")).toMatchObject({ status: "OPEN", debts: [] });
  });

  it("doesn't look up debts for guests", async () => {
    expect(await getInvite("t", undefined)).toMatchObject({ status: "OPEN", debts: [] });
    expect(db.tx.slot.findMany).not.toHaveBeenCalled();
  });

  it("refuses to join, even with the terms agreed, and takes no slot", async () => {
    db.tx.slot.findMany.mockResolvedValue([owingSlot]);
    await expect(joinViaInvite("t", "u1", true)).rejects.toMatchObject(inDebt);
    expect(db.tx.slot.create).not.toHaveBeenCalled();
  });

  it("lets a user who owes nothing join", async () => {
    db.tx.slot.create.mockResolvedValue({ id: "s2", user: { displayName: "Ben" } });
    db.tx.slot.findMany.mockResolvedValue([]);
    await expect(joinViaInvite("t", "u1", true)).resolves.toEqual({ groupId: "g1", alreadyMember: false });
  });

  it("still lets an existing member through", async () => {
    db.tx.slot.findMany.mockResolvedValue([owingSlot]);
    db.tx.slot.findFirst.mockResolvedValue({ id: "s1" });
    await expect(joinViaInvite("t", "u1", true)).resolves.toEqual({ groupId: "g1", alreadyMember: true });
  });

  it("shows the claim as blocked and refuses to claim", async () => {
    db.tx.slot.findMany.mockResolvedValue([owingSlot]);
    db.tx.slot.count.mockResolvedValue(0);
    expect(await getClaim("t", "u1")).toMatchObject({ status: "IN_DEBT", debts: [{ groupName: "Office" }] });
    await expect(claimPlaceholder("t", "u1", true)).rejects.toMatchObject(inDebt);
    expect(db.tx.slot.update).not.toHaveBeenCalled();
  });
});
