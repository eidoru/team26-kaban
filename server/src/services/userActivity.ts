import {
  ContributionStatus,
  GroupStatus,
  ObligationStatus,
  Prisma,
  RoundStatus,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getGroupInterestRoundContexts, getObligationTotalRemaining, toShortfallInterestTerms } from "./shortfallInterest.js";

export interface UserActivityStats {
  paluwagans: {
    total: number;
    active: number;
    forming: number;
    completed: number;
  };
  totalContributed: string;
  totalReceived: string;
  outstanding: string;
}

export async function getUserActivityStats(userId: string): Promise<UserActivityStats> {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: { group: { select: { status: true } } },
  });

  const paluwagans = {
    total: memberships.length,
    active: 0,
    forming: 0,
    completed: 0,
  };

  for (const membership of memberships) {
    switch (membership.group.status) {
      case GroupStatus.active:
        paluwagans.active++;
        break;
      case GroupStatus.forming:
        paluwagans.forming++;
        break;
      case GroupStatus.completed:
        paluwagans.completed++;
        break;
    }
  }

  const membershipIds = memberships.map((m) => m.id);

  const [contributedAgg, receivedAgg, obligations] = await Promise.all([
    membershipIds.length > 0
      ? prisma.contribution.aggregate({
          where: {
            membershipId: { in: membershipIds },
            status: ContributionStatus.confirmed,
          },
          _sum: { amount: true },
        })
      : Promise.resolve({ _sum: { amount: null } }),
    prisma.contribution.aggregate({
      where: {
        status: ContributionStatus.confirmed,
        round: {
          status: RoundStatus.closed,
          recipientMembership: { userId },
        },
      },
      _sum: { amount: true },
    }),
    prisma.obligation.findMany({
      where: {
        debtorMembership: { userId },
        status: { not: ObligationStatus.settled },
      },
      select: {
        amount: true,
        settledAmount: true,
        interestSettledAmount: true,
        sourceRound: {
          select: {
            number: true,
            groupId: true,
            group: {
              select: {
                shortfallInterestRatePercent: true,
                frequency: true,
                frequencyDays: true,
              },
            },
          },
        },
      },
    }),
  ]);

  const roundContextByGroup = await getGroupInterestRoundContexts(
    prisma,
    [...new Set(obligations.map((o) => o.sourceRound.groupId))],
  );

  let outstanding = new Prisma.Decimal(0);
  for (const obligation of obligations) {
    const terms = toShortfallInterestTerms(obligation.sourceRound.group);
    const groupRoundContext = roundContextByGroup.get(obligation.sourceRound.groupId) ?? {
      lastClosedRoundNumber: 0,
      currentRoundNumber: null,
    };
    const remaining = getObligationTotalRemaining(obligation, terms, {
      sourceRoundNumber: obligation.sourceRound.number,
      ...groupRoundContext,
    });
    if (remaining.gt(0)) {
      outstanding = outstanding.plus(remaining);
    }
  }

  return {
    paluwagans,
    totalContributed: (contributedAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
    totalReceived: (receivedAgg._sum.amount ?? new Prisma.Decimal(0)).toString(),
    outstanding: outstanding.toString(),
  };
}
