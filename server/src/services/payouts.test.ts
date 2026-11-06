import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for Prisma with just what a handover reads and writes.
const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    group: { findUniqueOrThrow: vi.fn(), update: vi.fn() },
    round: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), count: vi.fn() },
    payout: { update: vi.fn(), create: vi.fn(), count: vi.fn(), findMany: vi.fn(), findUniqueOrThrow: vi.fn() },
    slot: { findMany: vi.fn() },
    roundSlotResult: { create: vi.fn() },
    reminderSent: { findFirst: vi.fn(), create: vi.fn() },
  };
  return { tx, prisma: { ...tx, $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
const audit = vi.hoisted(() => vi.fn());
const proofExists = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma.js", () => ({ prisma: db.prisma, prismaTransactionOptions: {} }));
vi.mock("../lib/audit.js", () => ({ audit }));
const notifyUsers = vi.hoisted(() => vi.fn());
const groupHasDebt = vi.hoisted(() => vi.fn());
vi.mock("./notifications.js", () => ({ notifyUsers }));
vi.mock("./debts.js", () => ({ debtOf: () => ({ principal: 0, interest: 0 }), groupHasDebt, recordDebtChange: vi.fn() }));
vi.mock("./disputes.js", () => ({ expireDisputes: vi.fn() }));
vi.mock("./swaps.js", () => ({ expireSwapsFor: vi.fn() }));
vi.mock("./withdrawals.js", () => ({ expireWithdrawalsFor: vi.fn(), resetStaleAcceptances: vi.fn() }));
vi.mock("./submissions.js", () => ({ periodTotals: vi.fn(async () => ({ approved: 500_000 })) }));
vi.mock("./common.js", async (actual) => ({
  ...(await actual<typeof import("./common.js")>()),
  memberUserIds: vi.fn(async () => ["org", "bea"]),
}));
vi.mock("../lib/storage.js", async (actual) => ({
  ...(await actual<typeof import("../lib/storage.js")>()),
  proofExists,
}));

const { closeOpenRound, confirmReceipt, markHandedOver, nudgeHandovers, nudgeUnconfirmedPayouts, reportNotReceived } =
  await import("./payouts.js");

const PROOF = "g1/123e4567-e89b-12d3-a456-426614174000.jpg";

function roundFor(recipient: { userId: string | null; placeholderName?: string }) {
  return {
    number: 2,
    recipientSlotId: "s2",
    recipient: { id: "s2", placeholderName: null, user: recipient.userId ? { displayName: "Bea" } : null, ...recipient },
    payout: { id: "p2", status: "AWAITING_HANDOVER", net: 1_000_000n },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.tx.group.findUniqueOrThrow.mockResolvedValue({ id: "g1", name: "Barkada", organizerId: "org", state: "ACTIVE" });
  db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: "bea" }));
  db.tx.round.count.mockResolvedValue(0);
  db.tx.payout.count.mockResolvedValue(0);
  groupHasDebt.mockResolvedValue(false);
  proofExists.mockResolvedValue(true);
});

