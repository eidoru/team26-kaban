import { ContributionSource, GroupStatus, ObligationStatus, Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";
import {
  countInterestPeriods,
  getGroupInterestRoundContext,
  getNetAccruedInterest,
  getObligationTotalRemaining,
  getRemainingPrincipal,
  splitSettlementPayment,
  toShortfallInterestTerms,
  type ObligationInterestContext,
  type ShortfallInterestTerms,
} from "./shortfallInterest.js";

type Tx = Prisma.TransactionClient;

export class ObligationError extends GroupError {}

function decimal(value: Prisma.Decimal | number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function obligationStatus(
  amount: Prisma.Decimal,
  settledAmount: Prisma.Decimal,
): ObligationStatus {
  return obligationStatusFromAmounts(amount, settledAmount);
}

/** Exported for unit tests and FIFO status updates. */
export function obligationStatusFromAmounts(
  amount: Prisma.Decimal,
  settledAmount: Prisma.Decimal,
): ObligationStatus {
  if (settledAmount.gte(amount)) return ObligationStatus.settled;
  if (settledAmount.gt(0)) return ObligationStatus.partially_settled;
  return ObligationStatus.unsettled;
}

export function obligationStatusFromRemaining(
  settledAmount: Prisma.Decimal,
  interestSettledAmount: Prisma.Decimal,
  totalRemaining: Prisma.Decimal,
): ObligationStatus {
  if (totalRemaining.lte(0)) return ObligationStatus.settled;
  if (settledAmount.gt(0) || interestSettledAmount.gt(0)) {
    return ObligationStatus.partially_settled;
  }
  return ObligationStatus.unsettled;
}

/** How much of a contribution counts toward the round when computing shortfall. */
export function getPaidAmount(
  status: string,
  amount: Prisma.Decimal,
): Prisma.Decimal {
  return status === "confirmed" ? amount : decimal(0);
}

export function getShortfall(
  expected: Prisma.Decimal,
  status: string,
  amount: Prisma.Decimal,
): Prisma.Decimal {
  const paid = getPaidAmount(status, amount);
  const shortfall = expected.minus(paid);
  return shortfall.gt(0) ? shortfall : decimal(0);
}

/** Principal owed to the manager when a round closes (unpaid or partial confirmed amount only). */
export function getRoundCloseObligationAmount(
  expected: Prisma.Decimal,
  contribution: {
    status: string;
    amount: Prisma.Decimal;
    source: ContributionSource;
  },
): Prisma.Decimal {
  return getShortfall(expected, contribution.status, contribution.amount);
}

export function serializeObligation(
  o: {
    id: string;
    debtorMembershipId: string;
    sourceRoundId: string;
    amount: Prisma.Decimal;
    settledAmount: Prisma.Decimal;
    interestSettledAmount: Prisma.Decimal;
    status: ObligationStatus;
    externalCoverageNote: string | null;
    createdAt: Date;
  },
  terms?: ShortfallInterestTerms,
  interestContext?: ObligationInterestContext,
) {
  const principalRemaining = getRemainingPrincipal(o.amount, o.settledAmount);
  const periods =
    interestContext != null
      ? countInterestPeriods(interestContext.sourceRoundNumber, interestContext)
      : 0;
  const accruedInterest =
    terms != null && interestContext != null
      ? getNetAccruedInterest(principalRemaining, terms, periods, o.interestSettledAmount)
      : decimal(0);
  const totalRemaining =
    terms != null && interestContext != null
      ? getObligationTotalRemaining(o, terms, interestContext)
      : principalRemaining;

  return {
    id: o.id,
    debtorMembershipId: o.debtorMembershipId,
    sourceRoundId: o.sourceRoundId,
    amount: o.amount.toString(),
    settledAmount: o.settledAmount.toString(),
    interestSettledAmount: o.interestSettledAmount.toString(),
    principalRemaining: principalRemaining.toString(),
    accruedInterest: accruedInterest.toString(),
    remaining: totalRemaining.gt(0) ? totalRemaining.toString() : "0",
    status: o.status,
    externalCoverageNote: o.externalCoverageNote,
    createdAt: o.createdAt.toISOString(),
  };
}

/** Create obligations for unpaid / partially paid contributions when a round closes. */
export async function processRoundShortfall(
  tx: Tx,
  round: {
    id: string;
    number: number;
    groupId: string;
    group: {
      name: string;
      contributionAmount: Prisma.Decimal;
      shortfallInterestRatePercent: Prisma.Decimal;
      frequency: import("@prisma/client").GroupFrequency;
      frequencyDays: number | null;
    };
    contributions: {
      membershipId: string;
      status: string;
      amount: Prisma.Decimal;
      source: ContributionSource;
      membership: { displayName: string; userId: string | null; isManager: boolean };
    }[];
  },
  actorId?: string,
) {
  const expected = round.group.contributionAmount;
  let created = 0;
  let totalShortfall = decimal(0);
  const debtorNotifications: { userId: string; amount: string }[] = [];

  const existingDebtors = new Set(
    (
      await tx.obligation.findMany({
        where: { sourceRoundId: round.id },
        select: { debtorMembershipId: true },
      })
    ).map((o) => o.debtorMembershipId),
  );

  const pendingCreates: {
    contribution: (typeof round.contributions)[number];
    owed: Prisma.Decimal;
  }[] = [];

  for (const contribution of round.contributions) {
    if (contribution.membership.isManager) continue; // manager cannot owe themselves
    const owed = getRoundCloseObligationAmount(expected, contribution);
    if (owed.lte(0)) continue;
    if (existingDebtors.has(contribution.membershipId)) continue;
    pendingCreates.push({ contribution, owed });
  }

  const results = await Promise.all(
    pendingCreates.map(async ({ contribution, owed }) => {
      const obligation = await tx.obligation.create({
        data: {
          debtorMembershipId: contribution.membershipId,
          sourceRoundId: round.id,
          amount: owed,
        },
      });

      await tx.auditLog.create({
        data: {
          groupId: round.groupId,
          actorId: actorId ?? null,
          action: "obligation.created",
          entityType: "obligation",
          entityId: obligation.id,
          metadata: {
            roundNumber: round.number,
            membershipId: contribution.membershipId,
            memberDisplayName: contribution.membership.displayName,
            shortfall: owed.toString(),
            contributionStatus: contribution.status,
            contributionSource: contribution.source,
            managerRecorded: contribution.source === ContributionSource.organizer,
          },
        },
      });

      return { contribution, owed };
    }),
  );

  created = results.length;
  totalShortfall = results.reduce((sum, { owed }) => sum.plus(owed), decimal(0));
  for (const { contribution, owed } of results) {
    if (contribution.membership.userId) {
      debtorNotifications.push({
        userId: contribution.membership.userId,
        amount: owed.toString(),
      });
    }
  }

  const notifications: RoundShortfallNotifications | null =
    created > 0
      ? {
          groupId: round.groupId,
          groupName: round.group.name,
          roundNumber: round.number,
          created,
          totalShortfall: totalShortfall.toString(),
          shortfallInterestRatePercent: round.group.shortfallInterestRatePercent.toString(),
          frequency: round.group.frequency,
          frequencyDays: round.group.frequencyDays,
          debtors: debtorNotifications,
        }
      : null;

  return { created, totalShortfall: totalShortfall.toString(), notifications };
}

export type RoundShortfallNotifications = {
  groupId: string;
  groupName: string;
  roundNumber: number;
  created: number;
  totalShortfall: string;
  shortfallInterestRatePercent: string;
  frequency: string;
  frequencyDays: number | null;
  debtors: { userId: string; amount: string }[];
};

export async function notifyRoundShortfalls(payload: RoundShortfallNotifications) {
  const manager = await prisma.membership.findFirst({
    where: { groupId: payload.groupId, isManager: true, userId: { not: null } },
    select: { userId: true },
  });

  const notifications: {
    userId: string;
    groupId: string;
    type: "general";
    title: string;
    body: string;
    link: string;
  }[] = [];

  if (manager?.userId) {
    notifications.push({
      userId: manager.userId,
      groupId: payload.groupId,
      type: "general",
      title: `${payload.groupName}: round ${payload.roundNumber} shortfalls recorded`,
      body: `${payload.created} member${payload.created === 1 ? "" : "s"} owe a total of ₱${Number(payload.totalShortfall).toLocaleString()} from this round.`,
      link: `/groups/${payload.groupId}`,
    });
  }

  const rate = Number(payload.shortfallInterestRatePercent);
  const interestNote =
    rate > 0 ? ` Interest of ${rate}% per round period applies until paid.` : "";

  for (const debtor of payload.debtors) {
    notifications.push({
      userId: debtor.userId,
      groupId: payload.groupId,
      type: "general",
      title: `${payload.groupName}: payment shortfall recorded`,
      body: `You owe ₱${Number(debtor.amount).toLocaleString()} to the organizer for round ${payload.roundNumber}.${interestNote}`,
      link: `/groups/${payload.groupId}`,
    });
  }

  if (notifications.length > 0) {
    await prisma.notification.createMany({ data: notifications });
  }
}

/** Apply a payment to a member's obligations oldest-first (FIFO). */
export async function applyFifoSettlement(
  tx: Tx,
  groupId: string,
  debtorMembershipId: string,
  paymentAmount: Prisma.Decimal,
  actorId: string,
  note?: string,
) {
  if (paymentAmount.lte(0)) {
    throw new ObligationError(400, "Settlement amount must be positive");
  }

  const group = await tx.group.findUnique({
    where: { id: groupId },
    select: {
      shortfallInterestRatePercent: true,
      frequency: true,
      frequencyDays: true,
    },
  });
  if (!group) throw new ObligationError(404, "Group not found");
  const terms = toShortfallInterestTerms(group);
  const groupRoundContext = await getGroupInterestRoundContext(tx, groupId);

  const obligations = await tx.obligation.findMany({
    where: {
      debtorMembershipId,
      status: { not: ObligationStatus.settled },
      sourceRound: { groupId },
    },
    include: { sourceRound: { select: { number: true } } },
    orderBy: { createdAt: "asc" },
  });

  let remaining = paymentAmount;
  const applied: { obligationId: string; amount: string; roundNumber: number }[] = [];

  for (const obligation of obligations) {
    if (remaining.lte(0)) break;

    const principalRemaining = getRemainingPrincipal(obligation.amount, obligation.settledAmount);
    const interestContext = {
      sourceRoundNumber: obligation.sourceRound.number,
      ...groupRoundContext,
    };
    const periods = countInterestPeriods(obligation.sourceRound.number, groupRoundContext);
    const interestDue = getNetAccruedInterest(
      principalRemaining,
      terms,
      periods,
      obligation.interestSettledAmount,
    );
    const totalDue = principalRemaining.plus(interestDue);
    if (totalDue.lte(0)) continue;

    const slice = remaining.lte(totalDue) ? remaining : totalDue;
    const { interestPaid, principalPaid } = splitSettlementPayment(slice, principalRemaining, interestDue);
    const newSettled = obligation.settledAmount.plus(principalPaid);
    const newInterestSettled = obligation.interestSettledAmount.plus(interestPaid);
    const updatedForTotal = {
      amount: obligation.amount,
      settledAmount: newSettled,
      interestSettledAmount: newInterestSettled,
    };
    const totalRemaining = getObligationTotalRemaining(updatedForTotal, terms, interestContext);
    const newStatus = obligationStatusFromRemaining(newSettled, newInterestSettled, totalRemaining);

    await tx.settlement.create({
      data: {
        obligationId: obligation.id,
        amount: slice,
        note: note ?? null,
      },
    });

    await tx.obligation.update({
      where: { id: obligation.id },
      data: {
        settledAmount: newSettled,
        interestSettledAmount: newInterestSettled,
        status: newStatus,
      },
    });

    applied.push({
      obligationId: obligation.id,
      amount: slice.toString(),
      roundNumber: obligation.sourceRound.number,
    });

    remaining = remaining.minus(slice);
  }

  if (applied.length > 0) {
    await tx.auditLog.create({
      data: {
        groupId,
        actorId,
        action: "obligation.settled",
        entityType: "obligation",
        entityId: applied[0].obligationId,
        metadata: {
          debtorMembershipId,
          totalApplied: paymentAmount.minus(remaining).toString(),
          slices: applied,
          note,
        },
      },
    });
  }

  return {
    applied: paymentAmount.minus(remaining).toString(),
    unapplied: remaining.toString(),
    slices: applied,
  };
}

export async function settleMemberDebts(
  groupId: string,
  debtorMembershipId: string,
  actorId: string,
  amount: number,
  note?: string,
) {
  const member = await prisma.membership.findFirst({
    where: { id: debtorMembershipId, groupId },
  });
  if (!member) throw new ObligationError(404, "Member not found");

  return prisma.$transaction(async (tx) =>
    applyFifoSettlement(tx, groupId, debtorMembershipId, decimal(amount), actorId, note),
  );
}

/** Manager records that they fronted the round pot for a member's shortfall; debt remains until settled. */
export async function coverObligationExternally(
  groupId: string,
  obligationId: string,
  actorId: string,
  note: string,
) {
  const obligation = await prisma.obligation.findFirst({
    where: { id: obligationId, sourceRound: { groupId } },
    include: {
      debtorMembership: { select: { displayName: true } },
      sourceRound: { select: { number: true, group: true } },
    },
  });
  if (!obligation) throw new ObligationError(404, "Obligation not found");
  if (obligation.status === ObligationStatus.settled) {
    throw new ObligationError(409, "This obligation is already settled");
  }

  const group = obligation.sourceRound.group;
  const terms = toShortfallInterestTerms(group);
  const groupRoundContext = await getGroupInterestRoundContext(prisma, groupId);
  const principalRemaining = getRemainingPrincipal(obligation.amount, obligation.settledAmount);
  const periods = countInterestPeriods(obligation.sourceRound.number, groupRoundContext);
  const accruedInterest = getNetAccruedInterest(
    principalRemaining,
    terms,
    periods,
    obligation.interestSettledAmount,
  );

  const trimmedNote = note.trim();
  if (!trimmedNote) throw new ObligationError(400, "A note is required when covering externally");

  const coverageNote = obligation.externalCoverageNote
    ? `${obligation.externalCoverageNote}\n${trimmedNote}`
    : trimmedNote;

  await prisma.$transaction(async (tx) => {
    await tx.obligation.update({
      where: { id: obligationId },
      data: { externalCoverageNote: coverageNote },
    });

    await tx.auditLog.create({
      data: {
        groupId,
        actorId,
        action: "obligation.covered_externally",
        entityType: "obligation",
        entityId: obligationId,
        metadata: {
          roundNumber: obligation.sourceRound.number,
          memberDisplayName: obligation.debtorMembership.displayName,
          principalRemaining: principalRemaining.toString(),
          accruedInterest: accruedInterest.toString(),
          note: trimmedNote,
        },
      },
    });
  });

  return { obligationId, externalCoverageNote: coverageNote };
}

export async function getGroupObligations(groupId: string) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group || group.status === GroupStatus.forming) {
    throw new ObligationError(404, "Group has not started yet");
  }

  const obligations = await prisma.obligation.findMany({
    where: { sourceRound: { groupId } },
    include: {
      debtorMembership: { select: { displayName: true, userId: true } },
      sourceRound: { select: { number: true, dueDate: true } },
      settlements: { orderBy: { createdAt: "asc" } },
    },
    orderBy: [{ createdAt: "asc" }],
  });

  const terms = toShortfallInterestTerms(group);
  const groupRoundContext = await getGroupInterestRoundContext(prisma, groupId);

  return obligations.map((o) => ({
    ...serializeObligation(o, terms, {
      sourceRoundNumber: o.sourceRound.number,
      ...groupRoundContext,
    }),
    displayName: o.debtorMembership.displayName,
    isPlaceholder: o.debtorMembership.userId === null,
    roundNumber: o.sourceRound.number,
    roundDueDate: o.sourceRound.dueDate.toISOString().slice(0, 10),
    settlements: o.settlements.map((s) => ({
      id: s.id,
      amount: s.amount.toString(),
      note: s.note,
      createdAt: s.createdAt.toISOString(),
    })),
  }));
}

export function getExpectedContribution(groupContributionAmount: Prisma.Decimal) {
  return groupContributionAmount;
}
