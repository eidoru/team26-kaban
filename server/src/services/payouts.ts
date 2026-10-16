import { outstanding } from "../domain/debt.js";
import { formatPeso } from "../domain/money.js";
import { processPayout } from "../domain/payout.js";
import { audit } from "../lib/audit.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isProofPathFor, proofExists } from "../lib/storage.js";
import { fromCalendarDate, todayInManila } from "../lib/today.js";
import { debtOf, groupHasDebt, recordDebtChange } from "./debts.js";
import { expireDisputes } from "./disputes.js";
import { notifyUsers } from "./notifications.js";
import { periodTotals } from "./submissions.js";
import { memberUserIds, slotName, withGroupLock, type Db } from "./common.js";

/**
 * §7 on payout date k, for the open round of one group:
 *  1. close Contribution Period k (approved money only; pending stays queued, R-DEC-04);
 *  2. the organizer covers every non-recipient's shortfall, which becomes debt with interest (§8);
 *  3–4. the recipient's own shortfall and whole debt come out of the pot (R-PAY-03/04, R-DEC-10);
 *  6. Period k+1 opens, or the paluwagan completes (R-CMP-01).
 * `actorUserId` is null for the scheduled run, or the organizer for the demo tool.
 */
export async function closeOpenRound(groupId: string, actorUserId: string | null) {
  return withGroupLock(groupId, async (tx, group) => {
    if (group.state !== "ACTIVE") throw conflict("Only a running paluwagan has a period to close.", "WRONG_STATE");
    const round = await tx.round.findFirst({ where: { groupId, status: "OPEN" } });
    if (!round) throw conflict("No contribution period is open.", "NO_OPEN_PERIOD");
    // R-DEC-21: unresolved disputes don't hold up the payout; the approved amounts stand.
    await expireDisputes(tx, groupId, round.id, round.number);
    const slots = await tx.slot.findMany({ where: { groupId }, include: { user: true } });
    const contribution = Number(group.contribution);

    const members = await Promise.all(
      slots.map(async (slot) => ({
        id: slot.id,
        isOrganizer: slot.isOrganizer,
        approved: (await periodTotals(tx, slot.id, round.id)).approved,
        debt: debtOf(slot),
      })),
    );
    const result = processPayout({
      contribution,
      pot: Number(group.pot),
      rate: group.interestRate,
      recipientId: round.recipientSlotId,
      members,
    });
    const slotById = new Map(slots.map((s) => [s.id, s]));
    const approvedById = new Map(members.map((m) => [m.id, m.approved]));

    // Step 2: everyone but the recipient. Existing principal is charged first (R-DBT-03), then any
    // new shortfall becomes debt with its own charge (R-DBT-01/02). The organizer owes no one (R-DEC-11).
    for (const outcome of result.others) {
      const slot = slotById.get(outcome.id)!;
      await tx.roundSlotResult.create({
        data: {
          roundId: round.id,
          slotId: slot.id,
          due: BigInt(contribution),
          approved: BigInt(approvedById.get(slot.id)!),
          shortfall: BigInt(outcome.shortfall),
          coveredByOrganizer: BigInt(outcome.coveredByOrganizer),
        },
      });
      if (outcome.periodInterest > 0) {
        await recordDebtChange(tx, {
          groupId,
          slotId: slot.id,
          kind: "INTEREST_CHARGED",
          principalDelta: 0,
          interestDelta: outcome.periodInterest,
          roundId: round.id,
        });
        await audit(tx, {
          groupId,
          actorUserId: null,
          action: "debt.interest_charged",
          targetSlotId: slot.id,
          targetName: slotName(slot),
          amounts: { interest: outcome.periodInterest, principal: Number(slot.debtPrincipal) },
          after: { round: round.number },
        });
      }
      if (outcome.shortfall > 0 && !slot.isOrganizer) {
        await recordDebtChange(tx, {
          groupId,
          slotId: slot.id,
          kind: "SHORTFALL_COVERED",
          principalDelta: outcome.shortfall,
          interestDelta: outcome.newDebtInterest,
          roundId: round.id,
        });
        await audit(tx, {
          groupId,
          actorUserId: null,
          action: "debt.created",
          targetSlotId: slot.id,
          targetName: slotName(slot),
          amounts: { shortfall: outcome.shortfall, interest: outcome.newDebtInterest },
          after: { round: round.number },
        });
      }
      const charged = outcome.periodInterest + (slot.isOrganizer ? 0 : outcome.newDebtInterest);
      if (slot.userId && !slot.isOrganizer && (outcome.shortfall > 0 || charged > 0)) {
        await notifyUsers(tx, [slot.userId], {
          groupId,
          kind: outcome.shortfall > 0 ? "debt.created" : "debt.interest",
          title:
            outcome.shortfall > 0
              ? `You were ${formatPeso(outcome.shortfall)} short in round ${round.number}`
              : `Interest of ${formatPeso(outcome.periodInterest)} was added`,
          body: `${outcome.shortfall > 0 ? "The organizer covered it so the pot stayed whole. " : ""}You now owe ${formatPeso(outstanding(outcome.debt))}${charged > 0 ? `, including ${formatPeso(charged)} interest this round` : ""}.`,
        });
      }
    }

    // Steps 3–4: the recipient.
    const recipient = slotById.get(result.recipient.id)!;
    const { ownShortfall, debtDeducted, netPayout } = result.recipient;
    await tx.roundSlotResult.create({
      data: {
        roundId: round.id,
        slotId: recipient.id,
        due: BigInt(contribution),
        approved: BigInt(approvedById.get(recipient.id)!),
        shortfall: BigInt(ownShortfall),
        coveredByOrganizer: 0n,
      },
    });
    if (debtDeducted.interest + debtDeducted.principal > 0) {
      await recordDebtChange(tx, {
        groupId,
        slotId: recipient.id,
        kind: "PAYOUT_DEDUCTION",
        principalDelta: -debtDeducted.principal,
        interestDelta: -debtDeducted.interest,
        roundId: round.id,
      });
      await audit(tx, {
        groupId,
        actorUserId: null,
        action: "debt.deducted",
        targetSlotId: recipient.id,
        targetName: slotName(recipient),
        amounts: { interest: debtDeducted.interest, principal: debtDeducted.principal },
        after: { round: round.number },
      });
    }
    // R-DEC-20: nothing to hand over means nothing to confirm.
    const nothingToHand = netPayout === 0;
    await tx.payout.create({
      data: {
        roundId: round.id,
        gross: group.pot,
        ownShortfall: BigInt(ownShortfall),
        interestDeducted: BigInt(debtDeducted.interest),
        principalDeducted: BigInt(debtDeducted.principal),
        net: BigInt(netPayout),
        status: nothingToHand ? "CONFIRMED" : "AWAITING_HANDOVER",
        confirmedAt: nothingToHand ? new Date() : null,
        autoConfirmed: nothingToHand,
      },
    });
    await tx.round.update({ where: { id: round.id }, data: { status: "CLOSED", closedAt: new Date() } });
    await audit(tx, {
      groupId,
      actorUserId,
      action: "payout.processed",
      targetSlotId: recipient.id,
      targetName: slotName(recipient),
      amounts: {
        pot: Number(group.pot),
        ownShortfall,
        interestDeducted: debtDeducted.interest,
        principalDeducted: debtDeducted.principal,
        net: netPayout,
        coveredByOrganizer: result.organizerCovered,
      },
      after: { round: round.number },
    });
    await notifyUsers(tx, [recipient.userId ?? group.organizerId], {
      groupId,
      kind: "payout.ready",
      title: recipient.userId
        ? `Round ${round.number}'s payout is yours: ${formatPeso(netPayout)}`
        : `Hand ${formatPeso(netPayout)} to ${slotName(recipient)}`,
      body:
        ownShortfall + debtDeducted.interest + debtDeducted.principal > 0
          ? `${formatPeso(Number(group.pot))} pot, less ${formatPeso(ownShortfall + debtDeducted.interest + debtDeducted.principal)} you owed.`
          : `The full ${formatPeso(Number(group.pot))} pot.`,
    });
    if (recipient.userId && recipient.userId !== group.organizerId && netPayout > 0) {
      await notifyUsers(tx, [group.organizerId], {
        groupId,
        kind: "payout.ready",
        title: `Hand ${formatPeso(netPayout)} to ${slotName(recipient)}`,
        body: `Round ${round.number} closed. Mark it handed over once they have it.`,
      });
    }

    // Step 6.
    const next = await tx.round.findUnique({ where: { groupId_number: { groupId, number: round.number + 1 } } });
    if (next) {
      await tx.round.update({ where: { id: next.id }, data: { status: "OPEN" } });
      await audit(tx, { groupId, actorUserId: null, action: "round.opened", after: { round: next.number } });
      await notifyUsers(tx, await memberUserIds(tx, groupId), {
        groupId,
        kind: "period.opened",
        title: `${group.name}: round ${next.number} is open`,
        body: `Contributions of ${formatPeso(contribution)} are due by ${next.payoutDate.toISOString().slice(0, 10)}.`,
      });
      return { closed: round.number, completed: false };
    }
    const owing = await groupHasDebt(tx, groupId);
    await tx.group.update({
      where: { id: groupId },
      data: { state: owing ? "COMPLETED_WITH_OUTSTANDING_DEBT" : "COMPLETED", completedAt: new Date() },
    });
    await audit(tx, { groupId, actorUserId: null, action: "group.completed", after: { outstandingDebt: owing } });
    await notifyUsers(tx, await memberUserIds(tx, groupId), {
      groupId,
      kind: "group.completed",
      title: `${group.name} is complete`,
      body: owing ? "Every payout is done. Some debts are still open." : "Every payout is done, and nobody owes anything.",
    });
    return { closed: round.number, completed: true };
  });
}

