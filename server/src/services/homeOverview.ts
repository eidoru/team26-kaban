import { ContributionStatus, GroupStatus, RoundStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { getManagerTotalOutstanding } from "./dashboard.js";
import { countUnreadNotifications } from "./notifications.js";
import { startOfUtcDay } from "./schedule.js";
import { formatDisplayDate } from "../lib/dates.js";
import { getUserDebts, type GroupDebt } from "./myDebts.js";

export type AttentionKind =
  | "forming_ready"
  | "forming_slots"
  | "confirm_payments"
  | "payment_due"
  | "owed_outstanding"
  | "you_owe"
  | "claims_to_review"
  | "disputes_open";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  title: string;
  body: string;
  link: string;
  priority: "high" | "normal";
}

const ATTENTION_CAP = 6;

type GroupCount = { groupId: string; groupName: string; count: number };

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

type HomeMembership = {
  groupId: string;
  isManager: boolean;
  group: {
    id: string;
    name: string;
    status: string;
    slotCount: number;
    startDate: Date | null;
    _count: { memberships: number };
  };
};

async function getFormingGroupDetails(memberships: HomeMembership[]): Promise<FormingGroupDetail[]> {
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
    const filled = m.group._count.memberships;
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

async function getPendingConfirmationsInfo(
  managerUserId: string,
): Promise<{ count: number; confirmGroup: { groupId: string; groupName: string } | null }> {
  const where = {
    status: ContributionStatus.reported,
    round: {
      status: RoundStatus.current,
      group: {
        managerId: managerUserId,
        status: GroupStatus.active,
      },
    },
  };

  const [count, row] = await Promise.all([
    prisma.contribution.count({ where }),
    prisma.contribution.findFirst({
      where,
      select: {
        round: {
          select: {
            group: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { reportedAt: "asc" },
    }),
  ]);

  return {
    count,
    confirmGroup: row
      ? { groupId: row.round.group.id, groupName: row.round.group.name }
      : null,
  };
}

async function getMemberDueContributions(userId: string): Promise<DueContribution[]> {
  const today = startOfUtcDay(new Date());

  const rows = await prisma.contribution.findMany({
    where: {
      // Reported payments are waiting on the organizer, not the member, so they aren't "due".
      status: ContributionStatus.pending,
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

/** Settlement claims and open disputes waiting on this organizer, counted per group. */
async function getOrganizerQueue(managerUserId: string): Promise<{ claims: GroupCount[]; disputes: GroupCount[] }> {
  const [claims, disputes] = await Promise.all([
    prisma.settlementClaim.findMany({
      where: { status: "pending", debtorMembership: { group: { managerId: managerUserId } } },
      select: { debtorMembership: { select: { group: { select: { id: true, name: true } } } } },
    }),
    prisma.dispute.findMany({
      where: {
        status: "open",
        OR: [
          { contribution: { round: { group: { managerId: managerUserId } } } },
          { settlementClaim: { debtorMembership: { group: { managerId: managerUserId } } } },
        ],
      },
      select: {
        contribution: { select: { round: { select: { group: { select: { id: true, name: true } } } } } },
        settlementClaim: { select: { debtorMembership: { select: { group: { select: { id: true, name: true } } } } } },
      },
    }),
  ]);
  const tally = (groups: { id: string; name: string }[]) => {
    const map = new Map<string, GroupCount>();
    for (const g of groups) {
      const entry = map.get(g.id) ?? { groupId: g.id, groupName: g.name, count: 0 };
      entry.count += 1;
      map.set(g.id, entry);
    }
    return [...map.values()];
  };
  return {
    claims: tally(claims.map((c) => c.debtorMembership.group)),
    disputes: tally(
      disputes.flatMap((d) => {
        const group = d.contribution?.round.group ?? d.settlementClaim?.debtorMembership.group;
        return group ? [group] : [];
      }),
    ),
  };
}

export function buildAttentionItems(params: {
  formingDetails: FormingGroupDetail[];
  pendingConfirmations: number;
  confirmGroup: { groupId: string; groupName: string } | null;
  dueContributions: DueContribution[];
  totalOwed: string | null;
  debts: GroupDebt[];
  queue: { claims: GroupCount[]; disputes: GroupCount[] };
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
      body: `${params.pendingConfirmations} reported payment${params.pendingConfirmations === 1 ? " awaits" : "s await"} your review${linkGroup ? ` in ${linkGroup.groupName}` : ""}.`,
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
        ? `Round ${due.roundNumber} was due ${formatDisplayDate(due.dueDate)}. Report or complete your contribution.`
        : `Round ${due.roundNumber} is due ${formatDisplayDate(due.dueDate)}.`,
      link: `/groups/${due.groupId}`,
      priority: due.isOverdue ? "high" : "normal",
    });
  }

  for (const debt of params.debts) {
    items.push({
      id: `you-owe-${debt.groupId}`,
      kind: "you_owe",
      title: `You owe ₱${Number(debt.remaining).toLocaleString()} in ${debt.groupName}`,
      body: debt.hasPendingClaim
        ? "Your payment is waiting for the organizer to confirm."
        : `From ${debt.obligationCount} missed or partial round${debt.obligationCount === 1 ? "" : "s"}. Settle it when you can.`,
      link: `/groups/${debt.groupId}?tab=issues`,
      priority: debt.hasPendingClaim ? "normal" : "high",
    });
  }

  for (const claim of params.queue.claims) {
    items.push({
      id: `claims-${claim.groupId}`,
      kind: "claims_to_review",
      title: `Review ${claim.count} debt payment${claim.count === 1 ? "" : "s"} in ${claim.groupName}`,
      body: "Members reported paying off what they owe.",
      link: `/groups/${claim.groupId}?tab=issues`,
      priority: "high",
    });
  }

  for (const dispute of params.queue.disputes) {
    items.push({
      id: `disputes-${dispute.groupId}`,
      kind: "disputes_open",
      title: `${dispute.count} problem${dispute.count === 1 ? "" : "s"} reported in ${dispute.groupName}`,
      body: "A member says a payment was recorded wrong.",
      link: `/groups/${dispute.groupId}?tab=issues`,
      priority: "high",
    });
  }

  if (params.totalOwed) {
    items.push({
      id: "owed-outstanding",
      kind: "owed_outstanding",
      title: `Members owe you ₱${Number(params.totalOwed).toLocaleString()}`,
      body: "Unsettled shortfalls across the groups you organize.",
      link: "/money",
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
          slotCount: true,
          startDate: true,
          _count: { select: { memberships: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const managesAnyGroup = memberships.some((m) => m.isManager);

  const [
    unreadNotifications,
    totalOutstanding,
    pendingConfirmationsInfo,
    dueContributions,
    formingDetails,
    debts,
    queue,
  ] = await Promise.all([
    countUnreadNotifications(userId),
    managesAnyGroup ? getManagerTotalOutstanding(userId) : Promise.resolve("0"),
    getPendingConfirmationsInfo(userId),
    getMemberDueContributions(userId),
    getFormingGroupDetails(memberships),
    getUserDebts(userId),
    managesAnyGroup ? getOrganizerQueue(userId) : Promise.resolve({ claims: [], disputes: [] }),
  ]);

  const { count: pendingConfirmations, confirmGroup } = pendingConfirmationsInfo;

  const activeGroups = memberships.filter((m) => m.group.status === GroupStatus.active).length;
  const formingGroups = memberships.filter((m) => m.group.status === GroupStatus.forming).length;
  const completedGroups = memberships.filter((m) => m.group.status === GroupStatus.completed).length;

  const totalOwed =
    totalOutstanding !== "0" && Number.parseFloat(totalOutstanding) > 0
      ? totalOutstanding
      : null;

  const attention = buildAttentionItems({
    formingDetails,
    pendingConfirmations,
    confirmGroup,
    dueContributions,
    totalOwed,
    debts,
    queue,
  });

  return {
    stats: {
      activeGroups,
      formingGroups,
      completedGroups,
      unreadNotifications,
      totalOwed,
      pendingConfirmations,
      paymentsDue: dueContributions.length,
    },
    attention,
  };
}
