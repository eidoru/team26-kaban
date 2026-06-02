import { ContributionStatus, DisputeStatus, GroupStatus } from "@prisma/client";
import { createNotification, writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";

export class DisputeError extends GroupError {}

export function canRaiseContributionDispute(opts: {
  groupStarted: boolean;
  isManager: boolean;
  viewerMembershipId: string;
  contributionMembershipId: string;
  contributionStatus: string;
  hasOpenDispute: boolean;
}): boolean {
  if (!opts.groupStarted) return false;
  if (opts.isManager) return false;
  if (opts.viewerMembershipId !== opts.contributionMembershipId) return false;
  if (opts.hasOpenDispute) return false;
  if (
    opts.contributionStatus !== ContributionStatus.reported &&
    opts.contributionStatus !== ContributionStatus.confirmed
  ) {
    return false;
  }
  return true;
}

export function serializeDispute(d: {
  id: string;
  contributionId: string;
  raisedById: string;
  status: DisputeStatus;
  note: string | null;
  proofUrl: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: d.id,
    contributionId: d.contributionId,
    raisedById: d.raisedById,
    status: d.status,
    note: d.note,
    proofUrl: d.proofUrl,
    resolution: d.resolution,
    resolvedAt: d.resolvedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
  };
}

export async function getGroupDisputes(groupId: string) {
  const disputes = await prisma.dispute.findMany({
    where: { contribution: { round: { groupId } } },
    include: {
      contribution: {
        include: {
          membership: { select: { displayName: true, userId: true } },
          round: { select: { number: true, id: true } },
        },
      },
      raisedBy: { select: { displayName: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return disputes.map((d) => ({
    ...serializeDispute(d),
    raisedByName: d.raisedBy.displayName,
    memberDisplayName: d.contribution.membership.displayName,
    roundNumber: d.contribution.round.number,
    contributionStatus: d.contribution.status,
    contributionAmount: d.contribution.amount.toString(),
  }));
}

export async function raiseDispute(
  groupId: string,
  contributionId: string,
  raiserMembershipId: string,
  actorUserId: string,
  input: { note?: string; proofUrl?: string },
) {
  const contribution = await prisma.contribution.findUnique({
    where: { id: contributionId },
    include: {
      membership: true,
      round: { include: { group: true } },
      disputes: { where: { status: DisputeStatus.open } },
    },
  });

  if (!contribution || contribution.round.groupId !== groupId) {
    throw new DisputeError(404, "Contribution not found");
  }

  const group = contribution.round.group;
  if (group.status !== GroupStatus.active && group.status !== GroupStatus.completed) {
    throw new DisputeError(409, "Disputes can only be raised after the cycle has started");
  }

  if (
    contribution.status !== ContributionStatus.reported &&
    contribution.status !== ContributionStatus.confirmed
  ) {
    throw new DisputeError(409, "Disputes can only be raised on reported or confirmed contributions");
  }

  if (contribution.disputes.length > 0) {
    throw new DisputeError(409, "An open dispute already exists for this contribution");
  }

  const raiser = await prisma.membership.findFirst({
    where: { id: raiserMembershipId, groupId },
  });
  if (!raiser) {
    throw new DisputeError(404, "Membership not found");
  }
  if (raiser.isManager) {
    throw new DisputeError(403, "Managers cannot raise disputes");
  }
  if (contribution.membershipId !== raiserMembershipId) {
    throw new DisputeError(403, "You can only dispute your own contribution");
  }

  const dispute = await prisma.dispute.create({
    data: {
      contributionId,
      raisedById: raiserMembershipId,
      note: input.note ?? null,
      proofUrl: input.proofUrl ?? null,
    },
  });

  await writeAuditLog({
    groupId,
    actorId: actorUserId,
    action: "dispute.raised",
    entityType: "dispute",
    entityId: dispute.id,
    metadata: {
      contributionId,
      membershipId: contribution.membershipId,
      memberDisplayName: contribution.membership.displayName,
      roundNumber: contribution.round.number,
      note: input.note,
    },
  });

  const managerMembership = await prisma.membership.findFirst({
    where: { groupId, isManager: true, userId: { not: null } },
  });
  if (managerMembership?.userId && managerMembership.userId !== actorUserId) {
    await createNotification({
      userId: managerMembership.userId,
      groupId,
      type: "dispute_raised",
      title: `${group.name}: dispute raised`,
      body: `A payment dispute was raised for round ${contribution.round.number} (${contribution.membership.displayName}).`,
      link: `/groups/${groupId}`,
    });
  }

  return dispute;
}

export async function resolveDispute(
  groupId: string,
  disputeId: string,
  actorUserId: string,
  resolution: string,
) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: disputeId },
    include: {
      contribution: {
        include: {
          membership: true,
          round: { include: { group: true } },
        },
      },
      raisedBy: { select: { userId: true, displayName: true } },
    },
  });

  if (!dispute || dispute.contribution.round.groupId !== groupId) {
    throw new DisputeError(404, "Dispute not found");
  }

  if (dispute.status !== DisputeStatus.open) {
    throw new DisputeError(409, "This dispute is already resolved");
  }

  const now = new Date();
  const updated = await prisma.dispute.update({
    where: { id: disputeId },
    data: {
      status: DisputeStatus.resolved,
      resolution,
      resolvedAt: now,
    },
  });

  await writeAuditLog({
    groupId,
    actorId: actorUserId,
    action: "dispute.resolved",
    entityType: "dispute",
    entityId: dispute.id,
    metadata: {
      contributionId: dispute.contributionId,
      membershipId: dispute.contribution.membershipId,
      memberDisplayName: dispute.contribution.membership.displayName,
      roundNumber: dispute.contribution.round.number,
      resolution,
    },
  });

  const notifyUserIds = new Set<string>();
  if (dispute.raisedBy.userId) notifyUserIds.add(dispute.raisedBy.userId);
  if (dispute.contribution.membership.userId) {
    notifyUserIds.add(dispute.contribution.membership.userId);
  }
  notifyUserIds.delete(actorUserId);

  const groupName = dispute.contribution.round.group.name;
  for (const userId of notifyUserIds) {
    await createNotification({
      userId,
      groupId,
      type: "dispute_resolved",
      title: `${groupName}: dispute resolved`,
      body: `The dispute for round ${dispute.contribution.round.number} was resolved by the manager.`,
      link: `/groups/${groupId}`,
    });
  }

  return updated;
}
