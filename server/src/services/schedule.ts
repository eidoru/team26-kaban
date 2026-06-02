import { Group, GroupFrequency, GroupStatus, Prisma, RoundStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { writeAuditLog } from "../lib/audit.js";
import { GroupError } from "./groups.js";
import { processRoundShortfall, notifyRoundShortfalls, type RoundShortfallNotifications } from "./obligations.js";

type Tx = Prisma.TransactionClient;

export function addFrequencyInterval(
  date: Date,
  frequency: GroupFrequency,
  steps: number,
  frequencyDays?: number | null,
): Date {
  const result = new Date(date);
  switch (frequency) {
    case "weekly":
      result.setUTCDate(result.getUTCDate() + 7 * steps);
      break;
    case "biweekly":
      result.setUTCDate(result.getUTCDate() + 14 * steps);
      break;
    case "monthly":
      result.setUTCMonth(result.getUTCMonth() + steps);
      break;
    case "custom": {
      const days = frequencyDays ?? 0;
      if (days < 1) {
        throw new GroupError(500, "Custom frequency is missing interval days");
      }
      result.setUTCDate(result.getUTCDate() + days * steps);
      break;
    }
  }
  return result;
}

export function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function setPayoutOrder(
  groupId: string,
  actorId: string,
  method: "random" | "manual",
  manualOrder?: { membershipId: string; turnNumber: number }[],
) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError(404, "Group not found");
  if (group.status !== GroupStatus.forming) {
    throw new GroupError(409, "Payout order can only be set while the group is forming");
  }

  const members = await prisma.membership.findMany({ where: { groupId } });
  if (members.length < group.slotCount) {
    throw new GroupError(409, "All slots must be filled before setting payout order");
  }

  let assignments: { membershipId: string; turnNumber: number }[];

  if (method === "random") {
    assignments = shuffle(members).map((m, i) => ({
      membershipId: m.id,
      turnNumber: i + 1,
    }));
  } else {
    if (!manualOrder || manualOrder.length !== members.length) {
      throw new GroupError(400, "Manual order must assign every member exactly once");
    }
    const turnNumbers = manualOrder.map((o) => o.turnNumber);
    const unique = new Set(turnNumbers);
    if (unique.size !== members.length || turnNumbers.some((n) => n < 1 || n > members.length)) {
      throw new GroupError(400, "Turn numbers must be unique and range from 1 to N");
    }
    const memberIds = new Set(members.map((m) => m.id));
    if (!manualOrder.every((o) => memberIds.has(o.membershipId))) {
      throw new GroupError(400, "Invalid membership in payout order");
    }
    assignments = manualOrder;
  }

  await prisma.$transaction(async (tx) => {
    const allMembers = await tx.membership.findMany({ where: { groupId } });

    // Stage temporary negative turn numbers so we never collide on (group_id, turn_number)
    // while reordering — safer than null for unique indexes across Postgres versions.
    for (let i = 0; i < allMembers.length; i++) {
      await tx.membership.update({
        where: { id: allMembers[i].id },
        data: { turnNumber: -(i + 1) },
      });
    }

    for (const a of assignments) {
      await tx.membership.update({
        where: { id: a.membershipId },
        data: { turnNumber: a.turnNumber },
      });
    }
    await tx.auditLog.create({
      data: {
        groupId,
        actorId,
        action: "group.payout_order_set",
        entityType: "group",
        entityId: groupId,
        metadata: { method },
      },
    });
  });

  const updated = await prisma.membership.findMany({
    where: { groupId },
    orderBy: { turnNumber: "asc" },
  });
  return updated;
}

export async function openRound(tx: Tx, roundId: string, expectedAmount: Prisma.Decimal) {
  const round = await tx.round.findUnique({
    where: { id: roundId },
    include: { group: { include: { memberships: true } } },
  });
  if (!round || round.status !== RoundStatus.current) {
    throw new GroupError(409, "Round is not open");
  }

  const existing = await tx.contribution.count({ where: { roundId } });
  if (existing > 0) return;

  await tx.contribution.createMany({
    data: round.group.memberships.map((m) => ({
      roundId: round.id,
      membershipId: m.id,
      amount: expectedAmount,
      status: "pending",
      source: "member",
    })),
  });
}

