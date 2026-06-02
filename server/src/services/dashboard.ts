import { ContributionStatus, GroupStatus, ObligationStatus, Prisma, RoundStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";
import { startOfUtcDay } from "./schedule.js";
import { getGroupInterestRoundContext, getGroupInterestRoundContexts, getObligationTotalRemaining, toShortfallInterestTerms } from "./shortfallInterest.js";

export class DashboardError extends GroupError {}

export async function getGroupDashboard(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new DashboardError(404, "Group not found");
  if (group.status === GroupStatus.forming) {
    throw new DashboardError(404, "Dashboard is available after activation");
  }

  const today = startOfUtcDay(new Date());

  const [currentRound, pendingConfirmations, openDisputes, obligations, members, groupRoundContext] =
    await Promise.all([
      prisma.round.findFirst({
        where: { groupId, status: RoundStatus.current },
        include: {
          recipientMembership: { select: { displayName: true } },
          contributions: { select: { status: true } },
        },
      }),
      prisma.contribution.count({
        where: {
          round: { groupId, status: RoundStatus.current },
          status: ContributionStatus.reported,
        },
      }),
      prisma.dispute.count({
        where: {
          status: "open",
          contribution: { round: { groupId } },
        },
      }),
      prisma.obligation.findMany({
        where: {
          sourceRound: { groupId },
          status: { in: [ObligationStatus.unsettled, ObligationStatus.partially_settled] },
        },
        include: { sourceRound: { select: { number: true } } },
      }),
      prisma.membership.count({ where: { groupId } }),
      getGroupInterestRoundContext(prisma, groupId),
    ]);

  let overdueContributions = 0;
  let pendingContributions = 0;
  let confirmedContributions = 0;

  if (currentRound) {
    const roundDue = startOfUtcDay(currentRound.dueDate);
    const isOverdue = roundDue.getTime() < today.getTime();

    for (const c of currentRound.contributions) {
      if (c.status === ContributionStatus.confirmed) {
        confirmedContributions++;
      } else if (c.status === ContributionStatus.pending || c.status === ContributionStatus.reported) {
        pendingContributions++;
        if (isOverdue) overdueContributions++;
      }
    }
  }

  let outstanding = new Prisma.Decimal(0);
  const terms = toShortfallInterestTerms(group);
  for (const o of obligations) {
    outstanding = outstanding.plus(
      getObligationTotalRemaining(o, terms, {
        sourceRoundNumber: o.sourceRound.number,
        ...groupRoundContext,
      }),
    );
  }

  return {
    groupStatus: group.status,
    memberCount: members,
    currentRound: currentRound
      ? {
          number: currentRound.number,
          dueDate: currentRound.dueDate.toISOString().slice(0, 10),
          recipientName: currentRound.recipientMembership.displayName,
          confirmedContributions,
          pendingContributions,
          overdueContributions,
          isOverdue: startOfUtcDay(currentRound.dueDate).getTime() < today.getTime(),
        }
      : null,
    pendingConfirmations,
    openDisputes,
    outstandingObligations: obligations.length,
    totalOutstanding: outstanding.toString(),
    contributionAmount: group.contributionAmount.toString(),
  };
}

export async function getManagerTotalOutstanding(managerUserId: string): Promise<string> {
  const managedGroups = await prisma.group.findMany({
    where: { managerId: managerUserId, status: { in: [GroupStatus.active, GroupStatus.completed] } },
    select: {
      id: true,
      shortfallInterestRatePercent: true,
      frequency: true,
      frequencyDays: true,
    },
  });

  if (managedGroups.length === 0) return "0";

  const groupIds = managedGroups.map((g) => g.id);
  const groupById = new Map(managedGroups.map((g) => [g.id, g]));
  const obligations = await prisma.obligation.findMany({
    where: {
      sourceRound: { groupId: { in: groupIds } },
      status: { in: [ObligationStatus.unsettled, ObligationStatus.partially_settled] },
    },
    include: {
      sourceRound: { select: { number: true, groupId: true } },
    },
  });

  const roundContextByGroup = await getGroupInterestRoundContexts(prisma, groupIds);
  let total = new Prisma.Decimal(0);

  for (const o of obligations) {
    const group = groupById.get(o.sourceRound.groupId);
    if (!group) continue;
    const terms = toShortfallInterestTerms(group);
    const groupRoundContext = roundContextByGroup.get(o.sourceRound.groupId) ?? {
      lastClosedRoundNumber: 0,
      currentRoundNumber: null,
    };
    total = total.plus(
      getObligationTotalRemaining(o, terms, {
        sourceRoundNumber: o.sourceRound.number,
        ...groupRoundContext,
      }),
    );
  }

  return total.toString();
}

export async function getManagerObligationsOverview(managerUserId: string) {
  const managedGroups = await prisma.group.findMany({
    where: { managerId: managerUserId, status: { in: [GroupStatus.active, GroupStatus.completed] } },
    select: {
      id: true,
      name: true,
      status: true,
      shortfallInterestRatePercent: true,
      frequency: true,
      frequencyDays: true,
    },
  });

  if (managedGroups.length === 0) return { groups: [], totalOutstanding: "0" };

  const groupIds = managedGroups.map((g) => g.id);
  const groupById = new Map(managedGroups.map((g) => [g.id, g]));
  const obligations = await prisma.obligation.findMany({
    where: {
      sourceRound: { groupId: { in: groupIds } },
      status: { in: [ObligationStatus.unsettled, ObligationStatus.partially_settled] },
    },
    include: {
      debtorMembership: { select: { displayName: true } },
      sourceRound: { select: { number: true, groupId: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  let total = new Prisma.Decimal(0);
  const byGroup = new Map<
    string,
    {
      groupId: string;
      groupName: string;
      groupStatus: string;
      count: number;
      totalOutstanding: Prisma.Decimal;
      items: {
        id: string;
        displayName: string;
        roundNumber: number;
        remaining: string;
      }[];
    }
  >();

  for (const g of managedGroups) {
    byGroup.set(g.id, {
      groupId: g.id,
      groupName: g.name,
      groupStatus: g.status,
      count: 0,
      totalOutstanding: new Prisma.Decimal(0),
      items: [],
    });
  }

  const roundContextByGroup = await getGroupInterestRoundContexts(prisma, groupIds);

  for (const o of obligations) {
    const groupId = o.sourceRound.groupId;
    const entry = byGroup.get(groupId);
    const group = groupById.get(groupId);
    if (!entry || !group) continue;
    const terms = toShortfallInterestTerms(group);
    const groupRoundContext = roundContextByGroup.get(groupId) ?? {
      lastClosedRoundNumber: 0,
      currentRoundNumber: null,
    };
    const remaining = getObligationTotalRemaining(o, terms, {
      sourceRoundNumber: o.sourceRound.number,
      ...groupRoundContext,
    });
    total = total.plus(remaining);
    entry.count++;
    entry.totalOutstanding = entry.totalOutstanding.plus(remaining);
    entry.items.push({
      id: o.id,
      displayName: o.debtorMembership.displayName,
      roundNumber: o.sourceRound.number,
      remaining: remaining.toString(),
    });
  }

  return {
    totalOutstanding: total.toString(),
    groups: [...byGroup.values()]
      .filter((g) => g.count > 0)
      .map((g) => ({
        ...g,
        totalOutstanding: g.totalOutstanding.toString(),
      })),
  };
}