describe("markHandedOver (R-PAY-05, R-DEC-37)", () => {
  it("records the handover with its proof on the payout, for the recipient to confirm", async () => {
    await markHandedOver("g1", "org", 2, PROOF);
    expect(db.tx.payout.update).toHaveBeenCalledWith({
      where: { id: "p2" },
      data: expect.objectContaining({ status: "HANDED_OVER", handedOverById: "org", proofPath: PROOF }),
    });
    expect(audit).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({ action: "payout.handed_over", targetSlotId: "s2", proofAttached: true }),
    );
  });

  it("refuses a handover to a member without a proof photo", async () => {
    await expect(markHandedOver("g1", "org", 2)).rejects.toThrow("Attach a photo of the payment as proof.");
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });

  it("refuses a handover to a placeholder without a proof photo", async () => {
    db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: null, placeholderName: "Tita Lorna" }));
    await expect(markHandedOver("g1", "org", 2)).rejects.toThrow("Attach a photo of the payment as proof.");
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });

  it("records a placeholder's handover with proof as received", async () => {
    db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: null, placeholderName: "Tita Lorna" }));
    await markHandedOver("g1", "org", 2, PROOF);
    expect(db.tx.payout.update).toHaveBeenCalledWith({
      where: { id: "p2" },
      data: expect.objectContaining({ status: "CONFIRMED", proofPath: PROOF, confirmedById: "org" }),
    });
  });

  it("R-DEC-44: refuses the organizer's own payout without a proof photo", async () => {
    db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: "org" }));
    await expect(markHandedOver("g1", "org", 2)).rejects.toThrow("Attach a photo of the payment as proof.");
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });

  it("R-DEC-44: records the organizer's own payout with its proof as received, in one step", async () => {
    db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: "org" }));
    await markHandedOver("g1", "org", 2, PROOF);
    expect(db.tx.payout.update).toHaveBeenCalledWith({
      where: { id: "p2" },
      data: expect.objectContaining({ status: "CONFIRMED", proofPath: PROOF, confirmedById: "org" }),
    });
    expect(audit).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({ action: "payout.handed_over", proofAttached: true }),
    );
  });

  it.each([
    ["from another paluwagan", "g9/123e4567-e89b-12d3-a456-426614174000.jpg"],
    ["that isn't an image", "g1/123e4567-e89b-12d3-a456-426614174000.pdf"],
    ["outside the upload naming", "g1/../g9/receipt.jpg"],
  ])("refuses a proof %s", async (_, path) => {
    await expect(markHandedOver("g1", "org", 2, path)).rejects.toThrow("That proof doesn't belong to this paluwagan.");
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });

  it("refuses a proof that didn't finish uploading", async () => {
    proofExists.mockResolvedValue(false);
    await expect(markHandedOver("g1", "org", 2, PROOF)).rejects.toThrow("The proof didn't finish uploading.");
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });

  it("refuses a second handover", async () => {
    db.tx.round.findUnique.mockResolvedValue({ ...roundFor({ userId: "bea" }), payout: { id: "p2", status: "HANDED_OVER" } });
    await expect(markHandedOver("g1", "org", 2, PROOF)).rejects.toThrow("This payout was already handed over.");
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });
});

/** A payout the organizer has marked handed over, waiting for the recipient. */
function handedOverRound() {
  const base = roundFor({ userId: "bea" });
  const handedOverAt = new Date("2026-11-01T00:00:00Z");
  return { ...base, payout: { ...base.payout, status: "HANDED_OVER", handedOverAt, proofPath: PROOF } };
}

const completions = () => audit.mock.calls.filter(([, entry]) => entry.action === "group.completed");

