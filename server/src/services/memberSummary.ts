import {
  ContributionStatus,
  DisputeStatus,
  GroupStatus,
  ObligationStatus,
  Prisma,
  RoundStatus,
  type Group,
  type Membership,
} from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";
import {
  getGroupInterestRoundContext,
  getObligationTotalRemaining,
  getRemainingPrincipal,
  toShortfallInterestTerms,
} from "./shortfallInterest.js";

export class MemberSummaryError extends GroupError {}

export type MemberRoundStatus = "paid" | "partial" | "awaiting" | "unpaid" | "missed" | "upcoming";

type SummaryRound = {
  number: number;
  dueDate: Date;
  status: RoundStatus;
  closedAt: Date | null;
  recipientMembershipId: string;
};

type SummaryContribution = {
  roundNumber: number;
  status: ContributionStatus;
  amount: Prisma.Decimal;
  /** When the payment was made: the member's report, or the organizer's recording. */
  paidAt?: Date | null;
};

type SummaryDebt = {
  remaining: Prisma.Decimal;
  principalRemaining: Prisma.Decimal;
};

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const DAY_MS = 24 * 60 * 60 * 1000;
const ZERO = new Prisma.Decimal(0);

/** Due dates are calendar days stored at UTC midnight; a payment any time that day counts as on time. */
function paidOnTime(paidAt: Date, dueDate: Date): boolean {
  return paidAt.getTime() < dueDate.getTime() + DAY_MS;
}

/** What the viewer still has to pay for a round; a reported payment counts as paid while it awaits review. */
function remainingFor(status: MemberRoundStatus, amount: Prisma.Decimal, expected: Prisma.Decimal) {
  if (status === "paid" || status === "awaiting") return ZERO;
  if (status === "partial") return Prisma.Decimal.max(expected.minus(amount), ZERO);
  return expected;
}

function roundStatusFor(
  round: SummaryRound,
  contribution: SummaryContribution | undefined,
  expected: Prisma.Decimal,
): MemberRoundStatus {
  if (round.status === RoundStatus.scheduled || !contribution) return "upcoming";
  if (contribution.status === ContributionStatus.confirmed) {
    return contribution.amount.gte(expected) ? "paid" : "partial";
  }
  if (contribution.status === ContributionStatus.reported) return "awaiting";
  return round.status === RoundStatus.closed ? "missed" : "unpaid";
}

