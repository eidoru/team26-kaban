import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for Prisma with just what a handover reads and writes.
const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    group: { findUniqueOrThrow: vi.fn() },
    round: { findUnique: vi.fn() },
    payout: { update: vi.fn() },
  };
  return { tx, prisma: { ...tx, $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
const audit = vi.hoisted(() => vi.fn());
const proofExists = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma.js", () => ({ prisma: db.prisma, prismaTransactionOptions: {} }));
vi.mock("../lib/audit.js", () => ({ audit }));
vi.mock("./notifications.js", () => ({ notifyUsers: vi.fn() }));
vi.mock("../lib/storage.js", async (actual) => ({
  ...(await actual<typeof import("../lib/storage.js")>()),
  proofExists,
}));

const { markHandedOver } = await import("./payouts.js");

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
  db.tx.group.findUniqueOrThrow.mockResolvedValue({ id: "g1", name: "Barkada", organizerId: "org" });
  db.tx.round.findUnique.mockResolvedValue(roundFor({ userId: "bea" }));
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
