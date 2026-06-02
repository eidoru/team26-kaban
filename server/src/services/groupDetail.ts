import { Group, Membership, ObligationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { serializeContributionForViewer } from "./contributions.js";
import { canRaiseContributionDispute } from "./disputes.js";
import { serializeGroup, serializeMember } from "./groups.js";
import { serializeRound } from "./schedule.js";

/** Build the group detail payload returned by GET /groups/:id. */
export async function loadGroupDetailPayload(
  group: Group,
  membership: Membership,
  viewerUserId: string,
) {
  const isManager = membership.isManager;

  const [members, rounds, openDisputeCount, unsettledObligationCount] = await Promise.all([
    prisma.membership.findMany({
      where: { groupId: group.id },
      orderBy: [{ turnNumber: "asc" }, { createdAt: "asc" }],
    }),
    group.status === "forming"
      ? Promise.resolve([])
      : prisma.round.findMany({
          where: { groupId: group.id },
          orderBy: { number: "asc" },
        }),
    group.status === "forming"
      ? Promise.resolve(0)
      : prisma.dispute.count({
          where: {
            status: "open",
            contribution: { round: { groupId: group.id } },
          },
        }),
    group.status === "forming"
      ? Promise.resolve(0)
      : prisma.obligation.count({
          where: {
            sourceRound: { groupId: group.id },
            status: { in: [ObligationStatus.unsettled, ObligationStatus.partially_settled] },
          },
        }),
  ]);

  const filledCount = members.length;
  const needsPayoutOrder = members.some((m) => m.turnNumber === null);
  const unclaimedSeats = members.filter((m) => m.userId === null).length;
  const openSlots = Math.max(0, group.slotCount - filledCount);
  const memberById = new Map(members.map((m) => [m.id, m]));

  let currentRound = null;
  let schedule: ReturnType<typeof serializeRound>[] = [];

  if (rounds.length > 0) {
    schedule = rounds.map((r) => ({
      ...serializeRound(r),
      recipientName: memberById.get(r.recipientMembershipId)?.displayName ?? "Unknown",
    }));

    const current = rounds.find((r) => r.status === "current");
    if (current) {
      const [contributions, openDisputes] = await Promise.all([
        prisma.contribution.findMany({ where: { roundId: current.id } }),
        prisma.dispute.findMany({
          where: {
            status: "open",
            contribution: { roundId: current.id },
          },
          select: { contributionId: true },
        }),
      ]);
      const openDisputeIds = new Set(openDisputes.map((d) => d.contributionId));
      const canRaiseDispute = group.status !== "forming";
      currentRound = {
        ...serializeRound(current),
        recipientName: memberById.get(current.recipientMembershipId)?.displayName ?? "Unknown",
        contributions: contributions.map((c) => {
          const member = memberById.get(c.membershipId)!;
          const base = serializeContributionForViewer(
            c,
            member,
            viewerUserId,
            isManager,
            group.contributionAmount,
          );
          const canDispute = canRaiseContributionDispute({
            groupStarted: canRaiseDispute,
            isManager,
            viewerMembershipId: membership.id,
            contributionMembershipId: c.membershipId,
            contributionStatus: c.status,
            hasOpenDispute: openDisputeIds.has(c.id),
          });
          return { ...base, canDispute };
        }),
      };
    }
  }

  return {
    group: serializeGroup(group, filledCount, isManager ? "manager" : "member"),
    members: members.map(serializeMember),
    pending: {
      payoutOrder: needsPayoutOrder,
      startDateMissing: !group.startDate,
      openSlots,
      unclaimedSeats,
      cycleStarted: group.status !== "forming",
      canActivate:
        group.status === "forming" &&
        openSlots === 0 &&
        !needsPayoutOrder &&
        !!group.startDate,
    },
    currentRound,
    schedule,
    issueCounts: {
      openDisputes: openDisputeCount,
      unsettledObligations: unsettledObligationCount,
    },
  };
}
