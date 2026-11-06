import type { Group, Slot } from "@prisma/client";
import { can } from "../domain/lifecycle.js";
import { memberRatingsError, ratingAverage, starsError, type MemberRating, type RatingRole } from "../domain/ratings.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { slotName, withGroupLock, type Db } from "./common.js";

const NOT_YET = "Ratings open once every payout is done.";
const ORGANIZER_NOT_YET = "You can rate the organizer once the last round closes.";

/**
 * R-DEC-47: members can rate the organizer from when the last round closes, without waiting for
 * completion, or an organizer who never pays out could never be rated.
 */
async function canRateOrganizer(db: Db, group: Group) {
  if (can.rate(group.state)) return true;
  if (group.state !== "ACTIVE") return false;
  return (await db.round.count({ where: { groupId: group.id, status: { not: "CLOSED" } } })) === 0;
}

/** Throws the 400 for stars outside 1 to 5 (R-DEC-43). */
export function assertStars(stars: number) {
  const error = starsError(stars);
  if (error) throw badRequest(error, "INVALID_RATING");
}

/**
 * Save one rating, replacing the reviewer's earlier one for the same person, role and paluwagan
 * (R-DEC-43: ratings can be changed any time). Only a new or changed value is audited.
 */
async function saveRating(
  db: Db,
  rating: {
    groupId: string;
    reviewerId: string;
    recipientId: string;
    role: RatingRole;
    stars: number;
    targetSlotId: string;
    targetName: string;
  },
) {
  const { groupId, reviewerId, recipientId, role, stars } = rating;
  const key = { groupId_reviewerId_recipientId_role: { groupId, reviewerId, recipientId, role } };
  const existing = await db.rating.findUnique({ where: key });
  if (existing?.stars === stars) return;
  await db.rating.upsert({ where: key, create: { groupId, reviewerId, recipientId, role, stars }, update: { stars } });
  await audit(db, {
    groupId,
    actorUserId: reviewerId,
    action: existing ? "rating.changed" : "rating.given",
    targetSlotId: rating.targetSlotId,
    targetName: rating.targetName,
    before: existing ? { stars: existing.stars } : undefined,
    after: { stars, role },
  });
}

/**
 * Members who left by hand-over (R-WDR-09) and don't hold a slot now, one row each, with the slot
 * they left.
 */
async function leaversOf(db: Db, groupId: string, holders: Set<string>) {
  const rows = await db.withdrawal.findMany({
    where: { groupId, status: "APPROVED" },
    include: { leaver: { select: { displayName: true } } },
    orderBy: { reviewedAt: "asc" },
  });
  const leavers = new Map<string, { userId: string; name: string; slotId: string }>();
  for (const w of rows) {
    if (holders.has(w.leaverUserId)) continue;
    leavers.set(w.leaverUserId, { userId: w.leaverUserId, name: w.leaver.displayName, slotId: w.slotId });
  }
  return [...leavers.values()];
}

/** Who the organizer rates: the registered members holding a slot (never placeholders or themselves), and the leavers. */
async function rateableMembers(db: Db, group: Group) {
  const slots = await db.slot.findMany({ where: { groupId: group.id, userId: { not: null } }, include: { user: true } });
  const members = slots
    .filter((s) => !s.isOrganizer)
    .map((s) => ({ userId: s.userId!, name: slotName(s), slotId: s.id }));
  const leavers = await leaversOf(db, group.id, new Set(slots.map((s) => s.userId!)));
  return { members, leavers };
}

/**
 * R-DEC-43: the organizer rates every member at once after completion. Members who left by
 * hand-over may be included (their rating can be given or changed here too).
 */
export async function rateMembers(groupId: string, organizerUserId: string, ratings: MemberRating[]) {
  return withGroupLock(groupId, async (tx, group) => {
    if (!can.rate(group.state)) throw conflict(NOT_YET, "WRONG_STATE");
    const { members, leavers } = await rateableMembers(tx, group);
    const error = memberRatingsError(ratings, {
      organizerUserId,
      required: members.map((m) => m.userId),
      optional: leavers.map((l) => l.userId),
    });
    if (error) throw badRequest(error, "INVALID_RATING");
    const people = new Map([...members, ...leavers].map((p) => [p.userId, p]));
    for (const { userId, stars } of ratings) {
      const person = people.get(userId)!;
      await saveRating(tx, {
        groupId,
        reviewerId: organizerUserId,
        recipientId: userId,
        role: "MEMBER",
        stars,
        targetSlotId: person.slotId,
        targetName: person.name,
      });
    }
  });
}

