import type { Group } from "@prisma/client";
import { canTransition } from "../domain/lifecycle.js";
import { buildSchedule } from "../domain/schedule.js";
import {
  earliestStartDate,
  frequencyLabel,
  launchBlockers,
  settingChanges,
  setupErrors,
  toSettings,
  type SetupErrors,
  type SetupInput,
} from "../domain/setup.js";
import { audit } from "../lib/audit.js";
import { AppError, conflict } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { fromCalendarDate, todayInManila, toCalendarDate } from "../lib/today.js";
import { notifyUsers } from "./notifications.js";
import { openPeriodView, visibleSubmissions } from "./submissions.js";
import { assertState, memberUserIds, resetOrder, settingsOf, slotName, withGroupLock, type Db } from "./common.js";

/** A 400 that carries per-field messages, shown under each form field. */
export class SetupValidationError extends AppError {
  constructor(fields: SetupErrors) {
    super(400, Object.values(fields)[0] ?? "Check the form", "INVALID_SETUP", fields);
  }
}

/** R-SET-01, R-DEC-15: case-insensitive, among the organizer's paluwagans that aren't cancelled. */
async function assertNameAvailable(db: Db, organizerId: string, name: string, exceptGroupId?: string) {
  const clash = await db.group.findFirst({
    where: {
      organizerId,
      state: { not: "CANCELLED" },
      name: { equals: name.trim(), mode: "insensitive" },
      ...(exceptGroupId ? { id: { not: exceptGroupId } } : {}),
    },
    select: { id: true },
  });
  if (clash) throw new SetupValidationError({ name: "You already have a paluwagan with this name." });
}

function settingsData(input: SetupInput) {
  const settings = toSettings(input);
  return {
    settings,
    data: {
      name: settings.name,
      slotCount: settings.slotCount,
      amountMode: settings.amountMode,
      contribution: BigInt(settings.contribution),
      pot: BigInt(settings.pot),
      enteredPot: settings.enteredPot == null ? null : BigInt(settings.enteredPot),
      frequency: settings.frequency,
      intervalDays: settings.intervalDays,
      startDate: fromCalendarDate(settings.startDate),
      interestRate: settings.interestRate,
    },
  };
}

/** §4: the group starts in LOBBY with the organizer in one slot. */
export async function createGroup(userId: string, input: SetupInput) {
  const errors = setupErrors(input, todayInManila());
  if (Object.keys(errors).length > 0) throw new SetupValidationError(errors);
  const { data } = settingsData(input);

  return prisma.$transaction(async (tx) => {
    await assertNameAvailable(tx, userId, input.name);
    const group = await tx.group.create({
      data: { ...data, organizerId: userId, slots: { create: { userId, isOrganizer: true } } },
    });
    await audit(tx, {
      groupId: group.id,
      actorUserId: userId,
      action: "group.created",
      after: { ...toSettings(input) },
    });
    return group;
  });
}

/** R-LOB-09 / R-LOB-10 / R-LOB-11: edit any setting in the lobby; everyone hears what changed. */
export async function editGroup(groupId: string, actorUserId: string, input: SetupInput) {
  return withGroupLock(groupId, async (tx, group) => {
    assertState(group, ["LOBBY"], "Settings are locked once the paluwagan launches.");
    const occupied = await tx.slot.count({ where: { groupId } });
    const errors = setupErrors(input, todayInManila(), occupied);
    if (Object.keys(errors).length > 0) throw new SetupValidationError(errors);
    await assertNameAvailable(tx, actorUserId, input.name, groupId);

    const before = settingsOf(group);
    const { settings: after, data } = settingsData(input);
    const changes = settingChanges(before, after);
    if (changes.length === 0) return { group, changes };

    const updated = await tx.group.update({ where: { id: groupId }, data });
    if (after.slotCount !== before.slotCount) await resetOrder(tx, group, actorUserId, "Slot count changed");

    await audit(tx, {
      groupId,
      actorUserId,
      action: "group.edited",
      before: Object.fromEntries(changes.map((c) => [c.field, c.before])),
      after: Object.fromEntries(changes.map((c) => [c.field, c.after])),
    });
    const others = (await memberUserIds(tx, groupId)).filter((id) => id !== actorUserId);
    await notifyUsers(tx, others, {
      groupId,
      kind: "group.edited",
      title: `${after.name}: details changed`,
      body: changes.map((c) => `${c.label}: ${c.before} → ${c.after}`).join("\n"),
      data: { changes },
    });
    return { group: updated, changes };
  });
}