export async function activateGroup(
  groupId: string,
  actorId: string,
  startDateOverride?: string,
) {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError(404, "Group not found");
  if (group.status !== GroupStatus.forming) {
    throw new GroupError(409, "Group is already active or completed");
  }

  const members = await prisma.membership.findMany({ where: { groupId } });
  if (members.length < group.slotCount) {
    throw new GroupError(409, "All slots must be filled before activation");
  }
  if (members.some((m) => m.turnNumber === null)) {
    throw new GroupError(409, "Payout order must be set before activation");
  }

  const turnNumbers = members.map((m) => m.turnNumber!);
  if (new Set(turnNumbers).size !== members.length) {
    throw new GroupError(409, "Payout order is incomplete or has duplicates");
  }

  let startDate = group.startDate;
  if (startDateOverride) {
    startDate = new Date(startDateOverride);
  }
  if (!startDate) {
    throw new GroupError(409, "Start date is required before activation");
  }

  await prisma.$transaction(async (tx) => {
    await tx.group.update({
      where: { id: groupId },
      data: { status: GroupStatus.active, startDate },
    });

    const sorted = [...members].sort((a, b) => a.turnNumber! - b.turnNumber!);
    const baseDate = startOfUtcDay(startDate!);

    for (let i = 0; i < sorted.length; i++) {
      const dueDate = addFrequencyInterval(baseDate, group.frequency, i, group.frequencyDays);
      await tx.round.create({
        data: {
          groupId,
          number: i + 1,
          recipientMembershipId: sorted[i].id,
          dueDate,
          status: i === 0 ? RoundStatus.current : RoundStatus.scheduled,
        },
      });
    }

    const round1 = await tx.round.findFirst({
      where: { groupId, number: 1 },
    });
    if (!round1) throw new GroupError(500, "Failed to create schedule");

    await openRound(tx, round1.id, group.contributionAmount);

    await tx.auditLog.create({
      data: {
        groupId,
        actorId,
        action: "group.activated",
        entityType: "group",
        entityId: groupId,
        metadata: { startDate: startDate!.toISOString(), rounds: sorted.length },
      },
    });
  });

  return prisma.group.findUniqueOrThrow({ where: { id: groupId } });
}

export async function closeRoundById(roundId: string, actorId?: string) {
  let shortfallNotifications: RoundShortfallNotifications | null = null;

  await prisma.$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: { id: roundId },
      include: { group: true },
    });
    if (!round || round.status !== RoundStatus.current) return;

    await tx.round.update({
      where: { id: round.id },
      data: { status: RoundStatus.closed, closedAt: new Date() },
    });

    const shortfall = await processRoundShortfall(tx, round.id, actorId);
    shortfallNotifications = shortfall.notifications;

    await tx.auditLog.create({
      data: {
        groupId: round.groupId,
        actorId: actorId ?? null,
        action: "round.closed",
        entityType: "round",
        entityId: round.id,
        metadata: { number: round.number, obligationsCreated: shortfall.created },
      },
    });

    const next = await tx.round.findFirst({
      where: { groupId: round.groupId, number: round.number + 1 },
    });

    if (next) {
      await tx.round.update({
        where: { id: next.id },
        data: { status: RoundStatus.current },
      });
      await openRound(tx, next.id, round.group.contributionAmount);
      await tx.auditLog.create({
        data: {
          groupId: round.groupId,
          actorId: actorId ?? null,
          action: "round.opened",
          entityType: "round",
          entityId: next.id,
          metadata: { number: next.number },
        },
      });
    } else {
      await tx.group.update({
        where: { id: round.groupId },
        data: { status: GroupStatus.completed },
      });
      await tx.auditLog.create({
        data: {
          groupId: round.groupId,
          actorId: actorId ?? null,
          action: "group.completed",
          entityType: "group",
          entityId: round.groupId,
        },
      });
    }
  });

  if (shortfallNotifications) {
    await notifyRoundShortfalls(shortfallNotifications);
  }
}

export type ForceAdvanceResult = {
  closedRound: number;
  openedRound: number | null;
  completed: boolean;
};

/** Close the current round immediately, regardless of due date (UAT / manual cron). */
export async function forceAdvanceGroupRound(
  groupId: string,
  actorId?: string,
): Promise<ForceAdvanceResult> {
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new GroupError(404, "Group not found");
  if (group.status !== GroupStatus.active) {
    throw new GroupError(409, "Group is not active");
  }

  const current = await prisma.round.findFirst({
    where: { groupId, status: RoundStatus.current },
  });
  if (!current) {
    throw new GroupError(409, "No current round to advance");
  }

  const closedRound = current.number;
  await closeRoundById(current.id, actorId);

  const updatedGroup = await prisma.group.findUniqueOrThrow({ where: { id: groupId } });
  const nextCurrent = await prisma.round.findFirst({
    where: { groupId, status: RoundStatus.current },
  });

  return {
    closedRound,
    openedRound: nextCurrent?.number ?? null,
    completed: updatedGroup.status === GroupStatus.completed,
  };
}

/** Close all current rounds whose due date has passed (calendar sovereignty). */
export async function processDueRounds(): Promise<{ closed: number }> {
  const today = startOfUtcDay(new Date());
  const dueRounds = await prisma.round.findMany({
    where: {
      status: RoundStatus.current,
      dueDate: { lte: today },
    },
    orderBy: { dueDate: "asc" },
  });

  for (const round of dueRounds) {
    await closeRoundById(round.id);
  }

  return { closed: dueRounds.length };
}

export function serializeRound(round: {
  id: string;
  number: number;
  dueDate: Date;
  status: RoundStatus;
  closedAt: Date | null;
  recipientMembershipId: string;
}) {
  return {
    id: round.id,
    number: round.number,
    dueDate: round.dueDate.toISOString().slice(0, 10),
    status: round.status,
    closedAt: round.closedAt?.toISOString() ?? null,
    recipientMembershipId: round.recipientMembershipId,
  };
}

export function serializeContribution(c: {
  id: string;
  membershipId: string;
  amount: Prisma.Decimal;
  status: string;
}) {
  return {
    id: c.id,
    membershipId: c.membershipId,
    amount: c.amount.toString(),
    status: c.status,
  };
}