describe("completion waits for every payout (R-DEC-45)", () => {
  describe("closing the last round", () => {
    // The last round of a two-slot paluwagan: everyone paid, Bea's the recipient.
    const lastRound = { id: "r2", number: 2, recipientSlotId: "s2" };
    beforeEach(() => {
      db.tx.group.findUniqueOrThrow.mockResolvedValue({
        id: "g1",
        name: "Barkada",
        organizerId: "org",
        state: "ACTIVE",
        contribution: 500_000n,
        pot: 1_000_000n,
        interestRate: 0,
      });
      db.tx.round.findFirst.mockResolvedValue(lastRound);
      db.tx.round.findUnique.mockResolvedValue(null); // no next round
      db.tx.slot.findMany.mockResolvedValue([
        { id: "s1", isOrganizer: true, userId: "org", user: { displayName: "Ana" }, placeholderName: null },
        { id: "s2", isOrganizer: false, userId: "bea", user: { displayName: "Bea" }, placeholderName: null },
      ]);
    });

    it("stays running while the payout is still to hand over", async () => {
      db.tx.payout.count.mockResolvedValue(1);
      await expect(closeOpenRound("g1", null)).resolves.toEqual({ closed: 2, completed: false });
      expect(db.tx.group.update).not.toHaveBeenCalled();
      expect(completions()).toHaveLength(0);
      expect(notifyUsers).not.toHaveBeenCalledWith(db.tx, expect.anything(), expect.objectContaining({ kind: "group.completed" }));
    });

    it("R-DEC-47: asks members to rate the organizer, but not yet the organizer to rate members", async () => {
      db.tx.payout.count.mockResolvedValue(1);
      await closeOpenRound("g1", null);
      expect(notifyUsers).toHaveBeenCalledWith(
        db.tx,
        ["bea"],
        expect.objectContaining({ kind: "rating.due", title: "Rate the organizer of Barkada" }),
      );
      expect(notifyUsers).not.toHaveBeenCalledWith(db.tx, ["org"], expect.objectContaining({ kind: "rating.due" }));
    });

    it("completes at once when nothing is left to confirm (R-DEC-20)", async () => {
      await expect(closeOpenRound("g1", null)).resolves.toEqual({ closed: 2, completed: true });
      expect(db.tx.group.update).toHaveBeenCalledWith({
        where: { id: "g1" },
        data: expect.objectContaining({ state: "COMPLETED", completedAt: expect.any(Date) }),
      });
    });
  });

  it("completes when the recipient confirms the last unconfirmed payout", async () => {
    db.tx.round.findUnique.mockResolvedValue(handedOverRound());
    await confirmReceipt("g1", "bea", 2);
    expect(db.tx.group.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ state: "COMPLETED" }),
    });
    expect(completions()).toHaveLength(1);
    expect(notifyUsers).toHaveBeenCalledWith(db.tx, ["org"], expect.objectContaining({ kind: "rating.due" }));
  });

  it("completes with outstanding debt when someone still owes (R-CMP-01)", async () => {
    groupHasDebt.mockResolvedValue(true);
    db.tx.round.findUnique.mockResolvedValue(handedOverRound());
    await confirmReceipt("g1", "bea", 2);
    expect(db.tx.group.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ state: "COMPLETED_WITH_OUTSTANDING_DEBT" }),
    });
  });

  it("doesn't complete while an earlier round's payout is unconfirmed", async () => {
    db.tx.round.findUnique.mockResolvedValue(handedOverRound());
    db.tx.payout.count.mockResolvedValue(1);
    await confirmReceipt("g1", "bea", 2);
    expect(db.tx.group.update).not.toHaveBeenCalled();
  });

  it("doesn't complete on a confirmed payout while rounds are left", async () => {
    db.tx.round.findUnique.mockResolvedValue(handedOverRound());
    db.tx.round.count.mockResolvedValue(3);
    await confirmReceipt("g1", "bea", 2);
    expect(db.tx.group.update).not.toHaveBeenCalled();
  });

  it("leaves a paluwagan that already completed as it is", async () => {
    db.tx.group.findUniqueOrThrow.mockResolvedValue({ id: "g1", name: "Barkada", organizerId: "org", state: "COMPLETED" });
    db.tx.round.findUnique.mockResolvedValue(handedOverRound());
    await confirmReceipt("g1", "bea", 2);
    expect(db.tx.group.update).not.toHaveBeenCalled();
    expect(completions()).toHaveLength(0);
  });

  it("completes when the organizer records a placeholder's payout", async () => {
    db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: null, placeholderName: "Tita Lorna" }));
    await markHandedOver("g1", "org", 2, PROOF);
    expect(db.tx.group.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ state: "COMPLETED" }),
    });
  });

  it("completes when the organizer records their own payout (R-DEC-44)", async () => {
    db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: "org" }));
    await markHandedOver("g1", "org", 2, PROOF);
    expect(db.tx.group.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ state: "COMPLETED" }),
    });
  });

  it("doesn't complete on a handover the recipient still has to confirm", async () => {
    db.tx.payout.count.mockResolvedValue(1);
    await markHandedOver("g1", "org", 2, PROOF);
    expect(db.tx.group.update).not.toHaveBeenCalled();
  });

  it("completes when the last payout is confirmed automatically (R-DEC-07)", async () => {
    const now = new Date("2026-11-20T00:00:00Z");
    const round = { ...handedOverRound(), id: "r2", groupId: "g1", group: { id: "g1" } };
    const payout = { ...round.payout, net: 1_000_000n, round };
    db.tx.payout.findMany.mockResolvedValue([payout]);
    db.tx.payout.findUniqueOrThrow.mockResolvedValue(payout);
    await expect(nudgeUnconfirmedPayouts(now)).resolves.toMatchObject({ autoConfirmed: 1 });
    expect(db.tx.group.update).toHaveBeenCalledWith({
      where: { id: "g1" },
      data: expect.objectContaining({ state: "COMPLETED" }),
    });
  });
});

