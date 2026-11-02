import { randomUUID } from "node:crypto";
import type { Group, Slot, Withdrawal } from "@prisma/client";
import { DISPUTE_REASON_MAX_LENGTH, NOTE_MAX_LENGTH, WITHDRAWAL_REQUEST_EXPIRY_DAYS } from "../domain/constants.js";
import { outstanding } from "../domain/debt.js";
import { can } from "../domain/lifecycle.js";
import { formatPeso } from "../domain/money.js";
import { proofError } from "../domain/submissions.js";
import { TERMS_NOT_ACCEPTED } from "../domain/terms.js";
import { acceptanceStale, leaveBlocker, leaveTodos, replacementBlocker, type Audience } from "../domain/withdrawals.js";
import { audit } from "../lib/audit.js";
import { formatDisplayDate } from "../lib/dates.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { isProofPathFor, proofExists, proofViewUrls } from "../lib/storage.js";
import { todayInManila, toCalendarDate } from "../lib/today.js";
import { debtOf, debtsOwedBy } from "./debts.js";
import { publicSummary } from "./groups.js";
import { notifyUsers } from "./notifications.js";
import { periodTotals } from "./submissions.js";
import { memberUserIds, slotName, withGroupLock, type Db } from "./common.js";

/** R-WDR-06: a request that can still go somewhere. */
export const OPEN_WITHDRAWAL = ["AWAITING_REPLACEMENT", "AWAITING_ORGANIZER"] as const;
const isOpen = (w: Withdrawal) => (OPEN_WITHDRAWAL as readonly string[]).includes(w.status);

type SlotWithUser = Slot & { user: { displayName: string } | null };

/** The slot's payout turn, or null before the order exists. */
async function turnOf(db: Db, groupId: string, slotId: string) {
  const round = await db.round.findFirst({ where: { groupId, recipientSlotId: slotId } });
  if (!round) return null;
  return {
    number: round.number,
    paidOut: round.status === "CLOSED",
    isOpenRound: round.status === "OPEN",
    payoutDate: toCalendarDate(round.payoutDate),
  };
}

/**
 * Everything R-WDR-02/03 look at for one slot: its turn, what's still waiting on it, and the approved
 * payments for the open and later rounds that would go with it (or be asked back first).
 */
async function standingOf(db: Db, group: Group, slot: Slot, who: Audience = "leaver") {
  const [turn, pending, pendingReports, swap, ahead, contributed] = await Promise.all([
    turnOf(db, group.id, slot.id),
    db.submission.findMany({ where: { slotId: slot.id, status: "PENDING" }, select: { id: true, batchId: true } }),
    db.dispute.count({ where: { slotId: slot.id, status: "PENDING" } }),
    db.swap.findFirst({
      where: {
        groupId: group.id,
        status: { in: ["AWAITING_TARGET", "AWAITING_ORGANIZER"] },
        OR: [{ requesterSlotId: slot.id }, { targetSlotId: slot.id }],
      },
      select: { id: true },
    }),
    db.submission.findMany({
      where: { slotId: slot.id, status: "APPROVED", appliedAs: "CONTRIBUTION", round: { status: { in: ["OPEN", "UPCOMING"] } } },
      include: { round: { select: { number: true } } },
      orderBy: [{ round: { number: "asc" } }, { submittedAt: "asc" }],
    }),
    db.submission.findMany({
      where: { slotId: slot.id, status: "APPROVED", appliedAs: "CONTRIBUTION" },
      select: { amount: true, effectiveAmount: true },
    }),
  ]);
  const amountOf = (s: { amount: bigint; effectiveAmount: bigint | null }) => Number(s.effectiveAmount ?? s.amount);
  // R-DEC-33: a payment split across rounds is one payment to wait for.
  const pendingPayments = new Set(pending.map((s) => s.batchId ?? s.id)).size;
  // A payment already corrected to ₱0 (asked back, R-WDR-04) has nothing left to decide.
  const aheadPayments = ahead
    .map((s) => ({ submissionId: s.id, round: s.round!.number, amount: amountOf(s) }))
    .filter((p) => p.amount > 0);
  const blocker = leaveBlocker(
    { state: group.state, isOrganizer: slot.isOrganizer, isPlaceholder: !slot.userId, turn },
    todayInManila(),
    who,
  );
  return {
    turn,
    blocker,
    todos: leaveTodos({ pendingPayments, pendingReports, swapInProgress: !!swap }, who),
    aheadPayments,
    leftAhead: aheadPayments.reduce((t, p) => t + p.amount, 0),
    contributed: contributed.reduce((t, s) => t + amountOf(s), 0),
  };
}