/** The viewer's own standing in a started group: their payout turn, payments, debt and per-round record. */
export function buildMemberSummary(input: {
  membershipId: string;
  contributionAmount: Prisma.Decimal;
  rounds: SummaryRound[];
  contributions: SummaryContribution[];
  debts: SummaryDebt[];
  /** Organizers can't owe themselves; they see what members owe them instead. */
  receivables?: SummaryDebt[] | null;
  /** Shortfall interest paid (members) or collected (organizers) so far. */
  interestSettled?: Prisma.Decimal;
  openDisputes?: number;
}) {
  const { membershipId, contributionAmount, contributions, debts, receivables } = input;
  const rounds = [...input.rounds].sort((a, b) => a.number - b.number);
  const byRound = new Map(contributions.map((c) => [c.roundNumber, c]));
  const potAmount = contributionAmount.times(rounds.length);

  const payoutRound = rounds.find((r) => r.recipientMembershipId === membershipId) ?? null;
  const currentRound = rounds.find((r) => r.status === RoundStatus.current) ?? null;
  const payout = payoutRound && {
    roundNumber: payoutRound.number,
    dueDate: dateOnly(payoutRound.dueDate),
    potAmount: potAmount.toString(),
    status:
      payoutRound.status === RoundStatus.closed
        ? ("received" as const)
        : payoutRound.status === RoundStatus.current
          ? ("current" as const)
          : ("upcoming" as const),
    roundsAway:
      payoutRound.status === RoundStatus.scheduled && currentRound
        ? payoutRound.number - currentRound.number
        : null,
    receivedAt: payoutRound.closedAt?.toISOString() ?? null,
  };

  const started = rounds.filter((r) => r.status !== RoundStatus.scheduled);
  const confirmedPaid = contributions
    .filter((c) => c.status === ContributionStatus.confirmed)
    .reduce((sum, c) => sum.plus(c.amount), new Prisma.Decimal(0));

  let stillToPay = ZERO;
  let currentRemaining = ZERO;
  let paymentsMade = 0;
  let paymentsOnTime = 0;
  const roundRecords = rounds.map((round) => {
    const contribution = byRound.get(round.number);
    const status = roundStatusFor(round, contribution, contributionAmount);
    if (round.status !== RoundStatus.closed) {
      const remaining = remainingFor(status, contribution?.amount ?? ZERO, contributionAmount);
      stillToPay = stillToPay.plus(remaining);
      if (round.status === RoundStatus.current) currentRemaining = remaining;
    }
    if (contribution && contribution.status !== ContributionStatus.pending && contribution.paidAt) {
      paymentsMade += 1;
      if (paidOnTime(contribution.paidAt, round.dueDate)) paymentsOnTime += 1;
    }
    return {
      number: round.number,
      dueDate: dateOnly(round.dueDate),
      status,
      amount: contribution?.amount.toString() ?? "0",
      isPayout: round.recipientMembershipId === membershipId,
    };
  });

  const debtRemaining = debts.reduce((sum, d) => sum.plus(d.remaining), new Prisma.Decimal(0));
  const debtPrincipal = debts.reduce((sum, d) => sum.plus(d.principalRemaining), new Prisma.Decimal(0));
  const interest = debtRemaining.minus(debtPrincipal);

  return {
    contributionAmount: contributionAmount.toString(),
    currentRound: currentRound && {
      number: currentRound.number,
      dueDate: dateOnly(currentRound.dueDate),
      remaining: currentRemaining.toString(),
    },
    payout,
    payments: {
      paid: confirmedPaid.toString(),
      expectedSoFar: contributionAmount.times(started.length).toString(),
      expectedTotal: potAmount.toString(),
      roundsPaidInFull: roundRecords.filter((r) => r.status === "paid").length,
      roundsStarted: started.length,
      totalRounds: rounds.length,
      stillToPay: stillToPay.toString(),
      paymentsMade,
      paymentsOnTime,
    },
    interestSettled: (input.interestSettled ?? ZERO).toString(),
    openDisputes: input.openDisputes ?? 0,
    debt: {
      remaining: debtRemaining.toString(),
      interest: (interest.gt(0) ? interest : new Prisma.Decimal(0)).toString(),
      obligationCount: debts.length,
    },
    receivable: receivables
      ? {
          remaining: receivables.reduce((sum, d) => sum.plus(d.remaining), new Prisma.Decimal(0)).toString(),
          obligationCount: receivables.length,
        }
      : null,
    rounds: roundRecords,
  };
}

export type MemberSummary = ReturnType<typeof buildMemberSummary>;

export async function getMemberSummary(group: Group, membership: Membership): Promise<MemberSummary> {
  if (group.status === GroupStatus.forming) {
    throw new MemberSummaryError(409, "Your summary is available once the cycle starts");
  }

  const [rounds, contributions, obligations, openDisputes, roundContext] = await Promise.all([
    prisma.round.findMany({
      where: { groupId: group.id },
      select: { number: true, dueDate: true, status: true, closedAt: true, recipientMembershipId: true },
    }),
    prisma.contribution.findMany({
      where: { membershipId: membership.id },
      select: {
        status: true,
        amount: true,
        reportedAt: true,
        confirmedAt: true,
        round: { select: { number: true } },
      },
    }),
    prisma.obligation.findMany({
      where: membership.isManager
        ? { sourceRound: { groupId: group.id } }
        : { debtorMembershipId: membership.id },
      select: {
        status: true,
        amount: true,
        settledAmount: true,
        interestSettledAmount: true,
        sourceRound: { select: { number: true } },
      },
    }),
    prisma.dispute.count({
      where: { status: DisputeStatus.open, contribution: { membershipId: membership.id } },
    }),
    getGroupInterestRoundContext(prisma, group.id),
  ]);

  const terms = toShortfallInterestTerms(group);
  const interestSettled = obligations.reduce((sum, o) => sum.plus(o.interestSettledAmount), ZERO);
  const debts = obligations
    .filter((o) => o.status !== ObligationStatus.settled)
    .map((o) => ({
      remaining: getObligationTotalRemaining(o, terms, {
        sourceRoundNumber: o.sourceRound.number,
        ...roundContext,
      }),
      principalRemaining: getRemainingPrincipal(o.amount, o.settledAmount),
    }))
    .filter((d) => d.remaining.gt(0));

  return buildMemberSummary({
    membershipId: membership.id,
    contributionAmount: group.contributionAmount,
    rounds,
    contributions: contributions.map((c) => ({
      roundNumber: c.round.number,
      status: c.status,
      amount: c.amount,
      paidAt: c.reportedAt ?? c.confirmedAt,
    })),
    debts: membership.isManager ? [] : debts,
    receivables: membership.isManager ? debts : null,
    interestSettled,
    openDisputes,
  });
}