/**
 * The scheduled run (R-DEC-18): close every open round whose payout date has fully passed, one
 * round at a time, so a group that missed runs catches up in order. Safe to run repeatedly.
 */
export async function closeDueRounds(today = todayInManila()) {
  let closed = 0;
  const failed: string[] = [];
  for (;;) {
    const due = await prisma.round.findMany({
      where: {
        status: "OPEN",
        payoutDate: { lt: fromCalendarDate(today) },
        group: { state: "ACTIVE" },
        groupId: { notIn: failed },
      },
      select: { groupId: true },
    });
    if (due.length === 0) return { closed, failed: failed.length };
    for (const { groupId } of due) {
      try {
        await closeOpenRound(groupId, null);
        closed++;
      } catch (err) {
        // Skip it for the rest of this run; the next run tries again.
        console.error(`Closing a round in ${groupId} failed`, err);
        failed.push(groupId);
      }
    }
  }
}

async function payoutFor(db: Db, groupId: string, roundNumber: number) {
  const round = await db.round.findUnique({
    where: { groupId_number: { groupId, number: roundNumber } },
    include: { payout: true, recipient: { include: { user: true } } },
  });
  if (!round?.payout) throw notFound("Payout");
  return round as typeof round & { payout: NonNullable<typeof round.payout> };
}

