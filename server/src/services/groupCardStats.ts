import { ContributionStatus, ObligationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  getGroupInterestRoundContexts,
  getObligationTotalRemaining,
  toShortfallInterestTerms,
} from "./shortfallInterest.js";

export async function getCompletedGroupCardStats(
  groupIds: string[],
): Promise<Map<string, { totalCollected: string; outstandingDebt: string }>> {
  const map = new Map<string, { totalCollected: string; outstandingDebt: string }>();
  if (groupIds.length === 0) return map;

  const [groups, contributions, obligations, roundContexts] = await Promise.all([
    prisma.group.findMany({
      where: { id: { in: groupIds } },
      select: {
        id: true,
        shortfallInterestRatePercent: true,
        frequency: true,
        frequencyDays: true,
      },
    }),
    prisma.contribution.findMany({
      where: {
        status: ContributionStatus.confirmed,
        round: { groupId: { in: groupIds } },
      },
      select: { amount: true, round: { select: { groupId: true } } },
    }),
    prisma.obligation.findMany({
      where: {
        status: { not: ObligationStatus.settled },
        sourceRound: { groupId: { in: groupIds } },
      },
      include: {
        sourceRound: { select: { groupId: true, number: true } },
      },
    }),
    getGroupInterestRoundContexts(prisma, groupIds),
  ]);

  const collectedByGroup = new Map<string, Prisma.Decimal>();
  for (const groupId of groupIds) {
    collectedByGroup.set(groupId, new Prisma.Decimal(0));
  }
  for (const c of contributions) {
    const groupId = c.round.groupId;
    collectedByGroup.set(groupId, (collectedByGroup.get(groupId) ?? new Prisma.Decimal(0)).plus(c.amount));
  }

  const termsByGroup = new Map(groups.map((g) => [g.id, toShortfallInterestTerms(g)]));

  const debtByGroup = new Map<string, Prisma.Decimal>();
  for (const groupId of groupIds) {
    debtByGroup.set(groupId, new Prisma.Decimal(0));
  }
  for (const o of obligations) {
    const groupId = o.sourceRound.groupId;
    const terms = termsByGroup.get(groupId);
    const ctx = roundContexts.get(groupId);
    if (!terms || !ctx) continue;
    const remaining = getObligationTotalRemaining(o, terms, {
      sourceRoundNumber: o.sourceRound.number,
      ...ctx,
    });
    debtByGroup.set(groupId, (debtByGroup.get(groupId) ?? new Prisma.Decimal(0)).plus(remaining));
  }

  for (const groupId of groupIds) {
    map.set(groupId, {
      totalCollected: (collectedByGroup.get(groupId) ?? new Prisma.Decimal(0)).toString(),
      outstandingDebt: (debtByGroup.get(groupId) ?? new Prisma.Decimal(0)).toString(),
    });
  }

  return map;
}
