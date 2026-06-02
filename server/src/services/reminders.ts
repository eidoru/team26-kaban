import { ContributionStatus, GroupStatus, ObligationStatus, RoundStatus } from "@prisma/client";
import { createNotification } from "../lib/audit.js";
import { prisma } from "../lib/prisma.js";
import { getGroupInterestRoundContexts, getObligationTotalRemaining, toShortfallInterestTerms } from "./shortfallInterest.js";
import { startOfUtcDay } from "./schedule.js";

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

async function notifyOnce(params: {
  userId: string;
  groupId: string;
  type: "contribution_due" | "turn_to_receive" | "general";
  title: string;
  body: string;
  link: string;
  dedupeKey: string;
}) {
  const since = startOfUtcDay(new Date());
  const existing = await prisma.notification.findFirst({
    where: {
      userId: params.userId,
      groupId: params.groupId,
      type: params.type,
      title: params.title,
      createdAt: { gte: since },
    },
  });
  if (existing) return false;

  await createNotification({
    userId: params.userId,
    groupId: params.groupId,
    type: params.type,
    title: params.title,
    body: params.body,
    link: params.link,
  });
  return true;
}

export async function sendDueReminders(): Promise<{ sent: number }> {
  const today = startOfUtcDay(new Date());
  const tomorrow = addDays(today, 1);
  let sent = 0;

  const activeGroups = await prisma.group.findMany({
    where: { status: GroupStatus.active },
    select: { id: true, name: true, contributionAmount: true },
  });

  for (const group of activeGroups) {
    const currentRound = await prisma.round.findFirst({
      where: { groupId: group.id, status: RoundStatus.current },
      include: {
        contributions: {
          include: { membership: { select: { userId: true, displayName: true } } },
        },
      },
    });
    if (!currentRound) continue;

    const dueDate = startOfUtcDay(currentRound.dueDate);
    const link = `/groups/${group.id}`;
    const isDueTomorrow = dueDate.getTime() === tomorrow.getTime();
    const isOverdue = dueDate.getTime() < today.getTime();

    if (isDueTomorrow || isOverdue) {
      for (const c of currentRound.contributions) {
        if (c.status === ContributionStatus.confirmed || !c.membership.userId) continue;

        const title = isOverdue
          ? `${group.name}: contribution overdue`
          : `${group.name}: contribution due tomorrow`;
        const body = isOverdue
          ? `Round ${currentRound.number} was due ${currentRound.dueDate.toISOString().slice(0, 10)}. Please report or settle your payment.`
          : `Round ${currentRound.number} is due tomorrow (₱${Number(group.contributionAmount).toLocaleString()}).`;

        if (
          await notifyOnce({
            userId: c.membership.userId!,
            groupId: group.id,
            type: "contribution_due",
            title,
            body,
            link,
            dedupeKey: `${c.id}-${isOverdue ? "overdue" : "due"}`,
          })
        ) {
          sent++;
        }
      }
    }

    const recipient = await prisma.membership.findUnique({
      where: { id: currentRound.recipientMembershipId },
      select: { userId: true, displayName: true },
    });
    if (recipient?.userId && isDueTomorrow) {
      if (
        await notifyOnce({
          userId: recipient.userId,
          groupId: group.id,
          type: "turn_to_receive",
          title: `${group.name}: your payout round`,
          body: `Round ${currentRound.number} closes tomorrow — you are scheduled to receive the pot.`,
          link,
          dedupeKey: `turn-${currentRound.id}`,
        })
      ) {
        sent++;
      }
    }
  }

  const openObligations = await prisma.obligation.findMany({
    where: {
      status: { in: [ObligationStatus.unsettled, ObligationStatus.partially_settled] },
      debtorMembership: { userId: { not: null } },
    },
    include: {
      debtorMembership: { select: { userId: true, displayName: true } },
      sourceRound: {
        include: {
          group: {
            select: {
              id: true,
              name: true,
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
    [...new Set(openObligations.map((o) => o.sourceRound.group.id))],
  );

  for (const o of openObligations) {
    const userId = o.debtorMembership.userId!;
    const group = o.sourceRound.group;
    const terms = toShortfallInterestTerms(group);
    const groupRoundContext = roundContextByGroup.get(group.id) ?? {
      lastClosedRoundNumber: 0,
      currentRoundNumber: null,
    };
    const remaining = getObligationTotalRemaining(o, terms, {
      sourceRoundNumber: o.sourceRound.number,
      ...groupRoundContext,
    });
    if (
      await notifyOnce({
        userId,
        groupId: group.id,
        type: "general",
        title: `${group.name}: outstanding debt`,
        body: `You still owe ₱${Number(remaining).toLocaleString()} from round ${o.sourceRound.number}.`,
        link: `/groups/${group.id}`,
        dedupeKey: `obligation-${o.id}`,
      })
    ) {
      sent++;
    }
  }

  return { sent };
}
