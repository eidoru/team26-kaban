import { REMINDER_DAYS_BEFORE } from "../domain/constants.js";
import { formatPeso } from "../domain/money.js";
import { daysBetween } from "../domain/schedule.js";
import { audit } from "../lib/audit.js";
import { conflict, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { todayInManila, toCalendarDate } from "../lib/today.js";
import { notifyUsers } from "./notifications.js";
import { periodTotals } from "./submissions.js";
import { slotName, withGroupLock } from "./common.js";
import { formatDisplayDate } from "../lib/dates.js";

type ReminderKind = "BEFORE_PAYOUT" | "PAYOUT_DAY" | "MANUAL";

/**
 * §12: remind everyone not fully paid, `REMINDER_DAYS_BEFORE` days before the payout date and on
 * the day itself (the organizer for placeholders). Each reminder goes once per slot and round; a
 * missed run catches up, since "before" means any day inside the window. `today` and `onlyGroupId`
 * are for demo tools and tests.
 */
export async function sendDueReminders(today = todayInManila(), onlyGroupId?: string) {
  const rounds = await prisma.round.findMany({
    where: { status: "OPEN", group: { state: "ACTIVE" }, ...(onlyGroupId ? { groupId: onlyGroupId } : {}) },
    include: { group: true },
  });
  let sent = 0;
  for (const round of rounds) {
    const daysLeft = daysBetween(today, toCalendarDate(round.payoutDate));
    const kind: ReminderKind | null =
      daysLeft === 0 ? "PAYOUT_DAY" : daysLeft > 0 && daysLeft <= REMINDER_DAYS_BEFORE ? "BEFORE_PAYOUT" : null;
    if (!kind) continue;
    const slots = await prisma.slot.findMany({ where: { groupId: round.groupId }, include: { user: true } });
    for (const slot of slots) {
      const already = await prisma.reminderSent.findFirst({ where: { roundId: round.id, slotId: slot.id, kind } });
      if (already) continue;
      const { approved } = await periodTotals(prisma, slot.id, round.id);
      const unpaid = Number(round.group.contribution) - approved;
      if (unpaid <= 0) continue;
      await prisma.$transaction(async (tx) => {
        await tx.reminderSent.create({ data: { roundId: round.id, slotId: slot.id, kind } });
        await notifyUsers(tx, [slot.userId ?? round.group.organizerId], {
          groupId: round.groupId,
          kind: kind === "PAYOUT_DAY" ? "reminder.payout_day" : "reminder.due",
          title:
            kind === "PAYOUT_DAY"
              ? `Payout day: ${formatPeso(unpaid)} still unpaid${slot.userId ? "" : ` for ${slotName(slot)}`}`
              : `${formatPeso(unpaid)} due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}${slot.userId ? "" : ` for ${slotName(slot)}`}`,
          body: `${round.group.name}, round ${round.number}. Anything still unpaid after today becomes a debt.`,
        });
      });
      sent++;
    }
  }
  return { remindersSent: sent };
}

/** §15.1: the organizer nudges one member who hasn't fully paid this round. Once a day per member. */
export async function sendManualReminder(groupId: string, organizerUserId: string, slotId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    const round = await tx.round.findFirst({ where: { groupId, status: "OPEN" } });
    if (!round) throw conflict("No contribution period is open.", "NO_OPEN_PERIOD");
    const slot = await tx.slot.findFirst({ where: { id: slotId, groupId }, include: { user: true } });
    if (!slot) throw notFound("Slot");
    if (!slot.userId || slot.userId === organizerUserId) throw conflict("Only members with an account can be reminded.", "NO_ACCOUNT");
    const { approved } = await periodTotals(tx, slot.id, round.id);
    const unpaid = Number(group.contribution) - approved;
    if (unpaid <= 0) throw conflict(`${slotName(slot)} is already paid up.`, "PAID");
    const recent = await tx.reminderSent.findFirst({
      where: { roundId: round.id, slotId, kind: "MANUAL", sentAt: { gt: new Date(Date.now() - 24 * 3_600_000) } },
    });
    if (recent) throw conflict(`You reminded ${slotName(slot)} in the last day already.`, "ALREADY_REMINDED");
    await tx.reminderSent.create({ data: { roundId: round.id, slotId, kind: "MANUAL" } });
    await notifyUsers(tx, [slot.userId], {
      groupId,
      kind: "reminder.manual",
      title: `Reminder from ${group.name}: ${formatPeso(unpaid)} to pay`,
      body: `Round ${round.number} pays out on ${formatDisplayDate(round.payoutDate)}. The organizer sent this reminder.`,
    });
    await audit(tx, {
      groupId,
      actorUserId: organizerUserId,
      action: "reminder.sent",
      targetSlotId: slot.id,
      targetName: slotName(slot),
      amounts: { unpaid },
      after: { round: round.number },
    });
  });
}

/** When each slot was last reminded this round, for the organizer's "Reminded" label. */
export async function lastRemindedAt(roundId: string) {
  const rows = await prisma.reminderSent.groupBy({ by: ["slotId"], where: { roundId, kind: "MANUAL" }, _max: { sentAt: true } });
  return new Map(rows.map((r) => [r.slotId, r._max.sentAt?.toISOString() ?? null]));
}
