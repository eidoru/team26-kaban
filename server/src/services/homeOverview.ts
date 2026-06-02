import { ContributionStatus, GroupStatus, RoundStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getManagerObligationsOverview } from "./dashboard.js";
import { countFilledSlotsByGroupIds, serializeGroup } from "./groups.js";
import { countUnreadNotifications, listUserNotifications } from "./notifications.js";
import { startOfUtcDay } from "./schedule.js";

export type AttentionKind =
  | "forming_ready"
  | "forming_slots"
  | "confirm_payments"
  | "payment_due"
  | "owed_outstanding";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  body: string;
  link: string;
  priority: "high" | "normal";
}

const ATTENTION_CAP = 5;

interface FormingGroupDetail {
  groupId: string;
  groupName: string;
  openSlots: number;
  canActivate: boolean;
}

interface DueContribution {
  contributionId: string;
  groupId: string;
  groupName: string;
  roundNumber: number;
  dueDate: string;
  isOverdue: boolean;
}

async function getFormingGroupDetails(
  memberships: Array<{
    groupId: string;
    isManager: boolean;
    group: {
      id: string;
      name: string;
      status: string;
      slotCount: number;
      startDate: Date | null;
    };
  }>,
  filledCounts: Map<string, number>,
): Promise<FormingGroupDetail[]> {
  const formingManaged = memberships.filter(
    (m) => m.isManager && m.group.status === GroupStatus.forming,
  );
  if (formingManaged.length === 0) return [];

  const groupIds = formingManaged.map((m) => m.groupId);
  const allMembers = await prisma.membership.findMany({
    where: { groupId: { in: groupIds } },
    select: { groupId: true, turnNumber: true },
  });

  const membersByGroup = new Map<string, { turnNumber: number | null }[]>();
  for (const member of allMembers) {
    const list = membersByGroup.get(member.groupId) ?? [];
    list.push(member);
    membersByGroup.set(member.groupId, list);
  }

  return formingManaged.map((m) => {
    const filled = filledCounts.get(m.groupId) ?? 0;
    const openSlots = Math.max(0, m.group.slotCount - filled);
    const members = membersByGroup.get(m.groupId) ?? [];
    const needsPayoutOrder = members.some((mem) => mem.turnNumber === null);
    const canActivate = openSlots === 0 && !needsPayoutOrder && !!m.group.startDate;

    return {
      groupId: m.group.id,
      groupName: m.group.name,
      openSlots,
      canActivate,
    };
  });
}

async function countPendingConfirmations(managerUserId: string): Promise<number> {
  return prisma.contribution.count({
    where: {
      status: ContributionStatus.reported,
      round: {
        status: RoundStatus.current,
        group: {
          managerId: managerUserId,
          status: GroupStatus.active,
        },
      },
    },
  });
}