/** The first reason the slot can't change hands now (R-WDR-02, R-WDR-03), as a 409. */
async function assertCanHandOver(db: Db, group: Group, slot: Slot, who: Audience) {
  const standing = await standingOf(db, group, slot, who);
  if (standing.blocker) throw conflict(standing.blocker, "CANT_LEAVE");
  if (standing.todos.length > 0) throw conflict(standing.todos[0], "LEAVE_TODOS");
  return standing;
}

/** R-WDR-07 for one user and this group. `except` is the request they're answering. */
async function assertCanReplace(db: Db, groupId: string, userId: string, except: string) {
  const [isMember, other, debts] = await Promise.all([
    db.slot.count({ where: { groupId, userId } }),
    db.withdrawal.count({
      where: { groupId, replacementUserId: userId, status: { in: [...OPEN_WITHDRAWAL] }, id: { not: except } },
    }),
    debtsOwedBy(db, userId),
  ]);
  const blocker = replacementBlocker({ isMember: isMember > 0, replacingAnother: other > 0, debts });
  if (blocker) throw conflict(blocker, debts.length > 0 ? "IN_DEBT" : "CANT_REPLACE");
}

function requiredText(text: string, max: number, missing: string, label: string) {
  const value = text.trim();
  if (!value) throw badRequest(missing);
  if (value.length > max) throw badRequest(`${label} can be up to ${max} characters.`);
  return value;
}

/** The daily job expires requests (R-WDR-11); this covers the hours before it runs. */
function assertNotExpired(w: Withdrawal) {
  if (w.expiresAt && w.expiresAt < new Date()) throw conflict("This request has expired.", "EXPIRED");
}

const expiryFrom = (now: Date) =>
  WITHDRAWAL_REQUEST_EXPIRY_DAYS === null ? null : new Date(now.getTime() + WITHDRAWAL_REQUEST_EXPIRY_DAYS * 86_400_000);

/**
 * R-WDR-03, R-WDR-06: send the request once every to-do is done. `leftAhead` is what the leaver saw
 * and agreed to leave to the replacement; if it changed since, they look again.
 */
export async function requestWithdrawal(
  groupId: string,
  userId: string,
  input: { reason: string; proofPath?: string; leftAhead: number },
) {
  const reason = requiredText(input.reason, DISPUTE_REASON_MAX_LENGTH, "Say why you're leaving.", "The reason");
  const missingProof = proofError(!!input.proofPath);
  if (missingProof) throw badRequest(missingProof, "PROOF_REQUIRED");
  if (!isProofPathFor(groupId, input.proofPath!)) throw badRequest("That proof doesn't belong to this paluwagan.");
  if (!(await proofExists(input.proofPath!))) throw badRequest("The proof didn't finish uploading. Attach it again.");

  return withGroupLock(groupId, async (tx, group) => {
    const slot = await tx.slot.findFirstOrThrow({ where: { groupId, userId }, include: { user: true } });
    const open = await tx.withdrawal.findFirst({ where: { slotId: slot.id, status: { in: [...OPEN_WITHDRAWAL] } } });
    if (open) throw conflict("You already asked to leave. Cancel that request to start over.", "ALREADY_LEAVING");
    const standing = await assertCanHandOver(tx, group, slot, "leaver");
    if (standing.leftAhead !== input.leftAhead) {
      throw conflict(
        `Your payments for this and later rounds are now ${formatPeso(standing.leftAhead)}. Check them again.`,
        "AHEAD_CHANGED",
      );
    }
    const now = new Date();
    const withdrawal = await tx.withdrawal.create({
      data: {
        groupId,
        slotId: slot.id,
        leaverUserId: userId,
        reason,
        proofPath: input.proofPath!,
        leftAhead: BigInt(standing.leftAhead),
        expiresAt: expiryFrom(now),
      },
    });
    // The reason and proof stay off the public log (R-WDR-06, R-AUD-03).
    await audit(tx, {
      groupId,
      actorUserId: userId,
      action: "withdrawal.requested",
      targetSlotId: slot.id,
      targetName: slotName(slot),
      amounts: { leftAhead: standing.leftAhead, debt: outstanding(debtOf(slot)) },
      proofAttached: true,
    });
    return withdrawal;
  });
}

