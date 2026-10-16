import { Prisma, type Group, type Slot } from "@prisma/client";
import { audit } from "../lib/audit.js";
import { conflict } from "../lib/errors.js";
import { prisma, prismaTransactionOptions } from "../lib/prisma.js";
import { toCalendarDate } from "../lib/today.js";
import type { GroupState } from "../domain/lifecycle.js";
import type { GroupSettings } from "../domain/setup.js";

export type Db = Prisma.TransactionClient;

/**
 * Run `fn` in a transaction holding a row lock on the group, so roster and state changes for one
 * paluwagan never interleave (two people taking the last slot, a join racing a launch).
 */
export function withGroupLock<T>(groupId: string, fn: (tx: Db, group: Group) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE`;
    const group = await tx.group.findUniqueOrThrow({ where: { id: groupId } });
    return fn(tx, group);
  }, prismaTransactionOptions);
}

export function assertState(group: Group, allowed: GroupState[], message: string) {
  if (!allowed.includes(group.state)) throw conflict(message, "WRONG_STATE");
}

/** The stored settings of a group, as the domain sees them. */
export function settingsOf(group: Group): GroupSettings {
  return {
    name: group.name,
    slotCount: group.slotCount,
    amountMode: group.amountMode,
    contribution: Number(group.contribution),
    pot: Number(group.pot),
    enteredPot: group.enteredPot == null ? null : Number(group.enteredPot),
    potAdjustedFrom:
      group.enteredPot != null && Number(group.enteredPot) !== Number(group.pot) ? Number(group.enteredPot) : null,
    frequency: group.frequency,
    intervalDays: group.intervalDays,
    startDate: toCalendarDate(group.startDate),
    interestRate: group.interestRate,
  };
}

/** How a slot is named everywhere: the user's name, or the placeholder's. */
export function slotName(slot: Slot & { user?: { displayName: string } | null }): string {
  return slot.user?.displayName ?? slot.placeholderName ?? "Member";
}

/** User ids of everyone holding a slot (placeholders have none). */
export async function memberUserIds(db: Db, groupId: string): Promise<string[]> {
  const slots = await db.slot.findMany({ where: { groupId, userId: { not: null } }, select: { userId: true } });
  return slots.map((s) => s.userId!);
}

/**
 * R-LOB-11 / R-LOB-12: any roster or slot-count change clears the payout order and unlocks it.
 * Audited only when there was an order to clear.
 */
export async function resetOrder(db: Db, group: Group, actorUserId: string | null, reason: string) {
  const positioned = await db.slot.count({ where: { groupId: group.id, position: { not: null } } });
  if (positioned === 0 && !group.orderLocked) return;
  await db.slot.updateMany({ where: { groupId: group.id }, data: { position: null } });
  await db.group.update({ where: { id: group.id }, data: { orderLocked: false } });
  await audit(db, { groupId: group.id, actorUserId, action: "order.reset", after: { reason } });
}
