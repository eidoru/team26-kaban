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

  let totalContributed = new Prisma.Decimal(0);
  if (membershipIds.length > 0) {
    const contributions = await prisma.contribution.findMany({
      where: {
        membershipId: { in: membershipIds },
        status: ContributionStatus.confirmed,
      },
      select: { amount: true },
    });
    for (const contribution of contributions) {
      totalContributed = totalContributed.plus(contribution.amount);
    }
  }

  let totalReceived = new Prisma.Decimal(0);
  const receivedRounds = await prisma.round.findMany({
    where: {
      recipientMembership: { userId },
      status: RoundStatus.closed,
    },
    include: {
      contributions: {
        where: { status: ContributionStatus.confirmed },
        select: { amount: true },
      },
    },
  });
  for (const round of receivedRounds) {
    for (const contribution of round.contributions) {
      totalReceived = totalReceived.plus(contribution.amount);
    }
  }

  let outstanding = new Prisma.Decimal(0);
  const obligations = await prisma.obligation.findMany({
    where: {
      debtorMembership: { userId },
      status: { not: ObligationStatus.settled },
    },
    select: {
      amount: true,
      settledAmount: true,
      createdAt: true,
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
  });
  const roundContextByGroup = await getGroupInterestRoundContexts(
    prisma,
    [...new Set(obligations.map((o) => o.sourceRound.groupId))],
  );
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
    totalContributed: totalContributed.toString(),
    totalReceived: totalReceived.toString(),
    outstanding: outstanding.toString(),
  };
}
