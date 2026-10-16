import { randomInt } from "node:crypto";
import { canTransition } from "../domain/lifecycle.js";
import { buildSchedule } from "../domain/schedule.js";
import { launchBlockers } from "../domain/setup.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { fromCalendarDate, todayInManila } from "../lib/today.js";
import { notifyUsers } from "./notifications.js";
import { assertState, memberUserIds, settingsOf, withGroupLock, type Db } from "./common.js";
import { formatDisplayDate } from "../lib/dates.js";

/** Positions 1…N in the given slot order. Clears first, since positions are unique per group. */
async function writeOrder(tx: Db, groupId: string, slotIds: string[]) {
  await tx.slot.updateMany({ where: { groupId }, data: { position: null } });
  for (const [index, id] of slotIds.entries()) {
    await tx.slot.update({ where: { id }, data: { position: index + 1 } });
  }
  await tx.group.update({ where: { id: groupId }, data: { orderLocked: false } });
}

/** R-ORD-01: ordering opens only once every slot is filled. */
async function fullRoster(tx: Db, groupId: string, slotCount: number) {
  const slots = await tx.slot.findMany({ where: { groupId }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  if (slots.length < slotCount) throw conflict("Fill every slot before arranging the payout order.", "NOT_FULL");
  return slots;
}

/** R-ORD-02: a manual order. `slotIds` must list every slot exactly once, first payout first. */
export async function setOrder(groupId: string, actorUserId: string, slotIds: string[]) {
  return withGroupLock(groupId, async (tx, group) => {
    assertState(group, ["LOBBY"], "The payout order is locked once the paluwagan launches.");
    const slots = await fullRoster(tx, groupId, group.slotCount);
    const known = new Set(slots.map((s) => s.id));
    if (slotIds.length !== slots.length || new Set(slotIds).size !== slotIds.length || !slotIds.every((id) => known.has(id))) {
      throw badRequest("The order must list every slot exactly once.");
    }
    await writeOrder(tx, groupId, slotIds);
    await audit(tx, { groupId, actorUserId, action: "order.changed", after: { order: slotIds } });
  });
}

/** R-ORD-02: random shuffle, as often as the organizer likes. Done here so it's fair and audited. */
export async function shuffleOrder(groupId: string, actorUserId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    assertState(group, ["LOBBY"], "The payout order is locked once the paluwagan launches.");
    const ids = (await fullRoster(tx, groupId, group.slotCount)).map((s) => s.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    await writeOrder(tx, groupId, ids);
    await audit(tx, { groupId, actorUserId, action: "order.shuffled", after: { order: ids } });
  });
}

/** R-ORD-03 */
export async function lockOrder(groupId: string, actorUserId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    assertState(group, ["LOBBY"], "The payout order is already final.");
    const slots = await fullRoster(tx, groupId, group.slotCount);
    if (slots.some((s) => s.position == null)) throw conflict("Arrange the payout order first.", "NO_ORDER");
    await tx.group.update({ where: { id: groupId }, data: { orderLocked: true } });
    await audit(tx, {
      groupId,
      actorUserId,
      action: "order.locked",
      after: { order: slots.map((s) => s.id) },
    });
  });
}

/**
 * R-LCH-02 / R-LCH-03: LOBBY → LAUNCHED. Settings lock, the invite link closes, and every round is
 * created from the locked order. Claim links stay live (R-CLM-03).
 */
export async function launchGroup(groupId: string, actorUserId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    if (!canTransition(group.state, "LAUNCHED")) throw conflict("This paluwagan has already launched.", "WRONG_STATE");
    const slots = await tx.slot.findMany({ where: { groupId }, orderBy: { position: "asc" } });
    const settings = settingsOf(group);
    const blockers = launchBlockers({
      slotCount: group.slotCount,
      occupied: slots.length,
      orderLocked: group.orderLocked,
      startDate: settings.startDate,
      today: todayInManila(),
    });
    if (blockers.length > 0) throw conflict(blockers.join(" "), "NOT_READY");

    const schedule = buildSchedule(settings.startDate, settings.frequency, settings.slotCount, settings.intervalDays ?? undefined);
    await tx.round.createMany({
      data: schedule.map((round) => ({
        groupId,
        number: round.number,
        periodStart: fromCalendarDate(round.periodStart),
        payoutDate: fromCalendarDate(round.payoutDate),
        recipientSlotId: slots[round.number - 1].id,
      })),
    });
    const updated = await tx.group.update({
      where: { id: groupId },
      data: { state: "LAUNCHED", launchedAt: new Date() },
    });
    await tx.inviteLink.updateMany({ where: { groupId, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, {
      groupId,
      actorUserId,
      action: "group.launched",
      after: { startDate: settings.startDate, order: slots.map((s) => s.id) },
    });
    await notifyUsers(
      tx,
      (await memberUserIds(tx, groupId)).filter((id) => id !== actorUserId),
      {
        groupId,
        kind: "group.launched",
        title: `${group.name} has launched`,
        body: `Everything is set. Contributions open on ${formatDisplayDate(settings.startDate)}.`,
      },
    );
    return updated;
  });
}

/**
 * R-LCH-04: every LAUNCHED group whose start date has arrived becomes ACTIVE, and Contribution
 * Period 1 opens. Safe to run repeatedly. `today` and `onlyGroupId` are for demo tools and tests.
 */
export async function activateDueGroups(today = todayInManila(), onlyGroupId?: string) {
  const due = await prisma.group.findMany({
    where: { state: "LAUNCHED", startDate: { lte: fromCalendarDate(today) }, ...(onlyGroupId ? { id: onlyGroupId } : {}) },
    select: { id: true },
  });
  let activated = 0;
  for (const { id } of due) {
    const done = await withGroupLock(id, async (tx, group) => {
      if (!canTransition(group.state, "ACTIVE")) return false;
      await tx.group.update({ where: { id }, data: { state: "ACTIVE", activatedAt: new Date() } });
      await tx.round.update({ where: { groupId_number: { groupId: id, number: 1 } }, data: { status: "OPEN" } });
      await audit(tx, { groupId: id, actorUserId: null, action: "group.activated" });
      await notifyUsers(tx, await memberUserIds(tx, id), {
        groupId: id,
        kind: "period.opened",
        title: `${group.name} has started`,
        body: "Contribution Period 1 is open.",
      });
      return true;
    });
    if (done) activated++;
  }
  return { activated };
}