/** R-DEC-43: a member rates the organizer, from the last round's close (R-DEC-47). Optional, and can be changed. */
export async function rateOrganizer(groupId: string, userId: string, stars: number) {
  assertStars(stars);
  return withGroupLock(groupId, async (tx, group) => {
    if (!(await canRateOrganizer(tx, group))) throw conflict(ORGANIZER_NOT_YET, "WRONG_STATE");
    const slot = await tx.slot.findFirst({ where: { groupId, userId } });
    if (!slot) throw notFound("Paluwagan");
    if (slot.isOrganizer) throw forbidden("You can't rate yourself.");
    const organizerSlot = await tx.slot.findFirstOrThrow({ where: { groupId, isOrganizer: true }, include: { user: true } });
    await saveRating(tx, {
      groupId,
      reviewerId: userId,
      recipientId: group.organizerId,
      role: "ORGANIZER",
      stars,
      targetSlotId: organizerSlot.id,
      targetName: slotName(organizerSlot),
    });
  });
}

/**
 * R-DEC-43: the organizer's chance to rate a member as they hand their slot over (R-WDR-09), before
 * completion. Call it in the approval's transaction, while the slot is still theirs.
 */
export async function rateLeaver(
  db: Db,
  group: Group,
  slot: Slot & { user: { displayName: string } | null },
  stars: number,
) {
  if (!slot.userId || slot.isOrganizer) throw badRequest("Only a member leaving can be rated here.", "INVALID_RATING");
  await saveRating(db, {
    groupId: group.id,
    reviewerId: group.organizerId,
    recipientId: slot.userId,
    role: "MEMBER",
    stars,
    targetSlotId: slot.id,
    targetName: slotName(slot),
  });
}

/**
 * For the group page: once it's completed, the organizer's ratings of members (and whether every
 * member has one); from the last round's close (R-DEC-47), a member's rating of the organizer. Null before.
 */
export async function ratingsView(db: Db, group: Group, viewer: Slot) {
  if (viewer.isOrganizer ? !can.rate(group.state) : !(await canRateOrganizer(db, group))) return null;
  const given = await db.rating.findMany({ where: { groupId: group.id, reviewerId: viewer.userId! } });
  const starsFor = (userId: string, role: RatingRole) =>
    given.find((r) => r.recipientId === userId && r.role === role)?.stars ?? null;

  if (viewer.isOrganizer) {
    const { members, leavers } = await rateableMembers(db, group);
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    const rows = [
      ...members.sort(byName).map((m) => ({ userId: m.userId, name: m.name, left: false, stars: starsFor(m.userId, "MEMBER") })),
      ...leavers.sort(byName).map((l) => ({ userId: l.userId, name: l.name, left: true, stars: starsFor(l.userId, "MEMBER") })),
    ];
    return {
      kind: "members" as const,
      members: rows,
      /** Every member holding a slot has a rating (R-DEC-43); leavers are optional. */
      done: rows.every((r) => r.left || r.stars != null),
    };
  }
  return { kind: "organizer" as const, stars: starsFor(group.organizerId, "ORGANIZER") };
}

/**
 * R-DEC-43: a user's public profile, for any signed-in user. Name, when they joined and the two
 * averages with their counts; never email, contact or money.
 */
export async function userProfile(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, displayName: true, createdAt: true } });
  if (!user) throw notFound("User");
  const totals = await prisma.rating.groupBy({
    by: ["role"],
    where: { recipientId: userId },
    _sum: { stars: true },
    _count: { _all: true },
  });
  const summary = (role: RatingRole) => {
    const row = totals.find((t) => t.role === role);
    const count = row?._count._all ?? 0;
    return { average: ratingAverage(row?._sum.stars ?? 0, count), count };
  };
  return {
    id: user.id,
    displayName: user.displayName,
    memberSince: user.createdAt.toISOString(),
    /** From organizers, as a member. */
    memberRating: summary("MEMBER"),
    /** From members, as the organizer. */
    organizerRating: summary("ORGANIZER"),
  };
}