/** R-WDR-11: the leaver can call it off any time before approval. */
export async function cancelWithdrawal(groupId: string, userId: string, withdrawalId: string) {
  return withGroupLock(groupId, async (tx, group) => {
    const w = await tx.withdrawal.findFirst({ where: { id: withdrawalId, groupId }, include: { slot: { include: { user: true } } } });
    if (!w) throw notFound("Request");
    if (w.leaverUserId !== userId) throw forbidden("Only the member leaving can cancel it.");
    if (!isOpen(w)) throw conflict("This request is already settled.", "WRONG_STATUS");
    await tx.withdrawal.update({ where: { id: w.id }, data: { status: "CANCELLED", reviewedAt: new Date() } });
    await audit(tx, {
      groupId,
      actorUserId: userId,
      action: "withdrawal.cancelled",
      targetSlotId: w.slotId,
      targetName: slotName(w.slot),
    });
    const message = {
      groupId,
      kind: "withdrawal.cancelled" as const,
      title: `${slotName(w.slot)} is staying in ${group.name}`,
      body: "They cancelled their request to leave.",
    };
    if (w.status === "AWAITING_ORGANIZER") await notifyUsers(tx, [group.organizerId], message);
    // Not a member, so their link goes home rather than to a group page they can't open.
    await notifyUsers(tx, [w.replacementUserId], { ...message, link: "/home" });
  });
}

async function liveRequest(token: string) {
  const w = await prisma.withdrawal.findUnique({ where: { token } });
  if (!w) throw notFound("Replacement link");
  return w;
}

export type ReplacementStatus =
  | "OPEN"
  | "ACCEPTED"
  | "TAKEN"
  | "CLOSED"
  | "ALREADY_MEMBER"
  | "REPLACING_ANOTHER"
  | "IN_DEBT";

/**
 * R-WDR-07: the replacement link's landing page. Guests see only the group; signed-in visitors see
 * the slot's whole record and the terms, since they'd inherit all of it (R-WDR-05, R-CLM-05).
 */
export async function getReplacement(token: string, userId: string | undefined) {
  const w = await liveRequest(token);
  const [group, slot] = await Promise.all([
    prisma.group.findUniqueOrThrow({
      where: { id: w.groupId },
      include: { organizer: { select: { displayName: true } }, slots: { select: { id: true } } },
    }),
    prisma.slot.findUniqueOrThrow({ where: { id: w.slotId }, include: { user: true } }),
  ]);
  const [isMember, replacingAnother, debts] = userId
    ? await Promise.all([
        prisma.slot.count({ where: { groupId: group.id, userId } }),
        prisma.withdrawal.count({
          where: { groupId: group.id, replacementUserId: userId, status: { in: [...OPEN_WITHDRAWAL] }, id: { not: w.id } },
        }),
        debtsOwedBy(prisma, userId),
      ])
    : [0, 0, []];
  const reservedForOther = !!w.replacementUserId && w.replacementUserId !== userId;
  const status: ReplacementStatus = !isOpen(w)
    ? "CLOSED"
    : w.status === "AWAITING_ORGANIZER" && w.replacementUserId === userId
      ? "ACCEPTED"
      : reservedForOther
        ? "TAKEN"
        : isMember > 0
          ? "ALREADY_MEMBER"
          : replacingAnother > 0
            ? "REPLACING_ANOTHER"
            : debts.length > 0
              ? "IN_DEBT"
              : "OPEN";

  return {
    status,
    /** Waiting for this viewer to accept again after the slot's debt grew (R-WDR-10). */
    reaccept: status === "OPEN" && w.replacementUserId === userId && !!userId,
    group: publicSummary(group, group.slots.length),
    leaverName: slotName(slot),
    record: userId ? await slotRecord(prisma, group, slot) : null,
    terms: userId ? group.terms : null,
    debts: status === "IN_DEBT" ? debts : [],
    expiresAt: w.expiresAt?.toISOString() ?? null,
  };
}