async function getFirstGroupWithPendingConfirmations(
  managerUserId: string,
): Promise<{ groupId: string; groupName: string } | null> {
  const row = await prisma.contribution.findFirst({
    where: {
      status: ContributionStatus.reported,
      round: {
        status: RoundStatus.current,
        group: {
          managerId: managerUserId,
          status: GroupStatus.active,
        },
      },
    },
    select: {
      round: {
        select: {
          group: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { reportedAt: "asc" },
  });

  if (!row) return null;
  return {
    groupId: row.round.group.id,
    groupName: row.round.group.name,
  };
}

async function getMemberDueContributions(userId: string): Promise<DueContribution[]> {
  const today = startOfUtcDay(new Date());

  const rows = await prisma.contribution.findMany({
    where: {
      status: { in: [ContributionStatus.pending, ContributionStatus.reported] },
      membership: { userId },
      round: {
        status: RoundStatus.current,
        group: { status: GroupStatus.active },
      },
    },
    include: {
      round: { select: { dueDate: true, number: true, groupId: true } },
      membership: {
        include: {
          group: { select: { name: true } },
        },
      },
    },
    orderBy: { round: { dueDate: "asc" } },
  });

  return rows.map((r) => ({
    contributionId: r.id,
    groupId: r.round.groupId,
    groupName: r.membership.group.name,
    roundNumber: r.round.number,
    dueDate: r.round.dueDate.toISOString().slice(0, 10),
    isOverdue: startOfUtcDay(r.round.dueDate).getTime() < today.getTime(),
  }));
}

function buildAttentionItems(params: {
  formingDetails: FormingGroupDetail[];
  pendingConfirmations: number;
  confirmGroup: { groupId: string; groupName: string } | null;
  dueContributions: DueContribution[];
  totalOwed: string | null;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  for (const forming of params.formingDetails) {
    if (forming.canActivate) {
      items.push({
        id: `forming-ready-${forming.groupId}`,
        kind: "forming_ready",
        title: `${forming.groupName} is ready to activate`,
        body: "All slots are filled and setup is complete. Start the paluwagan when ready.",
        link: `/groups/${forming.groupId}`,
        priority: "normal",
      });
    } else if (forming.openSlots > 0) {
      items.push({
        id: `forming-slots-${forming.groupId}`,
        kind: "forming_slots",
        title: `${forming.groupName} needs members`,
        body: `${forming.openSlots} open slot${forming.openSlots === 1 ? "" : "s"} remaining before activation.`,
        link: `/groups/${forming.groupId}`,
        priority: "normal",
      });
    }
  }

  if (params.pendingConfirmations > 0) {
    const linkGroup = params.confirmGroup;
    items.push({
      id: "confirm-payments",
      kind: "confirm_payments",
      title: "Payments need confirmation",
      body: `${params.pendingConfirmations} reported payment${params.pendingConfirmations === 1 ? "" : "s"} await your review${linkGroup ? ` in ${linkGroup.groupName}` : ""}.`,
      link: linkGroup ? `/groups/${linkGroup.groupId}` : "/home",
      priority: "high",
    });
  }

  for (const due of params.dueContributions) {
    items.push({
      id: `payment-due-${due.contributionId}`,
      kind: "payment_due",
      title: due.isOverdue
        ? `Overdue payment in ${due.groupName}`
        : `Payment due in ${due.groupName}`,
      body: due.isOverdue
        ? `Round ${due.roundNumber} was due ${due.dueDate}. Report or complete your contribution.`
        : `Round ${due.roundNumber} is due ${due.dueDate}.`,
      link: `/groups/${due.groupId}`,
      priority: due.isOverdue ? "high" : "normal",
    });
  }

  if (params.totalOwed) {
    items.push({
      id: "owed-outstanding",
      kind: "owed_outstanding",
      title: "Outstanding shortfall debt",
      body: `₱${Number(params.totalOwed).toLocaleString()} owed across your managed groups.`,
      link: "/manager/obligations",
      priority: "normal",
    });
  }

  const priorityOrder = { high: 0, normal: 1 };
  return items
    .sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])
    .slice(0, ATTENTION_CAP);
}

export async function getHomeOverview(userId: string) {
  const memberships = await prisma.membership.findMany({
    where: { userId },
    include: {
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          contributionAmount: true,
          frequency: true,
          frequencyDays: true,
          slotCount: true,
          startDate: true,
          managerId: true,
          shortfallInterestRatePercent: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const groupIds = memberships.map((m) => m.groupId);
  const filledCounts = await countFilledSlotsByGroupIds(groupIds);

  const groups = memberships.map((m) => ({
    ...serializeGroup(
      m.group,
      filledCounts.get(m.groupId) ?? 0,
      m.isManager ? "manager" : "member",
    ),
    membershipId: m.id,
  }));

  const pendingConfirmationsPromise = countPendingConfirmations(userId);

  const [
    recentActivity,
    unreadNotifications,
    obligationsOverview,
    pendingConfirmations,
    dueContributions,
    formingDetails,
  ] = await Promise.all([
    listUserNotifications(userId, 8),
    countUnreadNotifications(userId),
    getManagerObligationsOverview(userId),
    pendingConfirmationsPromise,
    getMemberDueContributions(userId),
    getFormingGroupDetails(memberships, filledCounts),
  ]);

  const confirmGroup =
    pendingConfirmations > 0 ? await getFirstGroupWithPendingConfirmations(userId) : null;

  const activeGroups = groups.filter((g) => g.status === GroupStatus.active).length;
  const formingGroups = groups.filter((g) => g.status === GroupStatus.forming).length;

  const totalOwed =
    obligationsOverview.totalOutstanding !== "0" &&
    Number.parseFloat(obligationsOverview.totalOutstanding) > 0
      ? obligationsOverview.totalOutstanding
      : null;

  const attention = buildAttentionItems({
    formingDetails,
    pendingConfirmations,
    confirmGroup,
    dueContributions,
    totalOwed,
  });

  return {
    stats: {
      activeGroups,
      formingGroups,
      unreadNotifications,
      totalOwed,
      pendingConfirmations,
      paymentsDue: dueContributions.length,
    },
    attention,
    recentActivity,
    groups,
  };
}
