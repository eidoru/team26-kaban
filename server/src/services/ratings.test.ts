import { beforeEach, describe, expect, it, vi } from "vitest";

// A stand-in for Prisma with just what the rating flows read and write.
const db = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    group: { findUniqueOrThrow: vi.fn() },
    slot: { findMany: vi.fn(), findFirst: vi.fn(), findFirstOrThrow: vi.fn() },
    withdrawal: { findMany: vi.fn() },
    rating: { findUnique: vi.fn(), upsert: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() },
    user: { findUnique: vi.fn() },
  };
  return { tx, prisma: { ...tx, $transaction: vi.fn((fn: (t: typeof tx) => unknown) => fn(tx)) } };
});
const audit = vi.hoisted(() => vi.fn());
vi.mock("../lib/prisma.js", () => ({ prisma: db.prisma, prismaTransactionOptions: {} }));
vi.mock("../lib/audit.js", () => ({ audit }));

const { rateLeaver, rateMembers, rateOrganizer, ratingsView, userProfile } = await import("./ratings.js");

const group = (state = "COMPLETED") => ({ id: "g1", organizerId: "org", state });
const slot = (id: string, userId: string | null, name: string, isOrganizer = false) => ({
  id,
  userId,
  isOrganizer,
  placeholderName: userId ? null : name,
  user: userId ? { displayName: name } : null,
});
// Placeholders have no user, so the "userId not null" query never returns them.
const holders = [slot("s1", "org", "Olive", true), slot("s2", "ana", "Ana"), slot("s3", "ben", "Ben")];

beforeEach(() => {
  vi.clearAllMocks();
  db.tx.group.findUniqueOrThrow.mockResolvedValue(group());
  db.tx.slot.findMany.mockResolvedValue(holders);
  db.tx.withdrawal.findMany.mockResolvedValue([]);
  db.tx.rating.findUnique.mockResolvedValue(null);
  db.tx.rating.findMany.mockResolvedValue([]);
});

describe("rateMembers (R-DEC-43)", () => {
  const all = [
    { userId: "ana", stars: 5 },
    { userId: "ben", stars: 3 },
  ];

  it("saves one MEMBER rating per member, tied to the paluwagan, and logs each", async () => {
    await rateMembers("g1", "org", all);
    expect(db.tx.slot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { groupId: "g1", userId: { not: null } } }));
    expect(db.tx.rating.upsert).toHaveBeenCalledTimes(2);
    expect(db.tx.rating.upsert).toHaveBeenCalledWith({
      where: { groupId_reviewerId_recipientId_role: { groupId: "g1", reviewerId: "org", recipientId: "ana", role: "MEMBER" } },
      create: { groupId: "g1", reviewerId: "org", recipientId: "ana", role: "MEMBER", stars: 5 },
      update: { stars: 5 },
    });
    expect(audit).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({ action: "rating.given", targetSlotId: "s2", targetName: "Ana", after: { stars: 5, role: "MEMBER" } }),
    );
  });

  it("refuses before the paluwagan is completed", async () => {
    db.tx.group.findUniqueOrThrow.mockResolvedValue(group("ACTIVE"));
    await expect(rateMembers("g1", "org", all)).rejects.toMatchObject({ status: 409, code: "WRONG_STATE" });
    expect(db.tx.rating.upsert).not.toHaveBeenCalled();
  });

  it("refuses until every member has a rating, saving none", async () => {
    await expect(rateMembers("g1", "org", [all[0]])).rejects.toMatchObject({
      status: 400,
      message: "Rate every member first: 1 still to rate.",
    });
    expect(db.tx.rating.upsert).not.toHaveBeenCalled();
  });

  it("refuses rating yourself, strangers and the same member twice", async () => {
    await expect(rateMembers("g1", "org", [...all, { userId: "org", stars: 5 }])).rejects.toMatchObject({ message: "You can't rate yourself." });
    await expect(rateMembers("g1", "org", [...all, { userId: "zed", stars: 5 }])).rejects.toMatchObject({
      message: "You can only rate members of this paluwagan.",
    });
    await expect(rateMembers("g1", "org", [...all, { userId: "ana", stars: 1 }])).rejects.toMatchObject({ message: "Rate each member once." });
    expect(db.tx.rating.upsert).not.toHaveBeenCalled();
  });

  it("changes an earlier rating in place, logging before and after; an unchanged one isn't logged", async () => {
    db.tx.rating.findUnique.mockImplementation(({ where }) =>
      where.groupId_reviewerId_recipientId_role.recipientId === "ana" ? { stars: 4 } : { stars: 3 },
    );
    await rateMembers("g1", "org", all);
    expect(db.tx.rating.upsert).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledTimes(1);
    expect(audit).toHaveBeenCalledWith(
      db.tx,
      expect.objectContaining({ action: "rating.changed", targetName: "Ana", before: { stars: 4 }, after: { stars: 5, role: "MEMBER" } }),
    );
  });

  it("may include members who left by hand-over, but doesn't require them", async () => {
    db.tx.withdrawal.findMany.mockResolvedValue([{ leaverUserId: "lea", slotId: "s3", leaver: { displayName: "Lea" } }]);
    await rateMembers("g1", "org", all);
    await rateMembers("g1", "org", [...all, { userId: "lea", stars: 2 }]);
    expect(audit).toHaveBeenLastCalledWith(db.tx, expect.objectContaining({ targetSlotId: "s3", targetName: "Lea" }));
  });
});

