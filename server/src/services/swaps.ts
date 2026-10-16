import type { Slot, Swap } from "@prisma/client";
import { NOTE_MAX_LENGTH, SWAP_REQUEST_EXPIRY_DAYS } from "../domain/constants.js";
import { can } from "../domain/lifecycle.js";
import { needsOrganizerApproval, swapBlocker, type SwapTurn } from "../domain/swaps.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { todayInManila, toCalendarDate } from "../lib/today.js";
import { notifyUsers } from "./notifications.js";
import { slotName, withGroupLock, type Db } from "./common.js";

const OPEN_STATUSES = ["AWAITING_TARGET", "AWAITING_ORGANIZER"] as const;
type SlotWithUser = Slot & { user: { displayName: string } | null };

async function turnOf(db: Db, groupId: string, slotId: string): Promise<SwapTurn> {
  const round = await db.round.findFirstOrThrow({ where: { groupId, recipientSlotId: slotId } });
  return {
    slotId,
    roundNumber: round.number,
    paidOut: round.status === "CLOSED",
    isOpenRound: round.status === "OPEN",
    payoutDate: toCalendarDate(round.payoutDate),
  };
}

async function assertSwappable(db: Db, groupId: string, a: string, b: string) {
  const blocker = swapBlocker(await turnOf(db, groupId, a), await turnOf(db, groupId, b), todayInManila());
  if (blocker) throw conflict(blocker, "NOT_SWAPPABLE");
}

/** R-DEC-22: the organizer speaks for a slot that is theirs or a placeholder's. */
const organizerSpeaksFor = (slot: Slot) => slot.isOrganizer || !slot.userId;

/** Who to tell about a slot: its user, or the organizer for a placeholder. */
const voiceOf = (slot: Slot, organizerId: string) => slot.userId ?? organizerId;

async function loadSwap(db: Db, groupId: string, swapId: string) {
  const swap = await db.swap.findFirst({
    where: { id: swapId, groupId },
    include: { requester: { include: { user: true } }, target: { include: { user: true } } },
  });
  if (!swap) throw notFound("Swap");
  return swap;
}

/**
 * R-SWP-02, last step: the two slots trade rounds. Each round keeps its payout date, so both
 * members' payout dates change. Positions are unique, so one is parked while they trade.
 */
async function applySwap(db: Db, groupId: string, swap: Swap & { requester: SlotWithUser; target: SlotWithUser }, actorUserId: string | null) {
  const [a, b] = [await turnOf(db, groupId, swap.requesterSlotId), await turnOf(db, groupId, swap.targetSlotId)];
  await db.round.update({ where: { groupId_number: { groupId, number: a.roundNumber } }, data: { recipientSlotId: swap.targetSlotId } });
  await db.round.update({ where: { groupId_number: { groupId, number: b.roundNumber } }, data: { recipientSlotId: swap.requesterSlotId } });
  await db.slot.update({ where: { id: swap.requesterSlotId }, data: { position: null } });
  await db.slot.update({ where: { id: swap.targetSlotId }, data: { position: a.roundNumber } });
  await db.slot.update({ where: { id: swap.requesterSlotId }, data: { position: b.roundNumber } });
  await db.swap.update({ where: { id: swap.id }, data: { status: "APPROVED", reviewedAt: new Date() } });
  await audit(db, {
    groupId,
    actorUserId,
    action: "swap.approved",
    targetSlotId: swap.requesterSlotId,
    targetName: slotName(swap.requester),
    before: { [slotName(swap.requester)]: a.roundNumber, [slotName(swap.target)]: b.roundNumber },
    after: { [slotName(swap.requester)]: b.roundNumber, [slotName(swap.target)]: a.roundNumber },
  });
  const group = await db.group.findUniqueOrThrow({ where: { id: groupId } });
  for (const [slot, round, date] of [
    [swap.requester, b.roundNumber, b.payoutDate],
    [swap.target, a.roundNumber, a.payoutDate],
  ] as const) {
    if (!slot.userId) continue;
    await notifyUsers(db, [slot.userId], {
      groupId,
      kind: "swap.approved",
      title: `Your turn moved to round ${round}`,
      body: `${group.name}: you now get the pot on ${date}.`,
    });
  }
}

