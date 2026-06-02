import { Contribution, ContributionSource, ContributionStatus, GroupStatus, Prisma } from "@prisma/client";
import { createNotification, writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";

export class ContributionError extends GroupError {}

function decimal(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function resolvePaidAmount(
  expected: Prisma.Decimal,
  amountInput?: number,
): Prisma.Decimal {
  if (amountInput == null) return expected;
  const paid = decimal(amountInput);
  if (paid.lte(0)) {
    throw new ContributionError(400, "Amount must be greater than zero");
  }
  if (paid.gt(expected)) {
    throw new ContributionError(400, "Amount cannot exceed the expected contribution");
  }
  return paid;
}

export function serializeContribution(c: {
  id: string;
  membershipId: string;
  amount: Prisma.Decimal;
  status: ContributionStatus;
  source?: ContributionSource;
  note?: string | null;
  reportedAt?: Date | null;
  confirmedAt?: Date | null;
}) {
  return {
    id: c.id,
    membershipId: c.membershipId,
    amount: c.amount.toString(),
    status: c.status,
    source: c.source,
    note: c.note ?? null,
    reportedAt: c.reportedAt?.toISOString() ?? null,
    confirmedAt: c.confirmedAt?.toISOString() ?? null,
  };
}

async function loadContributionForGroup(groupId: string, contributionId: string) {
  const contribution = await prisma.contribution.findUnique({
    where: { id: contributionId },
    include: {
      membership: true,
      round: { include: { group: true } },
    },
  });

  if (!contribution || contribution.round.groupId !== groupId) {
    throw new ContributionError(404, "Contribution not found");
  }

  return contribution;
}

function assertActiveGroup(status: GroupStatus) {
  if (status !== GroupStatus.active) {
    throw new ContributionError(409, "Contributions can only be updated while the group is active");
  }
}

function assertCurrentRound(roundStatus: string) {
  if (roundStatus !== "current") {
    throw new ContributionError(409, "Contributions can only be updated for the current round");
  }
}

export async function reportContribution(
  groupId: string,
  contributionId: string,
  actorUserId: string,
  input: { note?: string; proofUrl?: string; amount?: number },
) {
  const existing = await loadContributionForGroup(groupId, contributionId);
  assertActiveGroup(existing.round.group.status);
  assertCurrentRound(existing.round.status);

  if (existing.membership.userId !== actorUserId) {
    throw new ContributionError(403, "You can only report your own contribution");
  }
  if (existing.status !== ContributionStatus.pending) {
    throw new ContributionError(409, "This contribution has already been reported or confirmed");
  }

  const expected = existing.round.group.contributionAmount;
  const paidAmount = resolvePaidAmount(expected, input.amount);
  const now = new Date();
  const contribution = await prisma.contribution.update({
    where: { id: existing.id },
    data: {
      amount: paidAmount,
      status: ContributionStatus.reported,
      source: ContributionSource.member,
      note: input.note ?? null,
      proofUrl: input.proofUrl ?? null,
      reportedAt: now,
    },
  });

  await writeAuditLog({
    groupId,
    actorId: actorUserId,
    action: "contribution.reported",
    entityType: "contribution",
    entityId: contribution.id,
    metadata: {
      roundId: existing.roundId,
      membershipId: existing.membershipId,
      roundNumber: existing.round.number,
      memberDisplayName: existing.membership.displayName,
      amount: paidAmount.toString(),
      expectedAmount: expected.toString(),
      partial: paidAmount.lt(expected),
    },
  });

  const managerMembership = await prisma.membership.findFirst({
    where: { groupId, isManager: true, userId: { not: null } },
  });
  if (managerMembership?.userId) {
    await createNotification({
      userId: managerMembership.userId,
      groupId,
      type: "general",
      title: `${existing.round.group.name}: payment reported`,
      body: `${existing.membership.displayName} reported a contribution for round ${existing.round.number}.`,
      link: `/groups/${groupId}`,
    });
  }

  return contribution;
}

export async function confirmContribution(
  groupId: string,
  contributionId: string,
  actorUserId: string,
) {
  const existing = await loadContributionForGroup(groupId, contributionId);
  assertActiveGroup(existing.round.group.status);
  assertCurrentRound(existing.round.status);

  if (existing.status !== ContributionStatus.reported) {
    throw new ContributionError(409, "Only reported contributions can be confirmed");
  }

  const now = new Date();
  const contribution = await prisma.contribution.update({
    where: { id: existing.id },
    data: {
      status: ContributionStatus.confirmed,
      confirmedAt: now,
    },
  });

  await writeAuditLog({
    groupId,
    actorId: actorUserId,
    action: "contribution.confirmed",
    entityType: "contribution",
    entityId: contribution.id,
    metadata: {
      roundId: existing.roundId,
      membershipId: existing.membershipId,
      roundNumber: existing.round.number,
      memberDisplayName: existing.membership.displayName,
      amount: existing.amount.toString(),
      expectedAmount: existing.round.group.contributionAmount.toString(),
      partial: existing.amount.lt(existing.round.group.contributionAmount),
    },
  });

  if (existing.membership.userId) {
    await createNotification({
      userId: existing.membership.userId,
      groupId,
      type: "contribution_confirmed",
      title: `${existing.round.group.name}: payment confirmed`,
      body: `Your contribution for round ${existing.round.number} was confirmed.`,
      link: `/groups/${groupId}`,
    });
  }

  return contribution;
}

/** Manager records payment on behalf of a placeholder (or offline member). */
export async function recordContribution(
  groupId: string,
  contributionId: string,
  actorUserId: string,
  input: { note?: string; amount?: number },
) {
  const existing = await loadContributionForGroup(groupId, contributionId);
  assertActiveGroup(existing.round.group.status);
  assertCurrentRound(existing.round.status);

  if (existing.status !== ContributionStatus.pending) {
    throw new ContributionError(409, "This contribution is no longer pending");
  }

  const expected = existing.round.group.contributionAmount;
  const paidAmount = resolvePaidAmount(expected, input.amount);
  const now = new Date();
  const contribution = await prisma.contribution.update({
    where: { id: existing.id },
    data: {
      amount: paidAmount,
      status: ContributionStatus.confirmed,
      source: ContributionSource.organizer,
      note: input.note ?? null,
      reportedAt: now,
      confirmedAt: now,
    },
  });

  await writeAuditLog({
    groupId,
    actorId: actorUserId,
    action: "contribution.recorded",
    entityType: "contribution",
    entityId: contribution.id,
    metadata: {
      roundId: existing.roundId,
      membershipId: existing.membershipId,
      roundNumber: existing.round.number,
      memberDisplayName: existing.membership.displayName,
      amount: paidAmount.toString(),
      expectedAmount: expected.toString(),
      partial: paidAmount.lt(expected),
      placeholder: existing.membership.userId === null,
    },
  });

  return contribution;
}

export async function getGroupLedger(groupId: string) {
  const contributions = await prisma.contribution.findMany({
    where: { round: { groupId } },
    include: {
      membership: { select: { displayName: true, userId: true, isManager: true } },
      round: { select: { number: true, status: true, dueDate: true } },
    },
    orderBy: [{ round: { number: "asc" } }, { membership: { displayName: "asc" } }],
  });

  return contributions.map((c) => ({
    ...serializeContribution(c),
    displayName: c.membership.displayName,
    isPlaceholder: c.membership.userId === null,
    roundNumber: c.round.number,
    roundStatus: c.round.status,
    roundDueDate: c.round.dueDate.toISOString().slice(0, 10),
  }));
}

export function contributionActions(
  c: Contribution,
  membership: { userId: string | null },
  viewerUserId: string,
  isManager: boolean,
) {
  const isOwn = membership.userId === viewerUserId;
  return {
    canReport: c.status === "pending" && isOwn,
    canConfirm: isManager && c.status === "reported",
    canRecord: isManager && c.status === "pending" && membership.userId === null,
  };
}

export function serializeContributionForViewer(
  c: Contribution,
  membership: { displayName: string; userId: string | null },
  viewerUserId: string,
  isManager: boolean,
  expectedAmount: Prisma.Decimal,
) {
  const expected = expectedAmount.toString();
  const isPartial = c.status === "confirmed" && c.amount.lt(expectedAmount);
  return {
    ...serializeContribution(c),
    displayName: membership.displayName,
    isPlaceholder: membership.userId === null,
    expectedAmount: expected,
    isPartial,
    ...contributionActions(c, membership, viewerUserId, isManager),
  };
}
