import { Router } from "express";
import { InviteTokenType } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { createNotification, writeAuditLog } from "../lib/audit.js";
import { requireAuth } from "../middleware/auth.js";
import {
  countFilledSlots,
  getMembership,
  GroupError,
  serializeGroup,
} from "../services/groups.js";

const router = Router();

async function loadInvite(token: string) {
  const invite = await prisma.inviteToken.findUnique({
    where: { token },
    include: { group: true, targetMembership: true },
  });
  if (!invite || invite.revokedAt) {
    throw new GroupError(404, "Invalid or expired invite");
  }
  if (invite.expiresAt && invite.expiresAt < new Date()) {
    throw new GroupError(410, "This invite link has expired");
  }
  return invite;
}

router.get("/:token", async (req, res, next) => {
  try {
    const invite = await loadInvite(String(req.params.token));
    const group = invite.group;

    const [filledCount, members, manager] = await Promise.all([
      countFilledSlots(group.id),
      prisma.membership.findMany({
        where: { groupId: group.id },
        select: {
          displayName: true,
          isManager: true,
          userId: true,
          turnNumber: true,
        },
        orderBy: [{ isManager: "desc" }, { turnNumber: "asc" }, { createdAt: "asc" }],
      }),
      prisma.user.findUnique({
        where: { id: group.managerId },
        select: { displayName: true },
      }),
    ]);

    let canJoin = true;
    let reason: string | undefined;

    if (invite.type === InviteTokenType.group_invite) {
      if (group.status !== "forming") {
        canJoin = false;
        reason = "This group is no longer accepting new members.";
      } else if (filledCount >= group.slotCount) {
        canJoin = false;
        reason = "This group is full.";
      }
    } else {
      if (!invite.targetMembership || invite.targetMembership.userId !== null) {
        canJoin = false;
        reason = "This chair has already been claimed.";
      }
    }

    res.json({
      invite: {
        type: invite.type,
        token: invite.token,
        canJoin,
        reason,
        expiresAt: invite.expiresAt?.toISOString() ?? null,
      },
      group: serializeGroup(group, filledCount),
      manager: { displayName: manager?.displayName ?? "Organizer" },
      members: members.map((m) => ({
        displayName: m.displayName,
        isManager: m.isManager,
        isPlaceholder: m.userId === null,
        turnNumber: m.turnNumber,
      })),
      placeholder:
        invite.type === InviteTokenType.membership_claim && invite.targetMembership
          ? {
              displayName: invite.targetMembership.displayName,
              turnNumber: invite.targetMembership.turnNumber,
              contact: invite.targetMembership.contact,
            }
          : null,
    });
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

router.post("/:token/resolve", requireAuth, async (req, res, next) => {
  try {
    const invite = await loadInvite(String(req.params.token));
    const userId = req.user!.id;
    const group = invite.group;

    if (invite.type === InviteTokenType.group_invite) {
      if (group.status !== "forming") {
        res.status(409).json({ error: "This group is no longer accepting new members" });
        return;
      }

      const existing = await getMembership(userId, group.id);
      if (existing) {
        res.json({
          alreadyMember: true,
          groupId: group.id,
          membershipId: existing.id,
        });
        return;
      }

      const filledCount = await countFilledSlots(group.id);
      if (filledCount >= group.slotCount) {
        res.status(409).json({ error: "This group is full" });
        return;
      }

      const membership = await prisma.membership.create({
        data: {
          groupId: group.id,
          userId,
          displayName: req.user!.displayName,
        },
      });

      await writeAuditLog({
        groupId: group.id,
        actorId: userId,
        action: "membership.joined_via_invite",
        entityType: "membership",
        entityId: membership.id,
        metadata: { inviteTokenId: invite.id, displayName: req.user!.displayName },
      });

      res.status(201).json({
        groupId: group.id,
        membershipId: membership.id,
      });
      return;
    }

    // membership_claim
    const placeholder = invite.targetMembership;
    if (!placeholder || placeholder.userId !== null) {
      res.status(409).json({ error: "This chair has already been claimed" });
      return;
    }

    const existingInGroup = await getMembership(userId, group.id);
    if (existingInGroup) {
      res.status(409).json({ error: "You already have a seat in this group" });
      return;
    }

    const membership = await prisma.membership.update({
      where: { id: placeholder.id },
      data: {
        userId,
        displayName: req.user!.displayName,
      },
    });

    await prisma.inviteToken.update({
      where: { id: invite.id },
      data: { revokedAt: new Date() },
    });

    await writeAuditLog({
      groupId: group.id,
      actorId: userId,
      action: "membership.claimed",
      entityType: "membership",
      entityId: membership.id,
      metadata: {
        inviteTokenId: invite.id,
        displayName: req.user!.displayName,
        placeholderName: placeholder.displayName,
      },
    });

    const managerMembership = await prisma.membership.findFirst({
      where: { groupId: group.id, isManager: true },
    });
    if (managerMembership?.userId) {
      await createNotification({
        userId: managerMembership.userId,
        groupId: group.id,
        type: "chair_claimed",
        title: `${group.name}: chair claimed`,
        body: `${req.user!.displayName} claimed the seat for ${placeholder.displayName}.`,
        link: `/groups/${group.id}`,
      });
    }

    res.json({
      groupId: group.id,
      membershipId: membership.id,
    });
  } catch (err) {
    if (err instanceof GroupError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    next(err);
  }
});

export default router;