describe("rateOrganizer (R-DEC-43)", () => {
  beforeEach(() => {
    db.tx.slot.findFirst.mockResolvedValue(slot("s2", "ana", "Ana"));
    db.tx.slot.findFirstOrThrow.mockResolvedValue(holders[0]);
  });

  it("saves the member's ORGANIZER rating of the organizer", async () => {
    await rateOrganizer("g1", "ana", 4);
    expect(db.tx.rating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { groupId: "g1", reviewerId: "ana", recipientId: "org", role: "ORGANIZER", stars: 4 } }),
    );
    expect(audit).toHaveBeenCalledWith(db.tx, expect.objectContaining({ action: "rating.given", targetName: "Olive" }));
  });

  it("refuses stars outside 1 to 5 before touching anything", async () => {
    await expect(rateOrganizer("g1", "ana", 6)).rejects.toMatchObject({ status: 400, message: "Pick 1 to 5 stars." });
    await expect(rateOrganizer("g1", "ana", 2.5)).rejects.toMatchObject({ status: 400 });
    expect(db.tx.$queryRaw).not.toHaveBeenCalled();
  });

  it("refuses the organizer rating themselves, and anyone before completion", async () => {
    db.tx.slot.findFirst.mockResolvedValue(holders[0]);
    await expect(rateOrganizer("g1", "org", 5)).rejects.toMatchObject({ status: 403 });
    db.tx.group.findUniqueOrThrow.mockResolvedValue(group("COMPLETED_WITH_OUTSTANDING_DEBT"));
    db.tx.slot.findFirst.mockResolvedValue(slot("s2", "ana", "Ana"));
    await expect(rateOrganizer("g1", "ana", 5)).resolves.toBeUndefined();
    db.tx.group.findUniqueOrThrow.mockResolvedValue(group("ACTIVE"));
    await expect(rateOrganizer("g1", "ana", 5)).rejects.toMatchObject({ status: 409 });
  });

  it("refuses someone with no slot in the paluwagan", async () => {
    db.tx.slot.findFirst.mockResolvedValue(null);
    await expect(rateOrganizer("g1", "zed", 5)).rejects.toMatchObject({ status: 404 });
  });
});

describe("rateLeaver (R-DEC-43, R-WDR-09)", () => {
  it("rates the member handing their slot over, by name, before completion", async () => {
    await rateLeaver(db.tx as never, group("ACTIVE") as never, slot("s2", "ana", "Ana") as never, 2);
    expect(db.tx.rating.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: { groupId: "g1", reviewerId: "org", recipientId: "ana", role: "MEMBER", stars: 2 } }),
    );
    expect(audit).toHaveBeenCalledWith(db.tx, expect.objectContaining({ targetName: "Ana" }));
  });

  it("never rates a placeholder", async () => {
    await expect(rateLeaver(db.tx as never, group("ACTIVE") as never, slot("s4", null, "Lola") as never, 3)).rejects.toMatchObject({
      status: 400,
    });
  });
});

