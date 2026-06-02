import { Group, GroupStatus, Membership, Prisma } from "@prisma/client";
import { createNotification, writeAuditLog } from "../lib/audit.js";
import { resolveAppOrigin } from "../lib/origin.js";
import { prisma } from "../lib/prisma.js";

export class GroupError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function countFilledSlots(groupId: string): Promise<number> {
  return prisma.membership.count({ where: { groupId } });
}

export async function countFilledSlotsByGroupIds(
  groupIds: string[],
): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();

  const rows = await prisma.membership.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groupIds } },
    _count: { _all: true },
  });

  return new Map(rows.map((row) => [row.groupId, row._count._all]));
}

export function shouldResetPayoutOrder(opts: {
  groupStatus: GroupStatus;
  filledCount: number;
  slotCount: number;
  assignedTurnCount: number;
}): boolean {
  return (
    opts.groupStatus === GroupStatus.forming &&
    opts.filledCount < opts.slotCount &&
    opts.assignedTurnCount > 0
  );
}

type GroupDb = Pick<Prisma.TransactionClient, "group" | "membership">;

/** Clears turn numbers when the forming roster drops below capacity after order was set. */
export async function resetPayoutOrderIfRosterIncomplete(
  db: GroupDb,
  groupId: string,
): Promise<boolean> {
  const group = await db.group.findUnique({ where: { id: groupId } });
  if (!group) return false;

  const [filledCount, assignedTurnCount] = await Promise.all([
    db.membership.count({ where: { groupId } }),
    db.membership.count({ where: { groupId, turnNumber: { not: null } } }),
  ]);

  if (
    !shouldResetPayoutOrder({
      groupStatus: group.status,
      filledCount,
      slotCount: group.slotCount,
      assignedTurnCount,
    })
  ) {
    return false;
  }

  await db.membership.updateMany({
    where: { groupId },
    data: { turnNumber: null },
  });

  return true;
}

export async function getMembership(userId: string, groupId: string): Promise<Membership | null> {
  return prisma.membership.findFirst({ where: { userId, groupId } });
}

export async function requireMembership(userId: string, groupId: string): Promise<Membership> {
  const membership = await getMembership(userId, groupId);
  if (!membership) throw new GroupError(403, "You are not a member of this group");
  return membership;
}

export async function requireManager(userId: string, groupId: string): Promise<Membership> {
  const membership = await requireMembership(userId, groupId);
  if (!membership.isManager) throw new GroupError(403, "Manager access required");
  return membership;
}

export function assertForming(group: Group): void {
  if (group.status !== GroupStatus.forming) {
    throw new GroupError(409, "This action is only allowed while the group is forming");
  }
}

export async function getGroupOrThrow(groupId: string): Promise<Group> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError(404, "Group not found");
  return group;
}

/** Deletes a forming group, notifies joined members, and writes an audit entry first. */
export async function deleteFormingGroup(groupId: string, actorId: string): Promise<void> {
  const group = await getGroupOrThrow(groupId);
  assertForming(group);
  await requireManager(actorId, groupId);

  const otherMembers = await prisma.membership.findMany({
    where: {
      groupId,
      userId: { not: null },
      NOT: { userId: actorId },
    },
    select: { userId: true },
  });

  await writeAuditLog({
    groupId,
    actorId,
    action: "group.deleted",
    entityType: "group",
    entityId: groupId,
    metadata: { name: group.name },
  });

  for (const member of otherMembers) {
    if (!member.userId) continue;
    await createNotification({
      userId: member.userId,
      groupId,
      type: "general",
      title: `${group.name} was cancelled`,
      body: "The organizer cancelled this paluwagan while it was still forming.",
      link: "/home",
    });
  }

  await prisma.group.delete({ where: { id: groupId } });
}

export function serializeGroup(
  group: Pick<
    Group,
    | "id"
    | "name"
    | "status"
    | "contributionAmount"
    | "frequency"
    | "frequencyDays"
    | "slotCount"
    | "startDate"
    | "shortfallInterestRatePercent"
  >,
  filledCount: number,
  role?: "manager" | "member",
) {
  return {
    id: group.id,
    name: group.name,
    status: group.status,
    contributionAmount: group.contributionAmount.toString(),
    frequency: group.frequency,
    frequencyDays: group.frequencyDays,
    slotCount: group.slotCount,
    startDate: group.startDate,
    shortfallInterestRatePercent: group.shortfallInterestRatePercent.toString(),
    filledCount,
    openSlots: Math.max(0, group.slotCount - filledCount),
    role,
  };
}

export function serializeMember(m: Membership & { user?: { displayName: string; email: string } | null }) {
  return {
    id: m.id,
    displayName: m.displayName,
    contact: m.contact,
    isManager: m.isManager,
    isPlaceholder: m.userId === null,
    userId: m.userId,
    turnNumber: m.turnNumber,
  };
}

const INVITE_TTL_DAYS = 30;

export function inviteExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + INVITE_TTL_DAYS);
  return d;
}

export function inviteUrl(
  type: "group_invite" | "membership_claim",
  token: string,
  origin?: string,
): string {
  const path = type === "group_invite" ? "invite" : "claim";
  const base = origin ?? resolveAppOrigin();
  return `${base}/${path}/${token}`;
}
