import { GroupFrequency, Prisma, RoundStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

function decimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

export type ShortfallInterestTerms = {
  shortfallInterestRatePercent: Prisma.Decimal;
  frequency: GroupFrequency;
  frequencyDays: number | null;
};

/** Round progress used to determine how many interest periods have elapsed. */
export type GroupInterestRoundContext = {
  lastClosedRoundNumber: number;
  currentRoundNumber: number | null;
};

export type ObligationInterestContext = {
  sourceRoundNumber: number;
} & GroupInterestRoundContext;

type RoundDb = Pick<typeof prisma, "round">;

export function toShortfallInterestTerms(group: {
  shortfallInterestRatePercent: Prisma.Decimal;
  frequency: GroupFrequency;
  frequencyDays: number | null;
}): ShortfallInterestTerms {
  return {
    shortfallInterestRatePercent: group.shortfallInterestRatePercent,
    frequency: group.frequency,
    frequencyDays: group.frequencyDays,
  };
}

/** Interest accrues through the current open round, or the last closed round when the cycle has finished. */
export function resolveInterestAccrualRound(context: GroupInterestRoundContext): number {
  return context.currentRoundNumber ?? context.lastClosedRoundNumber;
}

/** One period per round that has started after the obligation's source round. */
export function countInterestPeriods(
  sourceRoundNumber: number,
  roundContext: GroupInterestRoundContext,
): number {
  return Math.max(0, resolveInterestAccrualRound(roundContext) - sourceRoundNumber);
}

export async function getGroupInterestRoundContext(
  db: RoundDb,
  groupId: string,
): Promise<GroupInterestRoundContext> {
  const map = await getGroupInterestRoundContexts(db, [groupId]);
  return map.get(groupId) ?? { lastClosedRoundNumber: 0, currentRoundNumber: null };
}

export async function getGroupInterestRoundContexts(
  db: RoundDb,
  groupIds: string[],
): Promise<Map<string, GroupInterestRoundContext>> {
  if (groupIds.length === 0) return new Map();

  const rounds = await db.round.findMany({
    where: {
      groupId: { in: groupIds },
      status: { in: [RoundStatus.closed, RoundStatus.current] },
    },
    select: { groupId: true, number: true, status: true },
  });

  const map = new Map<string, GroupInterestRoundContext>();
  for (const groupId of groupIds) {
    map.set(groupId, { lastClosedRoundNumber: 0, currentRoundNumber: null });
  }

  for (const round of rounds) {
    const ctx = map.get(round.groupId)!;
    if (round.status === RoundStatus.closed && round.number > ctx.lastClosedRoundNumber) {
      ctx.lastClosedRoundNumber = round.number;
    }
    if (round.status === RoundStatus.current) {
      ctx.currentRoundNumber = round.number;
    }
  }

  return map;
}

export function getRemainingPrincipal(
  amount: Prisma.Decimal,
  settledAmount: Prisma.Decimal,
): Prisma.Decimal {
  const remaining = amount.minus(settledAmount);
  return remaining.gt(0) ? remaining : decimal(0);
}

/** Simple interest: rate% × remaining principal × elapsed round periods. */
export function computeAccruedInterest(
  remainingPrincipal: Prisma.Decimal,
  terms: ShortfallInterestTerms,
  elapsedPeriods: number,
): Prisma.Decimal {
  if (
    terms.shortfallInterestRatePercent.lte(0) ||
    remainingPrincipal.lte(0) ||
    elapsedPeriods <= 0
  ) {
    return decimal(0);
  }

  return remainingPrincipal
    .times(terms.shortfallInterestRatePercent)
    .div(100)
    .times(elapsedPeriods);
}

export function getNetAccruedInterest(
  remainingPrincipal: Prisma.Decimal,
  terms: ShortfallInterestTerms,
  elapsedPeriods: number,
  interestSettledAmount: Prisma.Decimal,
): Prisma.Decimal {
  const gross = computeAccruedInterest(remainingPrincipal, terms, elapsedPeriods);
  const net = gross.minus(interestSettledAmount);
  return net.gt(0) ? net : decimal(0);
}

export function getObligationTotalRemaining(
  obligation: {
    amount: Prisma.Decimal;
    settledAmount: Prisma.Decimal;
    interestSettledAmount?: Prisma.Decimal;
  },
  terms: ShortfallInterestTerms,
  interestContext: ObligationInterestContext,
): Prisma.Decimal {
  const principalRemaining = getRemainingPrincipal(obligation.amount, obligation.settledAmount);
  const periods = countInterestPeriods(interestContext.sourceRoundNumber, interestContext);
  const interest = getNetAccruedInterest(
    principalRemaining,
    terms,
    periods,
    obligation.interestSettledAmount ?? decimal(0),
  );
  const total = principalRemaining.plus(interest);
  return total.gt(0) ? total : decimal(0);
}

export function splitSettlementPayment(
  payment: Prisma.Decimal,
  principalRemaining: Prisma.Decimal,
  interestDue: Prisma.Decimal,
): { interestPaid: Prisma.Decimal; principalPaid: Prisma.Decimal } {
  if (payment.lte(0)) {
    return { interestPaid: decimal(0), principalPaid: decimal(0) };
  }

  const interestPaid = payment.lte(interestDue) ? payment : interestDue;
  const principalPaid = payment.minus(interestPaid);
  return { interestPaid, principalPaid };
}
