import { can } from "../domain/lifecycle.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { notifyUsers } from "./notifications.js";
import { publicSummary } from "./groups.js";
import { assertState, memberUserIds, resetOrder, slotName, withGroupLock } from "./common.js";

/** Person name and contact limits, unchanged from before the rewrite. */
export const PERSON_NAME_MAX = 100;
export const CONTACT_MAX = 200;

/** R-LOB-01: one permanent invite link per group. Asking again returns the same link. */
export async function createInviteLink(groupId: string, actorUserId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    assertState(group, ["LOBBY"], "Invites close once the paluwagan launches.");
    const existing = await tx.inviteLink.findFirst({ where: { groupId, revokedAt: null } });
    if (existing) return existing;
    const link = await tx.inviteLink.create({ data: { groupId } });
    await audit(tx, { groupId, actorUserId, action: "invite_link.created" });
    return link;
  });
}

export type InviteStatus = "OPEN" | "FULL" | "CLOSED" | "ALREADY_MEMBER";

/** R-INV-01…06: what the landing page shows for this link and viewer. */
export async function getInvite(token: string, userId: string | undefined) {
  const link = await prisma.inviteLink.findUnique({
    where: { token },
    include: { group: { include: { organizer: { select: { displayName: true } }, slots: true } } },
  });
  if (!link || link.revokedAt) throw notFound("Invite link");
  const { group } = link;
  const occupied = group.slots.length;
  const isMember = !!userId && group.slots.some((s) => s.userId === userId);
  const status: InviteStatus = isMember
    ? "ALREADY_MEMBER"
    : !can.join(group.state)
      ? "CLOSED"
      : occupied >= group.slotCount
        ? "FULL"
        : "OPEN";
  return { status, group: publicSummary(group, occupied) };
}

/** R-INV-03 / R-INV-07: take an open slot. Kicked members may rejoin (R-LOB-05). */
export async function joinViaInvite(token: string, userId: string) {
  const link = await prisma.inviteLink.findUnique({ where: { token } });
  if (!link || link.revokedAt) throw notFound("Invite link");
  return withGroupLock(link.groupId, async (tx, group) => {
    const existing = await tx.slot.findFirst({ where: { groupId: group.id, userId } });
    if (existing) return { groupId: group.id, alreadyMember: true };
    if (!can.join(group.state)) throw conflict("This paluwagan is no longer accepting members.", "CLOSED");
    const occupied = await tx.slot.count({ where: { groupId: group.id } });
    if (occupied >= group.slotCount) throw conflict("This paluwagan is full.", "FULL");

    const slot = await tx.slot.create({ data: { groupId: group.id, userId }, include: { user: true } });
    await audit(tx, {
      groupId: group.id,
      actorUserId: userId,
      action: "member.joined",
      targetSlotId: slot.id,
      targetName: slotName(slot),
    });
    const others = (await memberUserIds(tx, group.id)).filter((id) => id !== userId);
    await notifyUsers(tx, others, {
      groupId: group.id,
      kind: "member.joined",
      title: `${slotName(slot)} joined ${group.name}`,
      body: `${occupied + 1} of ${group.slotCount} slots are filled.`,
    });
    return { groupId: group.id, alreadyMember: false };
  });
}

/** R-LOB-02 */
export async function addPlaceholder(groupId: string, actorUserId: string, input: { name: string; contact?: string }) {
  const name = input.name.trim();
  const contact = input.contact?.trim() || null;
  if (!name) throw badRequest("Enter a name for the placeholder.");
  if (name.length > PERSON_NAME_MAX) throw badRequest(`Names can be up to ${PERSON_NAME_MAX} characters.`);
  if (contact && contact.length > CONTACT_MAX) throw badRequest(`Contacts can be up to ${CONTACT_MAX} characters.`);

  return withGroupLock(groupId, async (tx, group) => {
    assertState(group, ["LOBBY"], "The roster is locked once the paluwagan launches.");
    const occupied = await tx.slot.count({ where: { groupId } });
    if (occupied >= group.slotCount) throw conflict("Every slot is taken.", "FULL");
    const slot = await tx.slot.create({ data: { groupId, placeholderName: name, placeholderContact: contact } });
    await audit(tx, { groupId, actorUserId, action: "placeholder.added", targetSlotId: slot.id, targetName: name });
    return slot;
  });
}

/**
 * R-LOB-04 (delete a placeholder), R-LOB-05 (kick a member), R-LOB-07 (leave). The slot becomes
 * empty and any payout order is reset (R-LOB-12).
 */