describe("nudgeHandovers (R-DEC-45)", () => {
  const now = new Date("2026-11-06T00:05:00Z");
  const waiting = (recipient: { userId: string | null; placeholderName?: string }) => {
    const base = roundFor(recipient);
    return { ...base.payout, round: { ...base, id: "r2", groupId: "g1", group: { name: "Barkada", organizerId: "org" } } };
  };

  it("only looks at running paluwagans' payouts the organizer has had for most of a day", async () => {
    db.tx.payout.findMany.mockResolvedValue([]);
    await nudgeHandovers(now);
    expect(db.tx.payout.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          status: "AWAITING_HANDOVER",
          round: { closedAt: { lt: new Date("2026-11-05T04:05:00Z") }, group: { state: "ACTIVE" } },
        },
      }),
    );
  });

  it("reminds the organizer and records it", async () => {
    db.tx.payout.findMany.mockResolvedValue([waiting({ userId: "bea" })]);
    db.tx.reminderSent.findFirst.mockResolvedValue(null);
    await expect(nudgeHandovers(now)).resolves.toEqual({ handoverReminders: 1 });
    expect(db.tx.reminderSent.create).toHaveBeenCalledWith({
      data: { roundId: "r2", slotId: "s2", kind: "HANDOVER", sentAt: now },
    });
    expect(notifyUsers).toHaveBeenCalledWith(db.tx, ["org"], expect.objectContaining({ title: "Hand ₱10,000 to Bea" }));
  });

  it("words the organizer's own payout as theirs", async () => {
    db.tx.payout.findMany.mockResolvedValue([waiting({ userId: "org" })]);
    db.tx.reminderSent.findFirst.mockResolvedValue(null);
    await nudgeHandovers(now);
    expect(notifyUsers).toHaveBeenCalledWith(db.tx, ["org"], expect.objectContaining({ title: "Take your ₱10,000 payout" }));
  });

  it("sends nothing twice in a day", async () => {
    db.tx.payout.findMany.mockResolvedValue([waiting({ userId: "bea" })]);
    db.tx.reminderSent.findFirst.mockResolvedValue({ id: "sent" });
    await expect(nudgeHandovers(now)).resolves.toEqual({ handoverReminders: 0 });
    expect(notifyUsers).not.toHaveBeenCalled();
  });
});

describe("reportNotReceived (R-DEC-46)", () => {
  beforeEach(() => db.tx.round.findUnique.mockResolvedValue(handedOverRound()));

  it("takes back the handover, which stops the auto-confirm", async () => {
    await reportNotReceived("g1", "bea", 2);
    expect(db.tx.payout.update).toHaveBeenCalledWith({
      where: { id: "p2" },
      data: { status: "AWAITING_HANDOVER", handedOverAt: null, handedOverById: null, proofPath: null },
    });
  });

  it("logs it with the earlier photo and tells the organizer", async () => {
    await reportNotReceived("g1", "bea", 2);
    expect(audit).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({
        action: "payout.not_received",
        actorUserId: "bea",
        amounts: { net: 1_000_000 },
        before: expect.objectContaining({ proofPath: PROOF }),
      }),
    );
    expect(notifyUsers).toHaveBeenCalledWith(
      db.tx,
      ["org"],
      expect.objectContaining({ kind: "payout.not_received", title: "Bea says they didn't get ₱10,000" }),
    );
  });

  it.each([["the organizer", "org"], ["another member", "cara"]])("refuses %s", async (_, userId) => {
    await expect(reportNotReceived("g1", userId, 2)).rejects.toMatchObject({ status: 403 });
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });

  it("refuses once it's confirmed, automatically or not", async () => {
    const round = handedOverRound();
    db.tx.round.findUnique.mockResolvedValue({ ...round, payout: { ...round.payout, status: "CONFIRMED" } });
    await expect(reportNotReceived("g1", "bea", 2)).rejects.toMatchObject({ status: 409, code: "ALREADY_DONE" });
    expect(db.tx.payout.update).not.toHaveBeenCalled();
  });

  it("refuses before it's handed over", async () => {
    db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: "bea" }));
    await expect(reportNotReceived("g1", "bea", 2)).rejects.toMatchObject({ status: 409, code: "NOT_HANDED_OVER" });
  });
});