/** R-PAY-05: the organizer records that the money was handed over, optionally with proof. */
export async function markHandedOver(groupId: string, organizerUserId: string, roundNumber: number, proofPath?: string) {
  if (proofPath) {
    if (!isProofPathFor(groupId, proofPath)) throw badRequest("That proof doesn't belong to this paluwagan.");
    if (!(await proofExists(proofPath))) throw badRequest("The proof didn't finish uploading. Attach it again.");
  }
  return withGroupLock(groupId, async (tx, group) => {
    const round = await payoutFor(tx, groupId, roundNumber);
    if (round.payout.status !== "AWAITING_HANDOVER") throw conflict("This payout was already handed over.", "ALREADY_DONE");
    const placeholder = !round.recipient.userId;
    // A placeholder can't confirm, so the organizer's handover is also the receipt (R-PAY-05). When
    // the organizer is the recipient they already hold the pot: taking it is the receipt too.
    const selfReceipt = placeholder || round.recipient.userId === organizerUserId;
    await tx.payout.update({
      where: { id: round.payout.id },
      data: {
        status: selfReceipt ? "CONFIRMED" : "HANDED_OVER",
        handedOverAt: new Date(),
        handedOverById: organizerUserId,
        proofPath: proofPath ?? null,
        ...(selfReceipt ? { confirmedAt: new Date(), confirmedById: organizerUserId } : {}),
      },
    });
    await audit(tx, {
      groupId,
      actorUserId: organizerUserId,
      action: "payout.handed_over",
      targetSlotId: round.recipientSlotId,
      targetName: slotName(round.recipient),
      amounts: { net: Number(round.payout.net) },
      after: { round: roundNumber, confirmedForPlaceholder: placeholder, organizerOwnPayout: selfReceipt && !placeholder },
      proofAttached: !!proofPath,
    });
    if (round.recipient.userId && round.recipient.userId !== organizerUserId) {
      await notifyUsers(tx, [round.recipient.userId], {
        groupId,
        kind: "payout.handed_over",
        title: `Did you get ${formatPeso(Number(round.payout.net))}?`,
        body: `${group.name}'s organizer says round ${roundNumber}'s payout was handed to you. Confirm once you have it.`,
      });
    }
  });
}

/** R-PAY-05: the recipient confirms they received it. The organizer confirms for a placeholder. */
export async function confirmReceipt(groupId: string, userId: string, roundNumber: number) {
  return withGroupLock(groupId, async (tx, group) => {
    const round = await payoutFor(tx, groupId, roundNumber);
    const isRecipient = round.recipient.userId === userId;
    if (!isRecipient && !(group.organizerId === userId && !round.recipient.userId)) {
      throw forbidden("Only the person who received it can confirm.");
    }
    if (round.payout.status === "CONFIRMED") throw conflict("This payout is already confirmed.", "ALREADY_DONE");
    if (round.payout.status !== "HANDED_OVER") throw conflict("The organizer hasn't marked it handed over yet.", "NOT_HANDED_OVER");
    await tx.payout.update({
      where: { id: round.payout.id },
      data: { status: "CONFIRMED", confirmedAt: new Date(), confirmedById: userId },
    });
    await audit(tx, {
      groupId,
      actorUserId: userId,
      action: "payout.confirmed",
      targetSlotId: round.recipientSlotId,
      targetName: slotName(round.recipient),
      amounts: { net: Number(round.payout.net) },
      after: { round: roundNumber },
    });
  });
}