describe("ratingsView (R-DEC-43)", () => {
  it("is null before completion", async () => {
    expect(await ratingsView(db.tx as never, group("ACTIVE") as never, holders[0] as never)).toBeNull();
  });

  it("lists the organizer's members by name, then those who left, and says when every member is rated", async () => {
    db.tx.withdrawal.findMany.mockResolvedValue([{ leaverUserId: "lea", slotId: "s3", leaver: { displayName: "Lea" } }]);
    db.tx.rating.findMany.mockResolvedValue([{ recipientId: "ben", role: "MEMBER", stars: 4 }]);
    const view = await ratingsView(db.tx as never, group() as never, holders[0] as never);
    expect(view).toEqual({
      kind: "members",
      members: [
        { userId: "ana", name: "Ana", left: false, stars: null },
        { userId: "ben", name: "Ben", left: false, stars: 4 },
        { userId: "lea", name: "Lea", left: true, stars: null },
      ],
      done: false,
    });
    db.tx.rating.findMany.mockResolvedValue([
      { recipientId: "ana", role: "MEMBER", stars: 5 },
      { recipientId: "ben", role: "MEMBER", stars: 4 },
    ]);
    expect(await ratingsView(db.tx as never, group() as never, holders[0] as never)).toMatchObject({ done: true });
  });

  it("gives a member their rating of the organizer, if any", async () => {
    expect(await ratingsView(db.tx as never, group() as never, holders[1] as never)).toEqual({ kind: "organizer", stars: null });
    db.tx.rating.findMany.mockResolvedValue([{ recipientId: "org", role: "ORGANIZER", stars: 3 }]);
    expect(await ratingsView(db.tx as never, group() as never, holders[1] as never)).toEqual({ kind: "organizer", stars: 3 });
  });
});

describe("userProfile (R-DEC-43)", () => {
  beforeEach(() => {
    db.tx.user.findUnique.mockResolvedValue({ id: "ana", displayName: "Ana", createdAt: new Date("2026-10-20T00:00:00Z") });
  });

  it("shows a new user as not yet rated in both roles, not zero stars", async () => {
    db.tx.rating.groupBy.mockResolvedValue([]);
    expect(await userProfile("ana")).toEqual({
      id: "ana",
      displayName: "Ana",
      memberSince: "2026-10-20T00:00:00.000Z",
      memberRating: { average: null, count: 0 },
      organizerRating: { average: null, count: 0 },
    });
  });

  it("averages each role on its own, from received ratings only", async () => {
    db.tx.rating.groupBy.mockResolvedValue([
      { role: "MEMBER", _sum: { stars: 4700 }, _count: { _all: 1000 } },
      { role: "ORGANIZER", _sum: { stars: 7 }, _count: { _all: 2 } },
    ]);
    const profile = await userProfile("ana");
    expect(db.tx.rating.groupBy).toHaveBeenCalledWith(expect.objectContaining({ by: ["role"], where: { recipientId: "ana" } }));
    expect(profile.memberRating).toEqual({ average: 4.7, count: 1000 });
    expect(profile.organizerRating).toEqual({ average: 3.5, count: 2 });
  });

  it("shows nothing private: no email, contact or money", async () => {
    db.tx.rating.groupBy.mockResolvedValue([]);
    expect(db.tx.user.findUnique).not.toHaveBeenCalled();
    const profile = await userProfile("ana");
    expect(db.tx.user.findUnique).toHaveBeenCalledWith({ where: { id: "ana" }, select: { id: true, displayName: true, createdAt: true } });
    expect(Object.keys(profile).sort()).toEqual(["displayName", "id", "memberRating", "memberSince", "organizerRating"]);
  });

  it("is a 404 for an unknown user", async () => {
    db.tx.user.findUnique.mockResolvedValue(null);
    await expect(userProfile("nobody")).rejects.toMatchObject({ status: 404 });
  });
});
