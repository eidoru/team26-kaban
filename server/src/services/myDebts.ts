import { ObligationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import {
  getGroupInterestRoundContexts,
  getObligationTotalRemaining,
  getRemainingPrincipal,
  toShortfallInterestTerms,
} from "./shortfallInterest.js";

export type GroupDebt = {
  groupId: string;
  groupName: string;
  groupStatus: string;
  /** Principal plus accrued interest still owed to the organizer. */
  remaining: string;
  interest: string;
  obligationCount: number;
  hasPendingClaim: boolean;
};

/** What a user owes, per group, across every group they belong to (organizers never owe themselves). */
export async function getUserDebts(userId: string): Promise<GroupDebt[]> {
  const obligations = await prisma.obligation.findMany({
    where: {
      status: { not: ObligationStatus.settled },
      debtorMembership: { userId, isManager: false },
    },
    select: {
      amount: true,
      settledAmount: true,
      interestSettledAmount: true,
      debtorMembershipId: true,
      sourceRound: {
        select: {
          number: true,
          group: {
            select: {
              id: true,
              name: true,
              status: true,
              shortfallInterestRatePercent: true,
              frequency: true,
              frequencyDays: true,
            },
          },
        },
      },
    },
  });
  if (obligations.length === 0) return [];

  const groupIds = [...new Set(obligations.map((o) => o.sourceRound.group.id))];
  const membershipIds = [...new Set(obligations.map((o) => o.debtorMembershipId))];
  const [contexts, pendingClaims] = await Promise.all([
    getGroupInterestRoundContexts(prisma, groupIds),
    prisma.settlementClaim.findMany({
      where: { status: "pending", debtorMembershipId: { in: membershipIds } },
      select: { debtorMembership: { select: { groupId: true } } },
    }),
  ]);
  const claimGroups = new Set(pendingClaims.map((c) => c.debtorMembership.groupId));

  const byGroup = new Map<string, GroupDebt & { remainingDec: Prisma.Decimal; interestDec: Prisma.Decimal }>();
  for (const o of obligations) {
    const group = o.sourceRound.group;
    const context = contexts.get(group.id) ?? { lastClosedRoundNumber: 0, currentRoundNumber: null };
    const remaining = getObligationTotalRemaining(o, toShortfallInterestTerms(group), {
      sourceRoundNumber: o.sourceRound.number,
      ...context,
    });
    if (remaining.lte(0)) continue;
    const interest = remaining.minus(getRemainingPrincipal(o.amount, o.settledAmount));
    const entry = byGroup.get(group.id) ?? {
      groupId: group.id,
      groupName: group.name,
      groupStatus: group.status,
      remaining: "0",
      interest: "0",
      obligationCount: 0,
      hasPendingClaim: claimGroups.has(group.id),
      remainingDec: new Prisma.Decimal(0),
      interestDec: new Prisma.Decimal(0),
    };
    entry.remainingDec = entry.remainingDec.plus(remaining);
    entry.interestDec = entry.interestDec.plus(interest.gt(0) ? interest : 0);
    entry.obligationCount += 1;
    byGroup.set(group.id, entry);
  }

  return [...byGroup.values()]
    .map(({ remainingDec, interestDec, ...rest }) => ({
      ...rest,
      remaining: remainingDec.toString(),
      interest: interestDec.toString(),
    }))
    .sort((a, b) => Number(b.remaining) - Number(a.remaining));
}
