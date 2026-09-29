import { ContributionStatus, Group, GroupStatus, Membership, Prisma, RoundStatus } from "@prisma/client";
import { createNotification, writeAuditLog } from "../lib/audit.js";
import { resolveAppOrigin } from "../lib/origin.js";
import { prisma } from "../lib/prisma.js";
import { getCompletedGroupCardStats } from "./groupCardStats.js";

export class GroupError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** A completed paluwagan's roster is closed: placeholder seats can no longer be claimed. */
export const CLAIM_CLOSED_MESSAGE = "This paluwagan has finished, so this seat can no longer be claimed.";

export async function countFilledSlots(groupId: string): Promise<number> {
  return prisma.membership.count({ where: { groupId } });
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

export async function listUserGroups(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          contributionAmount: true,
          frequency: true,
          frequencyDays: true,
          slotCount: true,
          startDate: true,
          shortfallInterestRatePercent: true,
          _count: { select: { memberships: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const completedIds = memberships
    .filter((m) => m.group.status === GroupStatus.completed)
    .map((m) => m.groupId);
  const completedStats = await getCompletedGroupCardStats(completedIds);

  // For active groups, the current round and the round that pays out to the viewer, so the
  // home card can say how many rounds until their turn.
  const activeMemberships = memberships.filter((m) => m.group.status === GroupStatus.active);
  const activeRounds =
    activeMemberships.length === 0
      ? []
      : await prisma.round.findMany({
          where: {
            groupId: { in: activeMemberships.map((m) => m.groupId) },
            OR: [
              { status: RoundStatus.current },
              { recipientMembershipId: { in: activeMemberships.map((m) => m.id) } },
            ],
          },
          select: { groupId: true, number: true, status: true, recipientMembershipId: true, dueDate: true },
        });
  // The viewer's own contribution in each current round, so the card can say "₱1,000 due" or "paid up".
  const myCurrentContributions =
    activeMemberships.length === 0
      ? []
      : await prisma.contribution.findMany({
          where: { membershipId: { in: activeMemberships.map((m) => m.id) }, round: { status: RoundStatus.current } },
          select: { membershipId: true, status: true, amount: true },
        });
  const myContributionByMembership = new Map(myCurrentContributions.map((c) => [c.membershipId, c]));
  const currentDueDateByGroup = new Map<string, string>();
  const currentRoundByGroup = new Map<string, number>();
  const payoutRoundByMembership = new Map<string, number>();
  for (const round of activeRounds) {
    if (round.status === RoundStatus.current) {
      currentRoundByGroup.set(round.groupId, round.number);
      currentDueDateByGroup.set(round.groupId, round.dueDate.toISOString().slice(0, 10));
    }
    payoutRoundByMembership.set(round.recipientMembershipId, round.number);
  }

  return memberships.map((m) => {
    const base = {
      ...serializeGroup(
        m.group,
        m.group._count.memberships,
        m.isManager ? "manager" : "member",
      ),
      membershipId: m.id,
    };
    if (m.group.status === GroupStatus.active) {
      const mine = myContributionByMembership.get(m.id);
      const remaining = mine
        ? Prisma.Decimal.max(m.group.contributionAmount.minus(mine.amount), new Prisma.Decimal(0))
        : null;
      return {
        ...base,
        currentRoundNumber: currentRoundByGroup.get(m.groupId) ?? null,
        currentRoundDueDate: currentDueDateByGroup.get(m.groupId) ?? null,
        myPayoutRoundNumber: payoutRoundByMembership.get(m.id) ?? null,
        myRoundStatus: !mine
          ? null
          : mine.status === ContributionStatus.reported
            ? ("reported" as const)
            : mine.status === ContributionStatus.confirmed && remaining!.lte(0)
              ? ("paid" as const)
              : ("due" as const),
        myRoundDue:
          !mine || mine.status === ContributionStatus.reported
            ? null
            : (mine.status === ContributionStatus.confirmed ? remaining! : m.group.contributionAmount).toString(),
      };
    }
    if (m.group.status !== GroupStatus.completed) return base;
    const stats = completedStats.get(m.groupId);
    if (!stats) return base;
    return {
      ...base,
      totalCollected: stats.totalCollected,
      outstandingDebt: stats.outstandingDebt,
    };
  });
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
