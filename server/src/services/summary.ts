import { ContributionStatus, GroupStatus, ObligationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";
import { getGroupInterestRoundContext, getObligationTotalRemaining, toShortfallInterestTerms } from "./shortfallInterest.js";

export class SummaryError extends GroupError {}

function buildReliabilityText(stats: {
  totalRounds: number;
  confirmedFull: number;
  partial: number;
  missed: number;
  openDisputes: number;
}): string {
  if (stats.totalRounds === 0) return "No rounds recorded yet";

  const parts: string[] = [];
  if (stats.confirmedFull === stats.totalRounds) {
    parts.push(`Paid in full for all ${stats.totalRounds} round${stats.totalRounds === 1 ? "" : "s"}`);
  } else {
    parts.push(
      `${stats.confirmedFull}/${stats.totalRounds} round${stats.totalRounds === 1 ? "" : "s"} paid in full`,
    );
    if (stats.partial > 0) {
      parts.push(`${stats.partial} partial payment${stats.partial === 1 ? "" : "s"}`);
    }
    if (stats.missed > 0) {
      parts.push(`${stats.missed} missed payment${stats.missed === 1 ? "" : "s"}`);
    }
  }
  if (stats.openDisputes > 0) {
    parts.push(`${stats.openDisputes} open dispute${stats.openDisputes === 1 ? "" : "s"}`);
  }
  return parts.join("; ");
}

export async function getMemberReliabilitySummaries(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.status === GroupStatus.forming) return [];

  const [members, contributions, disputes] = await Promise.all([
    prisma.membership.findMany({ where: { groupId } }),
    prisma.contribution.findMany({
      where: { round: { groupId, status: { in: ["current", "closed"] } } },
      include: { round: { select: { number: true } } },
    }),
    prisma.dispute.findMany({
      where: { contribution: { round: { groupId } }, status: "open" },
      include: { contribution: { select: { membershipId: true } } },
    }),
  ]);

  return buildMemberReliabilitySummaries(members, contributions, disputes, group.contributionAmount);
}

type ReliabilityMember = {
  id: string;
  displayName: string;
  userId: string | null;
};

type ReliabilityContribution = {
  membershipId: string;
  status: ContributionStatus;
  amount: Prisma.Decimal;
};

type ReliabilityDispute = {
  contribution: { membershipId: string };
};

export function buildMemberReliabilitySummaries(
  members: ReliabilityMember[],
  contributions: ReliabilityContribution[],
  disputes: ReliabilityDispute[],
  expected: Prisma.Decimal,
) {
  return members.map((member) => {
    const memberContribs = contributions.filter((c) => c.membershipId === member.id);
    let confirmedFull = 0;
    let partial = 0;
    let missed = 0;

    for (const c of memberContribs) {
      if (c.status === ContributionStatus.confirmed && c.amount.gte(expected)) {
        confirmedFull++;
      } else if (c.status === ContributionStatus.confirmed && c.amount.lt(expected)) {
        partial++;
      } else if (c.status !== ContributionStatus.confirmed) {
        missed++;
      }
    }

    const openDisputes = disputes.filter(
      (d) => d.contribution.membershipId === member.id,
    ).length;

    const stats = {
      totalRounds: memberContribs.length,
      confirmedFull,
      partial,
      missed,
      openDisputes,
    };

    return {
      membershipId: member.id,
      displayName: member.displayName,
      isPlaceholder: member.userId === null,
      ...stats,
      reliabilitySummary: buildReliabilityText(stats),
    };
  });
}

export async function getCompletionSummary(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new SummaryError(404, "Group not found");
  if (group.status !== GroupStatus.completed) {
    throw new SummaryError(409, "Completion summary is available when the cycle is finished");
  }

  const [rounds, contributions, obligations, disputes, members] = await Promise.all([
    prisma.round.findMany({
      where: { groupId },
      include: { recipientMembership: { select: { displayName: true } } },
      orderBy: { number: "asc" },
    }),
    prisma.contribution.findMany({
      where: { round: { groupId } },
      include: { membership: { select: { displayName: true } } },
    }),
    prisma.obligation.findMany({
      where: { sourceRound: { groupId } },
      include: {
        debtorMembership: { select: { displayName: true } },
        sourceRound: { select: { number: true } },
      },
    }),
    prisma.dispute.findMany({
      where: { contribution: { round: { groupId } } },
      include: { contribution: { select: { membershipId: true } } },
    }),
    prisma.membership.findMany({ where: { groupId } }),
  ]);

  const expected = group.contributionAmount;
  let totalCollected = new Prisma.Decimal(0);
  let confirmedCount = 0;

  for (const c of contributions) {
    if (c.status === ContributionStatus.confirmed) {
      totalCollected = totalCollected.plus(c.amount);
      confirmedCount++;
    }
  }

  let outstandingDebt = new Prisma.Decimal(0);
  let unsettledCount = 0;
  const terms = toShortfallInterestTerms(group);
  const groupRoundContext = await getGroupInterestRoundContext(prisma, groupId);
  for (const o of obligations) {
    if (o.status !== ObligationStatus.settled) {
      unsettledCount++;
      outstandingDebt = outstandingDebt.plus(
        getObligationTotalRemaining(o, terms, {
          sourceRoundNumber: o.sourceRound.number,
          ...groupRoundContext,
        }),
      );
    }
  }

  const openDisputesForReliability = disputes.filter((d) => d.status === "open");
  const reliability = buildMemberReliabilitySummaries(
    members,
    contributions,
    openDisputesForReliability,
    expected,
  );

  const roundsCompleted = rounds.length;
  const potPerRound = expected.mul(members.length);
  const totalExpected = potPerRound.mul(roundsCompleted);
  const collectionRate =
    totalExpected.gt(0)
      ? Math.round(totalCollected.div(totalExpected).times(100).toNumber())
      : contributions.length > 0
        ? 100
        : 0;

  const lastClosedAt = rounds[rounds.length - 1]?.closedAt ?? null;
  let cycleDurationDays: number | null = null;
  if (group.startDate && lastClosedAt) {
    const start = group.startDate.getTime();
    const end = lastClosedAt.getTime();
    cycleDurationDays = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
  }

  return {
    groupName: group.name,
    completedAt: lastClosedAt?.toISOString() ?? null,
    startDate: group.startDate?.toISOString().slice(0, 10) ?? null,
    contributionAmount: expected.toString(),
    frequency: group.frequency,
    frequencyDays: group.frequencyDays,
    shortfallInterestRatePercent: group.shortfallInterestRatePercent.toString(),
    memberCount: members.length,
    roundsCompleted,
    totalContributions: contributions.length,
    confirmedContributions: confirmedCount,
    collectionRate,
    potPerRound: potPerRound.toString(),
    totalExpected: totalExpected.toString(),
    totalCollected: totalCollected.toString(),
    cycleDurationDays,
    openDisputes: disputes.filter((d) => d.status === "open").length,
    resolvedDisputes: disputes.filter((d) => d.status === "resolved").length,
    unsettledObligations: unsettledCount,
    outstandingDebt: outstandingDebt.toString(),
    payoutRecipients: rounds.map((r) => ({
      roundNumber: r.number,
      recipientName: r.recipientMembership.displayName,
      dueDate: r.dueDate.toISOString().slice(0, 10),
      potAmount: potPerRound.toString(),
    })),
    memberReliability: reliability,
  };
}