export async function removeSlot(groupId: string, actorUserId: string, slotId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    assertState(group, ["LOBBY"], "Members can't leave or be removed after launch.");
    const slot = await tx.slot.findFirst({ where: { id: slotId, groupId }, include: { user: true } });
    if (!slot) throw notFound("Slot");
    if (slot.isOrganizer) throw forbidden("The organizer can't leave their own paluwagan. Cancel it instead.");

    const actor = await tx.slot.findFirstOrThrow({ where: { groupId, userId: actorUserId } });
    const leaving = slot.userId === actorUserId;
    if (!leaving && !actor.isOrganizer) throw forbidden("Only the organizer can remove someone.");

    const name = slotName(slot);
    const audience = (await memberUserIds(tx, groupId)).filter((id) => id !== actorUserId);
    await tx.slot.delete({ where: { id: slot.id } });
    await resetOrder(tx, group, actorUserId, leaving ? `${name} left` : `${name} was removed`);

    if (!slot.userId) {
      await audit(tx, { groupId, actorUserId, action: "placeholder.deleted", targetSlotId: slot.id, targetName: name });
      return;
    }
    await audit(tx, {
      groupId,
      actorUserId,
      action: leaving ? "member.left" : "member.kicked",
      targetSlotId: slot.id,
      targetName: name,
    });
    await notifyUsers(
      tx,
      audience.filter((id) => id !== slot.userId),
      {
        groupId,
        kind: leaving ? "member.left" : "member.kicked",
        title: leaving ? `${name} left ${group.name}` : `${name} was removed from ${group.name}`,
        body: "Their slot is open again.",
      },
    );
    if (!leaving) {
      // They've lost access to the group page, so this one links home.
      await notifyUsers(tx, [slot.userId], {
        groupId,
        kind: "member.kicked",
        title: `You were removed from ${group.name}`,
        body: "The organizer removed you. You can rejoin with the invite link while there's an open slot.",
        link: "/home",
      });
    }
  });
}

/** R-LOB-03: one permanent claim link per placeholder. Asking again returns the same link. */
export async function createClaimLink(groupId: string, actorUserId: string, slotId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    if (!can.claimPlaceholder(group.state)) throw conflict("Placeholders can't be claimed anymore.", "WRONG_STATE");
    const slot = await tx.slot.findFirst({ where: { id: slotId, groupId } });
    if (!slot) throw notFound("Slot");
    if (slot.userId) throw conflict("This slot already belongs to a member.");
    const existing = await tx.claimLink.findFirst({ where: { slotId, revokedAt: null, claimedAt: null } });
    if (existing) return existing;
    const link = await tx.claimLink.create({ data: { slotId } });
    await audit(tx, {
      groupId,
      actorUserId,
      action: "claim_link.created",
      targetSlotId: slotId,
      targetName: slot.placeholderName,
    });
    return link;
  });
}

async function liveClaim(token: string) {
  const link = await prisma.claimLink.findUnique({
    where: { token },
    include: {
      slot: {
        include: {
          group: { include: { organizer: { select: { displayName: true } }, slots: { select: { id: true } } } },
        },
      },
    },
  });
  if (!link || link.revokedAt) throw notFound("Claim link");
  return link;
}

export type ClaimStatus = "OPEN" | "CLAIMED" | "CLOSED" | "ALREADY_MEMBER";

/**
 * R-CLM-05: the placeholder's full record before claiming. In the lobby that's just its name and
 * position; payment history joins it once the paluwagan runs.
 */
export async function getClaim(token: string, userId: string | undefined) {
  const link = await liveClaim(token);
  const { slot } = link;
  const group = slot.group;
  const isMember = !!userId && (await prisma.slot.count({ where: { groupId: group.id, userId } })) > 0;
  const status: ClaimStatus = link.claimedAt
    ? "CLAIMED"
    : !can.claimPlaceholder(group.state)
      ? "CLOSED"
      : isMember
        ? "ALREADY_MEMBER"
        : "OPEN";
  return {
    status,
    group: publicSummary(group, group.slots.length),
    placeholder: { slotId: slot.id, name: slot.placeholderName, position: slot.position },
  };
}

/** R-CLM-01…06: the claimer takes the slot and everything tied to it. */
export async function claimPlaceholder(token: string, userId: string) {
  const link = await liveClaim(token);
  return withGroupLock(link.slot.groupId, async (tx, group) => {
    const fresh = await tx.claimLink.findUniqueOrThrow({ where: { id: link.id }, include: { slot: true } });
    if (fresh.revokedAt) throw notFound("Claim link");
    if (fresh.claimedAt || fresh.slot.userId) throw conflict("This placeholder has already been claimed.", "CLAIMED");
    if (!can.claimPlaceholder(group.state)) throw conflict("This paluwagan has ended.", "CLOSED");
    if (await tx.slot.findFirst({ where: { groupId: group.id, userId } })) {
      throw conflict("You already hold a slot in this paluwagan.", "ALREADY_MEMBER");
    }

    const now = new Date();
    const slot = await tx.slot.update({
      where: { id: fresh.slotId },
      data: { userId, claimedAt: now },
      include: { user: true },
    });
    await tx.claimLink.update({ where: { id: fresh.id }, data: { claimedAt: now, claimedByUserId: userId } });
    await audit(tx, {
      groupId: group.id,
      actorUserId: userId,
      action: "placeholder.claimed",
      targetSlotId: slot.id,
      targetName: slotName(slot),
      before: { placeholderName: fresh.slot.placeholderName },
      after: { name: slotName(slot) },
    });
    const others = (await memberUserIds(tx, group.id)).filter((id) => id !== userId);
    await notifyUsers(tx, others, {
      groupId: group.id,
      kind: "placeholder.claimed",
      title: `${slotName(slot)} claimed ${fresh.slot.placeholderName}'s slot`,
      body: `In ${group.name}.`,
    });
    return { groupId: group.id };
  });
}