/** R-LOB-06, R-DEC-03: only from LOBBY. */
export async function cancelGroup(groupId: string, actorUserId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    if (!canTransition(group.state, "CANCELLED")) {
      throw conflict("A paluwagan can only be cancelled before it launches.", "WRONG_STATE");
    }
    const updated = await tx.group.update({
      where: { id: groupId },
      data: { state: "CANCELLED", cancelledAt: new Date() },
    });
    await tx.inviteLink.updateMany({ where: { groupId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.claimLink.updateMany({
      where: { slot: { groupId }, revokedAt: null, claimedAt: null },
      data: { revokedAt: new Date() },
    });
    await audit(tx, { groupId, actorUserId, action: "group.cancelled" });
    const others = (await memberUserIds(tx, groupId)).filter((id) => id !== actorUserId);
    await notifyUsers(tx, others, {
      groupId,
      kind: "group.cancelled",
      title: `${group.name} was cancelled`,
      body: "The organizer cancelled this paluwagan before it launched.",
    });
    return updated;
  });
}

/** The viewer's paluwagans, newest first. */
export async function listMyGroups(userId: string) {
  const groups = await prisma.group.findMany({
    where: { slots: { some: { userId } } },
    include: {
      organizer: { select: { displayName: true } },
      slots: { select: { id: true, userId: true, isOrganizer: true, position: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  return groups.map((g) => {
    const mine = g.slots.find((s) => s.userId === userId)!;
    return {
      ...summary(g),
      organizerName: g.organizer.displayName,
      occupied: g.slots.length,
      isOrganizer: mine.isOrganizer,
      myPosition: mine.position,
    };
  });
}

function summary(group: Group) {
  const settings = settingsOf(group);
  return {
    id: group.id,
    name: group.name,
    state: group.state,
    slotCount: group.slotCount,
    amountMode: group.amountMode,
    contribution: settings.contribution,
    pot: settings.pot,
    enteredPot: settings.enteredPot,
    potAdjustedFrom: settings.potAdjustedFrom,
    frequency: group.frequency,
    intervalDays: group.intervalDays,
    frequencyLabel: frequencyLabel(group.frequency, group.intervalDays),
    startDate: settings.startDate,
    interestRate: group.interestRate,
    orderLocked: group.orderLocked,
    createdAt: group.createdAt.toISOString(),
    launchedAt: group.launchedAt?.toISOString() ?? null,
    activatedAt: group.activatedAt?.toISOString() ?? null,
    completedAt: group.completedAt?.toISOString() ?? null,
    cancelledAt: group.cancelledAt?.toISOString() ?? null,
  };
}

/** The public face of a group, for invite landing pages (R-INV-01). */
export function publicSummary(group: Group & { organizer: { displayName: string } }, occupied: number) {
  return { ...summary(group), organizerName: group.organizer.displayName, occupied };
}

/**
 * Everything one paluwagan page needs, for this viewer. Links (invite, claim) and placeholder
 * contacts are organizer-only; everything else is visible to every member (R-DEC-06).
 */
export async function groupDetail(groupId: string, viewerUserId: string, appOrigin: string) {
  const group = await prisma.group.findUniqueOrThrow({
    where: { id: groupId },
    include: {
      organizer: { select: { displayName: true } },
      slots: {
        include: {
          user: { select: { displayName: true } },
          claimLinks: { where: { revokedAt: null, claimedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
        },
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
      },
      inviteLinks: { where: { revokedAt: null }, orderBy: { createdAt: "desc" }, take: 1 },
      rounds: { orderBy: { number: "asc" } },
    },
  });
  const viewer = group.slots.find((s) => s.userId === viewerUserId)!;
  const isOrganizer = viewer.isOrganizer;
  const settings = settingsOf(group);
  const today = todayInManila();

  const slots = group.slots.map((slot) => ({
    id: slot.id,
    kind: slot.userId ? ("MEMBER" as const) : ("PLACEHOLDER" as const),
    name: slotName(slot),
    isOrganizer: slot.isOrganizer,
    isViewer: slot.id === viewer.id,
    position: slot.position,
    claimedAt: slot.claimedAt?.toISOString() ?? null,
    contact: isOrganizer && !slot.userId ? slot.placeholderContact : null,
    claimLink:
      isOrganizer && !slot.userId && slot.claimLinks[0]
        ? { url: `${appOrigin}/claim/${slot.claimLinks[0].token}`, createdAt: slot.claimLinks[0].createdAt.toISOString() }
        : null,
  }));

  // Before launch the schedule is a preview from the settings; afterwards it's the stored rounds.
  const bySlotPosition = new Map(group.slots.filter((s) => s.position != null).map((s) => [s.position!, s.id]));
  const schedule =
    group.rounds.length > 0
      ? group.rounds.map((r) => ({
          number: r.number,
          periodStart: toCalendarDate(r.periodStart),
          payoutDate: toCalendarDate(r.payoutDate),
          recipientSlotId: r.recipientSlotId,
          status: r.status,
        }))
      : buildSchedule(settings.startDate, settings.frequency, settings.slotCount, settings.intervalDays ?? undefined).map(
          (r) => ({ ...r, recipientSlotId: bySlotPosition.get(r.number) ?? null, status: "UPCOMING" as const }),
        );

  const period = await openPeriodView(prisma, groupId, settings.contribution);
  const submissions = period
    ? await visibleSubmissions(prisma, groupId, period.roundId, { userId: viewerUserId, slotId: viewer.id, isOrganizer })
    : [];

  return {
    group: { ...summary(group), organizerName: group.organizer.displayName },
    viewer: { slotId: viewer.id, isOrganizer },
    slots,
    openSlots: group.slotCount - group.slots.length,
    inviteLink:
      isOrganizer && group.state === "LOBBY" && group.inviteLinks[0]
        ? { url: `${appOrigin}/invite/${group.inviteLinks[0].token}`, createdAt: group.inviteLinks[0].createdAt.toISOString() }
        : null,
    schedule,
    /** The open contribution period and each slot's standing in it (R-SUB-07); null outside ACTIVE. */
    period,
    submissions,
    launch:
      group.state === "LOBBY"
        ? {
            blockers: launchBlockers({
              slotCount: group.slotCount,
              occupied: group.slots.length,
              orderLocked: group.orderLocked,
              startDate: settings.startDate,
              today,
            }),
            earliestStartDate: earliestStartDate(today),
          }
        : null,
  };
}