/** R-WDR-07: what the replacement would take on, in centavos. */
async function slotRecord(db: Db, group: Group, slot: Slot) {
  const [{ turn, leftAhead, contributed }, results, open] = await Promise.all([
    standingOf(db, group, slot),
    db.roundSlotResult.findMany({ where: { slotId: slot.id }, include: { round: { select: { number: true } } } }),
    db.round.findFirst({ where: { groupId: group.id, status: "OPEN" } }),
  ]);
  const thisRound = open ? await periodTotals(db, slot.id, open.id) : null;
  return {
    turn: turn && { round: turn.number, payoutDate: turn.payoutDate },
    contributed,
    rounds: results
      .map((r) => ({ round: r.round.number, due: Number(r.due), paid: Number(r.approved), shortfall: Number(r.shortfall) }))
      .sort((a, b) => a.round - b.round),
    openRound: open && thisRound && {
      round: open.number,
      payoutDate: toCalendarDate(open.payoutDate),
      unpaid: Math.max(0, Number(group.contribution) - thisRound.approved),
    },
    leftAhead,
    debt: { principal: Number(slot.debtPrincipal), interest: Number(slot.debtInterest) },
  };
}

/**
 * R-WDR-07: the replacement agrees to the terms and accepts; the request goes to the organizer.
 * Re-checks the slot (R-WDR-02/03) and the person (R-WDR-07); the terms are kept in the audit entry
 * (R-DEC-38).
 */
export async function acceptReplacement(token: string, userId: string, acceptTerms: boolean) {
  const found = await liveRequest(token);
  return withGroupLock(found.groupId, async (tx, group) => {
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: found.id }, include: { slot: { include: { user: true } } } });
    if (w.token !== token) throw notFound("Replacement link");
    if (w.status !== "AWAITING_REPLACEMENT") throw conflict("This request isn't looking for a replacement anymore.", "WRONG_STATUS");
    if (w.replacementUserId && w.replacementUserId !== userId) throw conflict("Someone else is stepping in.", "TAKEN");
    assertNotExpired(w);
    await assertCanReplace(tx, group.id, userId, w.id);
    await assertCanHandOver(tx, group, w.slot, "other");
    if (!acceptTerms) throw badRequest(TERMS_NOT_ACCEPTED, "TERMS_NOT_ACCEPTED");

    const debt = outstanding(debtOf(w.slot));
    await tx.withdrawal.update({
      where: { id: w.id },
      data: { status: "AWAITING_ORGANIZER", replacementUserId: userId, acceptedAt: new Date(), acceptedDebt: BigInt(debt) },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await audit(tx, {
      groupId: group.id,
      actorUserId: userId,
      action: "withdrawal.accepted",
      targetSlotId: w.slotId,
      targetName: slotName(w.slot),
      amounts: { debt, leftAhead: Number(w.leftAhead) },
      after: { name: user.displayName, termsAccepted: true, terms: group.terms },
    });
    await notifyUsers(tx, [w.leaverUserId], {
      groupId: group.id,
      kind: "withdrawal.accepted",
      title: `${user.displayName} agreed to take your slot`,
      body: "The organizer approves it next.",
    });
    await notifyUsers(tx, [group.organizerId], {
      groupId: group.id,
      kind: "withdrawal.awaiting_approval",
      title: `${slotName(w.slot)} wants to hand their slot to ${user.displayName}`,
      body: "They both agreed. Review the request to approve or reject it.",
    });
    return { groupId: group.id };
  });
}

/**
 * R-WDR-08: the person with the link declines, or the replacement backs out before approval. The
 * request looks for someone else with a new link; the old one stops working.
 */