/** R-SWP-01: ask to trade payout turns with another slot. */
export async function requestSwap(
  groupId: string,
  actorUserId: string,
  input: { targetSlotId: string; requesterSlotId?: string },
) {
  return withGroupLock(groupId, async (tx, group) => {
    if (!can.requestSwap(group.state)) throw conflict("Turns can be swapped only while the paluwagan runs.", "WRONG_STATE");
    const actor = await tx.slot.findFirstOrThrow({ where: { groupId, userId: actorUserId } });
    const requesterId = input.requesterSlotId ?? actor.id;
    const [requester, target] = await Promise.all([
      tx.slot.findFirst({ where: { id: requesterId, groupId }, include: { user: true } }),
      tx.slot.findFirst({ where: { id: input.targetSlotId, groupId }, include: { user: true } }),
    ]);
    if (!requester || !target) throw notFound("Slot");
    if (requester.id !== actor.id && !(actor.isOrganizer && !requester.userId)) {
      throw forbidden("You can only ask to swap your own turn.");
    }
    // R-DEC-23
    const busy = await tx.swap.findFirst({
      where: {
        groupId,
        status: { in: [...OPEN_STATUSES] },
        OR: [{ requesterSlotId: { in: [requester.id, target.id] } }, { targetSlotId: { in: [requester.id, target.id] } }],
      },
    });
    if (busy) throw conflict("One of you already has a swap in progress. Settle that one first.", "SWAP_IN_PROGRESS");
    await assertSwappable(tx, groupId, requester.id, target.id);

    const swap = await tx.swap.create({
      data: {
        groupId,
        requesterSlotId: requester.id,
        targetSlotId: target.id,
        expiresAt: SWAP_REQUEST_EXPIRY_DAYS === null ? null : new Date(Date.now() + SWAP_REQUEST_EXPIRY_DAYS * 86_400_000),
      },
    });
    const [mine, theirs] = [await turnOf(tx, groupId, requester.id), await turnOf(tx, groupId, target.id)];
    await audit(tx, {
      groupId,
      actorUserId,
      action: "swap.requested",
      targetSlotId: target.id,
      targetName: slotName(target),
      before: { [slotName(requester)]: mine.roundNumber, [slotName(target)]: theirs.roundNumber },
    });
    const to = voiceOf(target, group.organizerId);
    if (to !== actorUserId) {
      await notifyUsers(tx, [to], {
        groupId,
        kind: "swap.requested",
        title: `${slotName(requester)} asks to swap turns${target.userId ? "" : ` with ${slotName(target)}`}`,
        body: `Round ${theirs.roundNumber} (${theirs.payoutDate}) for round ${mine.roundNumber} (${mine.payoutDate}).`,
      });
    }
    return swap;
  });
}

/** R-SWP-02: the other side accepts or declines. Accepting may finish the swap (R-DEC-22). */
export async function respondToSwap(groupId: string, actorUserId: string, swapId: string, accept: boolean) {
  return withGroupLock(groupId, async (tx, group) => {
    const swap = await loadSwap(tx, groupId, swapId);
    if (swap.status !== "AWAITING_TARGET") throw conflict("This swap isn't waiting for an answer.", "WRONG_STATUS");
    const actingForTarget =
      swap.target.userId === actorUserId || (group.organizerId === actorUserId && !swap.target.userId);
    if (!actingForTarget) throw forbidden("Only the person asked can answer.");

    if (!accept) {
      await tx.swap.update({ where: { id: swap.id }, data: { status: "DECLINED", targetRespondedAt: new Date() } });
      await audit(tx, { groupId, actorUserId, action: "swap.declined", targetSlotId: swap.requesterSlotId, targetName: slotName(swap.requester) });
      const to = voiceOf(swap.requester, group.organizerId);
      if (to !== actorUserId) {
        await notifyUsers(tx, [to], {
          groupId,
          kind: "swap.declined",
          title: `${slotName(swap.target)} declined to swap turns`,
          body: "Your turn stays as it is.",
        });
      }
      return;
    }

    await assertSwappable(tx, groupId, swap.requesterSlotId, swap.targetSlotId);
    await tx.swap.update({ where: { id: swap.id }, data: { targetRespondedAt: new Date() } });
    await audit(tx, { groupId, actorUserId, action: "swap.accepted", targetSlotId: swap.requesterSlotId, targetName: slotName(swap.requester) });
    const approval = needsOrganizerApproval({
      requesterActsAsOrganizer: organizerSpeaksFor(swap.requester),
      targetActsAsOrganizer: organizerSpeaksFor(swap.target),
    });
    if (!approval) {
      await applySwap(tx, groupId, swap, actorUserId);
      return;
    }
    await tx.swap.update({ where: { id: swap.id }, data: { status: "AWAITING_ORGANIZER" } });
    await notifyUsers(tx, [group.organizerId], {
      groupId,
      kind: "swap.awaiting_approval",
      title: `${slotName(swap.requester)} and ${slotName(swap.target)} want to swap turns`,
      body: "They both agreed. Approve it to change the payout order.",
    });
  });
}

