import { ContributionStatus, DisputeStatus, GroupStatus, Prisma, SettlementClaimStatus } from "@prisma/client";
import { createNotification, writeAuditLog } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { GroupError } from "./groups.js";

export class DisputeError extends GroupError {}

/** Disputes in a group, whether about a round payment or a rejected settlement claim. */
export function disputesInGroup(groupId: string): Prisma.DisputeWhereInput {
  return {
    OR: [{ contribution: { round: { groupId } } }, { settlementClaim: { debtorMembership: { groupId } } }],
  };
}

/** Disputes about one member's payments or settlement claims. */
export function disputesAboutMember(membershipId: string): Prisma.DisputeWhereInput {
  return {
    OR: [{ contribution: { membershipId } }, { settlementClaim: { debtorMembershipId: membershipId } }],
  };
}

/** A member may dispute their own rejected settlement claim once, while no dispute on it is open. */
export function canDisputeSettlementClaim(opts: {
  isManager: boolean;
  viewerMembershipId: string;
  claimMembershipId: string;
  claimStatus: string;
  hasOpenDispute: boolean;
}): boolean {
  return (
    !opts.isManager &&
    opts.viewerMembershipId === opts.claimMembershipId &&
    opts.claimStatus === SettlementClaimStatus.rejected &&
    !opts.hasOpenDispute
  );
}

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
  contributionId: string | null;
  settlementClaimId?: string | null;
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
    settlementClaimId: d.settlementClaimId ?? null,
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
    where: disputesInGroup(groupId),
    include: {
      contribution: {
        include: {
          membership: { select: { displayName: true, userId: true } },
          round: { select: { number: true, id: true } },
        },
      },
      settlementClaim: {
        include: { debtorMembership: { select: { displayName: true } } },
      },
      raisedBy: { select: { displayName: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return disputes.map((d) => {
    const claim = d.settlementClaim;
    const contribution = d.contribution;
    return {
      ...serializeDispute(d),
      subject: contribution ? ("payment" as const) : ("settlement_claim" as const),
      raisedByName: d.raisedBy.displayName,
      memberDisplayName: contribution?.membership.displayName ?? claim?.debtorMembership.displayName ?? "",
      memberMembershipId: contribution?.membershipId ?? claim?.debtorMembershipId ?? "",
      roundNumber: contribution?.round.number ?? null,
      contributionStatus: contribution?.status ?? null,
      /** The disputed amount: the round payment, or the rejected claim. */
      contributionAmount: (contribution?.amount ?? claim?.amount ?? 0).toString(),
      claimReviewNote: claim?.reviewNote ?? null,
    };
  });
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
      title: `${group.name}: problem reported`,
      body: `${contribution.membership.displayName} reported a problem with their round ${contribution.round.number} payment.`,
      link: `/groups/${groupId}?tab=issues`,
    });
  }

  return dispute;
}

export async function raiseSettlementClaimDispute(
  groupId: string,
  claimId: string,
  raiserMembershipId: string,
  actorUserId: string,
  input: { note?: string; proofUrl?: string },
) {
  const claim = await prisma.settlementClaim.findUnique({
    where: { id: claimId },
    include: {
      debtorMembership: { include: { group: true } },
      disputes: { where: { status: DisputeStatus.open } },
    },
  });
  if (!claim || claim.debtorMembership.groupId !== groupId) {
    throw new DisputeError(404, "Settlement claim not found");
  }
  if (claim.debtorMembershipId !== raiserMembershipId || claim.debtorMembership.isManager) {
    throw new DisputeError(403, "You can only report a problem with your own payment claim");
  }
  if (claim.status !== SettlementClaimStatus.rejected) {
    throw new DisputeError(409, "Only a rejected payment claim can be disputed");
  }
  if (claim.disputes.length > 0) {
    throw new DisputeError(409, "A problem is already open for this payment claim");
  }

  const dispute = await prisma.dispute.create({
    data: {
      settlementClaimId: claimId,
      raisedById: raiserMembershipId,
      note: input.note ?? null,
      proofUrl: input.proofUrl ?? null,
    },
  });

  const memberName = claim.debtorMembership.displayName;
  await writeAuditLog({
    groupId,
    actorId: actorUserId,
    action: "dispute.raised",
    entityType: "dispute",
    entityId: dispute.id,
    metadata: {
      settlementClaimId: claimId,
      membershipId: claim.debtorMembershipId,
      memberDisplayName: memberName,
      claimAmount: claim.amount.toString(),
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
      title: `${claim.debtorMembership.group.name}: problem reported`,
      body: `${memberName} disagrees with the rejected ₱${Number(claim.amount).toLocaleString()} payment claim.`,
      link: `/groups/${groupId}?tab=issues`,
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
      settlementClaim: {
        include: { debtorMembership: { include: { group: true } } },
      },
      raisedBy: { select: { userId: true, displayName: true } },
    },
  });

  const member = dispute?.contribution?.membership ?? dispute?.settlementClaim?.debtorMembership ?? null;
  const group = dispute?.contribution?.round.group ?? dispute?.settlementClaim?.debtorMembership.group ?? null;
  if (!dispute || !member || !group || group.id !== groupId) {
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

  const roundNumber = dispute.contribution?.round.number;
  await writeAuditLog({
    groupId,
    actorId: actorUserId,
    action: "dispute.resolved",
    entityType: "dispute",
    entityId: dispute.id,
    metadata: {
      contributionId: dispute.contributionId,
      settlementClaimId: dispute.settlementClaimId,
      membershipId: member.id,
      memberDisplayName: member.displayName,
      roundNumber,
      resolution,
    },
  });

  const notifyUserIds = new Set<string>();
  if (dispute.raisedBy.userId) notifyUserIds.add(dispute.raisedBy.userId);
  if (member.userId) notifyUserIds.add(member.userId);
  notifyUserIds.delete(actorUserId);

  for (const userId of notifyUserIds) {
    await createNotification({
      userId,
      groupId,
      type: "dispute_resolved",
      title: `${group.name}: problem resolved`,
      body:
        roundNumber != null
          ? `The problem you reported with your round ${roundNumber} payment was resolved by the organizer.`
          : "The problem you reported with your rejected payment claim was resolved by the organizer.",
      link: `/groups/${groupId}?tab=issues`,
    });
  }

  return updated;
}