export async function declineReplacement(token: string, userId: string) {
  const found = await liveRequest(token);
  return withGroupLock(found.groupId, async (tx, group) => {
    const w = await tx.withdrawal.findUniqueOrThrow({ where: { id: found.id }, include: { slot: { include: { user: true } } } });
    if (w.token !== token || !isOpen(w)) throw conflict("This request isn't open anymore.", "WRONG_STATUS");
    if (w.replacementUserId && w.replacementUserId !== userId) throw forbidden("Someone else is stepping in.");
    if (w.leaverUserId === userId) throw forbidden("Cancel your request instead.");
    const wasAccepted = w.status === "AWAITING_ORGANIZER";
    await tx.withdrawal.update({
      where: { id: w.id },
      data: {
        status: "AWAITING_REPLACEMENT",
        token: randomUUID(),
        replacementUserId: null,
        acceptedAt: null,
        acceptedDebt: null,
      },
    });
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await audit(tx, {
      groupId: group.id,
      actorUserId: userId,
      action: "withdrawal.declined",
      targetSlotId: w.slotId,
      targetName: slotName(w.slot),
      after: { backedOut: wasAccepted },
    });
    await notifyUsers(tx, [w.leaverUserId, wasAccepted ? group.organizerId : null], {
      groupId: group.id,
      kind: "withdrawal.declined",
      title: wasAccepted
        ? `${user.displayName} backed out of taking ${slotName(w.slot)}'s slot`
        : `${user.displayName} declined to take your slot`,
      body: "The request needs someone else. A new replacement link is ready to share.",
    });
    return { groupId: group.id };
  });
}

/**
 * R-WDR-09: the organizer approves (after re-checking every rule) or rejects with a reason. Approval
 * hands the slot over in this one transaction: everything tied to the slot stays with it (R-CLM-06),
 * so the replacement inherits turn, history, payments ahead and debt, and the leaver loses access.
 */
export async function reviewWithdrawal(
  groupId: string,
  organizerUserId: string,
  withdrawalId: string,
  decision: { approve: true } | { approve: false; note: string },
) {
  // `=== false`, not truthiness: Vercel compiles the function non-strict, where only this narrows the union.
  const note =
    decision.approve === false
      ? requiredText(decision.note, NOTE_MAX_LENGTH, "Say why, so they understand.", "The reason")
      : null;
  return withGroupLock(groupId, async (tx, group) => {
    const w = await tx.withdrawal.findFirst({
      where: { id: withdrawalId, groupId },
      include: { slot: { include: { user: true } }, replacement: true },
    });
    if (!w) throw notFound("Request");
    if (w.status !== "AWAITING_ORGANIZER" || !w.replacement) {
      throw conflict("This request isn't waiting for your approval.", "WRONG_STATUS");
    }
    const leaverName = slotName(w.slot);
    const replacement = w.replacement;
    if (w.slot.userId !== w.leaverUserId) throw conflict("This slot has already changed hands.", "WRONG_STATUS");

    if (!decision.approve) {
      await tx.withdrawal.update({ where: { id: w.id }, data: { status: "REJECTED", reviewedAt: new Date(), reviewNote: note } });
      await audit(tx, {
        groupId,
        actorUserId: organizerUserId,
        action: "withdrawal.rejected",
        targetSlotId: w.slotId,
        targetName: leaverName,
      });
      await notifyUsers(tx, [w.leaverUserId], {
        groupId,
        kind: "withdrawal.rejected",
        title: "Your request to leave wasn't approved",
        body: `Reason: ${note}`,
      });
      await notifyUsers(tx, [replacement.id], {
        groupId,
        kind: "withdrawal.rejected",
        title: `You won't be taking ${leaverName}'s slot`,
        body: `The organizer didn't approve the hand-over in ${group.name}.`,
        link: "/home",
      });
      return;
    }

    assertNotExpired(w);
    await assertCanHandOver(tx, group, w.slot, "other");
    await assertCanReplace(tx, groupId, replacement.id, w.id);
    // R-WDR-10: the round close resets these, so this only catches a race with it.
    if (acceptanceStale(Number(w.acceptedDebt ?? 0), outstanding(debtOf(w.slot)))) {
      throw conflict(`${replacement.displayName} has to accept again: the slot's debt grew since they agreed.`, "ACCEPT_AGAIN");
    }
    const turn = await turnOf(tx, groupId, w.slotId);
    // The unique (group, user) index backs R-INV-07 here too.
    await tx.slot.update({ where: { id: w.slotId }, data: { userId: replacement.id } });
    await tx.withdrawal.update({ where: { id: w.id }, data: { status: "APPROVED", reviewedAt: new Date() } });
    await audit(tx, {
      groupId,
      actorUserId: organizerUserId,
      action: "withdrawal.approved",
      targetSlotId: w.slotId,
      targetName: replacement.displayName,
      amounts: { debt: outstanding(debtOf(w.slot)), leftAhead: Number(w.leftAhead) },
      before: { name: leaverName },
      after: { name: replacement.displayName, round: turn?.number },
    });
    await notifyUsers(tx, [w.leaverUserId], {
      groupId,
      kind: "withdrawal.approved",
      title: `You've left ${group.name}`,
      body: `${replacement.displayName} has your slot now.`,
      link: "/home",
    });
    await notifyUsers(tx, [replacement.id], {
      groupId,
      kind: "withdrawal.approved",
      title: `You're in ${group.name}`,
      body: turn ? `You get the pot in round ${turn.number}, on ${formatDisplayDate(turn.payoutDate)}.` : "The slot is yours.",
    });
    const others = (await memberUserIds(tx, groupId)).filter((id) => id !== replacement.id && id !== organizerUserId);
    await notifyUsers(tx, others, {
      groupId,
      kind: "withdrawal.approved",
      title: `${replacement.displayName} took ${leaverName}'s slot`,
      body: `In ${group.name}. The turn and its history carry over.`,
    });
  });
}