/** R-SWP-02: the organizer approves or denies (with a reason) a swap both members agreed to. */
export async function reviewSwap(
  groupId: string,
  organizerUserId: string,
  swapId: string,
  decision: { approve: true } | { approve: false; note: string },
) {
  const note = decision.approve ? null : decision.note.trim();
  if (!decision.approve && !note) throw badRequest("Say why, so they understand.");
  if (note && note.length > NOTE_MAX_LENGTH) throw badRequest(`The reason can be up to ${NOTE_MAX_LENGTH} characters.`);
  return withGroupLock(groupId, async (tx) => {
    const swap = await loadSwap(tx, groupId, swapId);
    if (swap.status !== "AWAITING_ORGANIZER") throw conflict("This swap isn't waiting for your approval.", "WRONG_STATUS");
    if (decision.approve) {
      await assertSwappable(tx, groupId, swap.requesterSlotId, swap.targetSlotId);
      await applySwap(tx, groupId, swap, organizerUserId);
      return;
    }
    await tx.swap.update({ where: { id: swap.id }, data: { status: "DENIED", reviewedAt: new Date(), reviewNote: note } });
    await audit(tx, {
      groupId,
      actorUserId: organizerUserId,
      action: "swap.denied",
      targetSlotId: swap.requesterSlotId,
      targetName: slotName(swap.requester),
      after: { reason: note },
    });
    await notifyUsers(tx, [swap.requester.userId, swap.target.userId], {
      groupId,
      kind: "swap.denied",
      title: "Your turn swap wasn't approved",
      body: `Reason: ${note}`,
    });
  });
}

/** The asking side can withdraw a swap that hasn't been settled. */
export async function cancelSwap(groupId: string, actorUserId: string, swapId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    const swap = await loadSwap(tx, groupId, swapId);
    const actingForRequester =
      swap.requester.userId === actorUserId || (group.organizerId === actorUserId && !swap.requester.userId);
    if (!actingForRequester) throw forbidden("Only whoever asked can withdraw it.");
    if (!OPEN_STATUSES.includes(swap.status as (typeof OPEN_STATUSES)[number])) {
      throw conflict("This swap is already settled.", "WRONG_STATUS");
    }
    await tx.swap.update({ where: { id: swap.id }, data: { status: "CANCELLED", reviewedAt: new Date() } });
    await audit(tx, { groupId, actorUserId, action: "swap.cancelled", targetSlotId: swap.targetSlotId, targetName: slotName(swap.target) });
  });
}

/** R-DEC-24: once a slot is paid out, its open swaps can't happen; they expire. */
export async function expireSwapsFor(db: Db, groupId: string, slotId: string) {
  const open = await db.swap.findMany({
    where: { groupId, status: { in: [...OPEN_STATUSES] }, OR: [{ requesterSlotId: slotId }, { targetSlotId: slotId }] },
    include: { requester: true, target: true, group: { select: { organizerId: true } } },
  });
  for (const swap of open) {
    await db.swap.update({ where: { id: swap.id }, data: { status: "EXPIRED", reviewedAt: new Date() } });
    await audit(db, { groupId, actorUserId: null, action: "swap.expired", targetSlotId: swap.requesterSlotId, after: { reason: "paid out" } });
    await notifyUsers(db, [swap.requester.userId, swap.target.userId], {
      groupId,
      kind: "swap.expired",
      title: "A turn swap expired",
      body: "One of the turns was paid out before the swap was settled.",
    });
  }
}

/** R-SWP-04: pending swaps past their expiry. Nothing expires until the constant has a value (R-DEC-25). */
export async function expireStaleSwaps(now = new Date()) {
  const stale = await prisma.swap.findMany({
    where: { status: { in: [...OPEN_STATUSES] }, expiresAt: { lt: now } },
    select: { id: true, groupId: true },
  });
  for (const { id, groupId } of stale) {
    await withGroupLock(groupId, async (tx) => {
      const swap = await loadSwap(tx, groupId, id);
      if (!OPEN_STATUSES.includes(swap.status as (typeof OPEN_STATUSES)[number])) return;
      await tx.swap.update({ where: { id }, data: { status: "EXPIRED", reviewedAt: new Date() } });
      await audit(tx, { groupId, actorUserId: null, action: "swap.expired", targetSlotId: swap.requesterSlotId, after: { reason: "timed out" } });
      await notifyUsers(tx, [swap.requester.userId, swap.target.userId], {
        groupId,
        kind: "swap.expired",
        title: "A turn swap expired",
        body: "It wasn't settled in time. Ask again if you still want to swap.",
      });
    });
  }
  return { expiredSwaps: stale.length };
}

/** Swaps this viewer may see: all for the organizer, the ones they're part of for a member. */
export async function visibleSwaps(db: Db, groupId: string, viewer: { slotId: string; isOrganizer: boolean }) {
  const swaps = await db.swap.findMany({
    where: {
      groupId,
      ...(viewer.isOrganizer ? {} : { OR: [{ requesterSlotId: viewer.slotId }, { targetSlotId: viewer.slotId }] }),
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return swaps.map((s) => ({
    id: s.id,
    requesterSlotId: s.requesterSlotId,
    targetSlotId: s.targetSlotId,
    status: s.status,
    createdAt: s.createdAt.toISOString(),
    expiresAt: s.expiresAt?.toISOString() ?? null,
    reviewNote: s.reviewNote,
  }));
}