/** Expire one request with a reason, telling whoever is waiting on it. */
async function expire(db: Db, group: Group, w: Withdrawal & { slot: SlotWithUser }, reason: "paid out" | "timed out") {
  await db.withdrawal.update({ where: { id: w.id }, data: { status: "EXPIRED", reviewedAt: new Date() } });
  await audit(db, {
    groupId: group.id,
    actorUserId: null,
    action: "withdrawal.expired",
    targetSlotId: w.slotId,
    targetName: slotName(w.slot),
    after: { reason },
  });
  await notifyUsers(db, [w.leaverUserId], {
    groupId: group.id,
    kind: "withdrawal.expired",
    title: "Your request to leave expired",
    body:
      reason === "paid out"
        ? "Your payout happened first, so the slot stays yours."
        : "It wasn't settled in time. Start again to leave.",
  });
  await notifyUsers(db, [w.replacementUserId], {
    groupId: group.id,
    kind: "withdrawal.expired",
    title: `You won't be taking ${slotName(w.slot)}'s slot`,
    body: `Their request to leave ${group.name} expired.`,
    link: "/home",
  });
}

/** R-WDR-11: once a slot is paid out it can't change hands; its open request expires. */
export async function expireWithdrawalsFor(db: Db, group: Group, slotId: string) {
  const open = await db.withdrawal.findMany({
    where: { slotId, status: { in: [...OPEN_WITHDRAWAL] } },
    include: { slot: { include: { user: true } } },
  });
  for (const w of open) await expire(db, group, w, "paid out");
}

/**
 * R-WDR-10: after a round close, any accepted request whose slot now owes more goes back to its
 * replacement, who must accept again. The request stays reserved for them.
 */
export async function resetStaleAcceptances(db: Db, group: Group) {
  const accepted = await db.withdrawal.findMany({
    where: { groupId: group.id, status: "AWAITING_ORGANIZER" },
    include: { slot: { include: { user: true } } },
  });
  for (const w of accepted) {
    const debt = outstanding(debtOf(w.slot));
    if (!acceptanceStale(Number(w.acceptedDebt ?? 0), debt)) continue;
    await db.withdrawal.update({
      where: { id: w.id },
      data: { status: "AWAITING_REPLACEMENT", acceptedAt: null, acceptedDebt: null },
    });
    await audit(db, {
      groupId: group.id,
      actorUserId: null,
      action: "withdrawal.reset",
      targetSlotId: w.slotId,
      targetName: slotName(w.slot),
      amounts: { before: Number(w.acceptedDebt ?? 0), after: debt },
    });
    await notifyUsers(db, [w.replacementUserId], {
      groupId: group.id,
      kind: "withdrawal.reset",
      title: `Check ${slotName(w.slot)}'s slot again`,
      body: `Its debt is now ${formatPeso(debt)}. Accept again if you still want to take it.`,
      link: `/replace/${w.token}`,
    });
    await notifyUsers(db, [w.leaverUserId], {
      groupId: group.id,
      kind: "withdrawal.reset",
      title: "Your replacement has to accept again",
      body: `Your slot's debt grew to ${formatPeso(debt)}, so they're asked to look again.`,
    });
  }
}

/** R-WDR-11: open requests past their expiry. */
export async function expireStaleWithdrawals(now = new Date()) {
  const stale = await prisma.withdrawal.findMany({
    where: { status: { in: [...OPEN_WITHDRAWAL] }, expiresAt: { lt: now } },
    select: { id: true, groupId: true },
  });
  for (const { id, groupId } of stale) {
    await withGroupLock(groupId, async (tx, group) => {
      const w = await tx.withdrawal.findUniqueOrThrow({ where: { id }, include: { slot: { include: { user: true } } } });
      if (isOpen(w)) await expire(tx, group, w, "timed out");
    });
  }
  return { expiredWithdrawals: stale.length };
}

/**
 * For the group page: the viewer's own leaving check (members only, R-WDR-03) and the requests they
 * may see: all for the organizer, their own as leaver for a member. Reason and proof go to those two
 * only (R-WDR-06); the replacement's email to the organizer, to know who they're approving.
 */
export async function leavingView(db: Db, group: Group, viewer: Slot, appOrigin: string) {
  const isOrganizer = viewer.isOrganizer;
  const rows = await db.withdrawal.findMany({
    where: { groupId: group.id, ...(isOrganizer ? {} : { leaverUserId: viewer.userId! }) },
    include: {
      slot: { include: { user: true } },
      leaver: { select: { displayName: true } },
      replacement: { select: { displayName: true, email: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const urls = await proofViewUrls(rows.filter(isOpen).map((w) => w.proofPath)).catch(() => new Map<string, string>());
  const standings = new Map(
    await Promise.all(
      rows
        .filter(isOpen)
        .map(async (w) => [w.id, await standingOf(db, group, w.slot, w.leaverUserId === viewer.userId ? "leaver" : "other")] as const),
    ),
  );
  const withdrawals = rows.map((w) => {
    const standing = standings.get(w.id);
    const mine = w.leaverUserId === viewer.userId;
    return {
      id: w.id,
      slotId: w.slotId,
      leaverName: w.leaver.displayName,
      mine,
      status: w.status,
      reason: w.reason,
      proofUrl: isOpen(w) ? (urls.get(w.proofPath) ?? null) : null,
      leftAhead: Number(w.leftAhead),
      contributed: standing?.contributed ?? null,
      /** What still blocks approval, re-checked now (R-WDR-09). */
      blockers: standing ? [standing.blocker, ...standing.todos].filter((b): b is string => !!b) : [],
      replacement: w.replacement
        ? { name: w.replacement.displayName, email: isOrganizer ? w.replacement.email : null }
        : null,
      acceptedAt: w.acceptedAt?.toISOString() ?? null,
      acceptedDebt: w.acceptedDebt == null ? null : Number(w.acceptedDebt),
      createdAt: w.createdAt.toISOString(),
      expiresAt: w.expiresAt?.toISOString() ?? null,
      reviewNote: w.reviewNote,
      /** The leaver shares this while it looks for a replacement (R-WDR-06). */
      link: mine && w.status === "AWAITING_REPLACEMENT" ? `${appOrigin}/replace/${w.token}` : null,
    };
  });

  const canAsk = !isOrganizer && can.leave(group.state);
  const own = canAsk ? await standingOf(db, group, viewer) : null;
  return {
    withdrawals,
    leaving: own && {
      blocker: own.blocker,
      todos: own.todos,
      aheadPayments: own.aheadPayments,
      leftAhead: own.leftAhead,
      contributed: own.contributed,
    },
  };
}

/** R-WDR-12: who held each slot until when, oldest first, from the approved hand-overs. */
export async function handoversOf(db: Db, groupId: string) {
  const rows = await db.withdrawal.findMany({
    where: { groupId, status: "APPROVED" },
    include: { leaver: { select: { displayName: true } } },
    orderBy: { reviewedAt: "asc" },
  });
  return rows.map((w) => ({ slotId: w.slotId, until: w.reviewedAt!, name: w.leaver.displayName }));
}
