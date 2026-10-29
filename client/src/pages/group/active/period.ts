import { debtPaymentFee, feeOn, feeRateFor } from "@domain/fees";
import { contributionRooms, periodStatus, submissionCap } from "@domain/submissions";
import type { DisputeView, GroupDetail, PeriodSlot, SlotView, SubmissionView } from "../../../api/client";

/** Pending submissions in the order they came in, each part of a split payment on its own. */
function pendingPayments(detail: GroupDetail) {
  return detail.submissions
    .filter((s) => s.status === "PENDING")
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));
}

/**
 * A payment as the viewer sees it: a split payment's parts (R-DEC-33) taken together, under its
 * earliest round, with `amount` their total. `parts` is just the payment itself otherwise.
 */
export type Payment = SubmissionView & { parts: SubmissionView[] };

/** The parts of `payment`'s split payment, in round order; just `payment` when it isn't split (R-DEC-33). */
export function partsOf(detail: GroupDetail, payment: SubmissionView) {
  if (!payment.batchId) return [payment];
  return detail.submissions
    .filter((s) => s.batchId === payment.batchId)
    .sort((a, b) => (a.round ?? 0) - (b.round ?? 0));
}

/** `rows` with each split payment taken together (R-DEC-33), keeping the order of their first parts. */
export function asPayments(detail: GroupDetail, rows: SubmissionView[]): Payment[] {
  const seen = new Set<string>();
  return rows.flatMap((s) => {
    if (!s.batchId) return [{ ...s, parts: [s] }];
    if (seen.has(s.batchId)) return [];
    seen.add(s.batchId);
    const parts = partsOf(detail, s).filter((p) => p.status === s.status);
    return [{ ...parts[0], amount: parts.reduce((total, p) => total + p.amount, 0), parts }];
  });
}

/**
 * Pending payments in the order they came in: the order they must be reviewed in (R-SUB-05). A
 * split payment is one item, decided as one (R-DEC-33).
 */
export function reviewQueue(detail: GroupDetail) {
  return asPayments(detail, pendingPayments(detail));
}

/**
 * R-SUB-05: a slot's pending payments for the same round and type as `payment`, oldest first. The
 * server reviews each such stack in order, so only its first can be decided.
 */
export function stackOf(detail: GroupDetail, payment: SubmissionView): Payment[] {
  return reviewQueue(detail).filter(
    (s) => s.slotId === payment.slotId && s.round === payment.round && s.type === payment.type,
  );
}

/** The status of round `number` in the schedule, or null when there's no such round. */
function roundStatus(detail: GroupDetail, number: number | null) {
  return detail.schedule.find((r) => r.number === number)?.status ?? null;
}

/** R-DEC-31: whether a payment is for a round that hasn't opened yet, so it was paid ahead. */
export function isAhead(detail: GroupDetail, payment: Pick<SubmissionView, "type" | "round">) {
  return payment.type === "CONTRIBUTION" && roundStatus(detail, payment.round) === "UPCOMING";
}

/**
 * A slot's standing in a round that's open or still to come (the open one by default), plus what
 * can still be reported for it (R-SUB-06). Under the room rule (R-DEC-29), `waiting` is everything
 * that holds room until reviewed: pending payments and the increases pending corrections ask for.
 * An upcoming round's standing is what's been paid ahead for it (R-DEC-31).
 */
export function standingOf(detail: GroupDetail, slotId: string, round = detail.period?.number) {
  let standing: PeriodSlot | undefined;
  if (round != null && round === detail.period?.number) {
    standing = detail.period.slots.find((s) => s.slotId === slotId);
  } else if (round != null && detail.period && roundStatus(detail, round) === "UPCOMING") {
    const row = detail.ahead.find((a) => a.slotId === slotId && a.round === round);
    const due = detail.group.contribution;
    const approved = row?.approved ?? 0;
    const pending = row?.pending ?? 0;
    standing = {
      slotId,
      due,
      approved,
      pending,
      pendingIncrease: row?.pendingIncrease ?? 0,
      ...periodStatus(due, approved, pending > 0 ? 1 : 0),
      remindedAt: null,
      remindedRecently: false,
    };
  }
  if (!standing) return null;
  const waiting = standing.pending + standing.pendingIncrease;
  return { ...standing, waiting, reportable: submissionCap(standing.due, standing.approved, waiting) };
}

export function owedBy(detail: GroupDetail, slotId: string) {
  const slot = detail.slots.find((s) => s.id === slotId);
  return slot ? slot.debt.principal + slot.debt.interest : 0;
}

/**
 * Pending submissions that will land on a slot's debt once approved: debt payments, and
 * contributions for closed periods (R-DBT-06), not ones paid ahead (R-DEC-31). Oldest first, the
 * order they're reviewed in (R-SUB-05).
 */
export function pendingTowardDebt(detail: GroupDetail, slotId: string) {
  return pendingPayments(detail).filter(
    (s) => s.slotId === slotId && (s.type === "DEBT_PAYMENT" || roundStatus(detail, s.round) === "CLOSED"),
  );
}

/** What can still be reported toward a slot's debt (R-SUB-06 applied to debt): what it owes, less what's pending. */
export function debtReportable(detail: GroupDetail, slotId: string) {
  const pending = pendingTowardDebt(detail, slotId).reduce((total, s) => total + s.amount, 0);
  return submissionCap(owedBy(detail, slotId), 0, pending);
}

/** R-DEC-39: the organizing fee rate `slot` pays; the organizer pays none. */
export function feeRateOf(detail: GroupDetail, slot: SlotView) {
  return feeRateFor(slot.isOrganizer, detail.group.organizerFeeRate);
}

/**
 * R-DEC-39: the fee the server will record with a payment, worked out the same way: on each part of
 * a contribution, or on the principal part of a debt payment, after the interest pending debt
 * payments haven't covered.
 */
export function paymentFee(
  detail: GroupDetail,
  slot: SlotView,
  payment: { type: "CONTRIBUTION"; parts: { amount: number }[] } | { type: "DEBT_PAYMENT"; amount: number },
) {
  const rate = feeRateOf(detail, slot);
  if (rate === 0) return 0;
  if (payment.type === "CONTRIBUTION") return payment.parts.reduce((total, p) => total + feeOn(p.amount, rate), 0);
  const pending = pendingTowardDebt(detail, slot.id).reduce((total, s) => total + s.amount, 0);
  return debtPaymentFee(payment.amount, slot.debt.interest - pending, rate);
}

/**
 * R-DEC-39: the fee follows a corrected amount, as the server applies it on approval. `refundFee`
 * goes back with a refund; `extraFee` is owed on an increase.
 */
export function correctionFees(detail: GroupDetail, submission: SubmissionView, proposed: number) {
  const slot = detail.slots.find((s) => s.id === submission.slotId);
  const current = submission.effectiveAmount ?? submission.amount;
  const currentFee = submission.effectiveFee ?? submission.fee;
  const fee = slot ? feeOn(proposed, feeRateOf(detail, slot)) : currentFee;
  return {
    refundFee: proposed < current ? Math.max(0, currentFee - fee) : 0,
    extraFee: proposed > current ? Math.max(0, fee - currentFee) : 0,
  };
}

/** A payment's organizing fee, a split payment's parts added up (R-DEC-33, R-DEC-39). */
export function feeOfPayment(payment: Payment) {
  return payment.parts.reduce((total, p) => total + (p.effectiveFee ?? p.fee), 0);
}

/**
 * R-DEC-31 / R-DEC-33: the rounds a contribution for `slotId` would fill now, in order, as the
 * server works it out: what's left of the open round, then later rounds once the debt is covered.
 * `cap` is the most it can be; `ahead` the part of that beyond the open round; `blockedByDebt` says
 * paying ahead would be possible but for the debt.
 */
export function payRooms(detail: GroupDetail, slotId: string) {
  const open = detail.period;
  const none = { rooms: [], openRoom: 0, cap: 0, ahead: 0, blockedByDebt: false };
  if (!open || detail.group.state !== "ACTIVE") return none;
  const openRoom = standingOf(detail, slotId)?.reportable ?? 0;
  const upcoming = detail.schedule
    .filter((r) => r.status === "UPCOMING")
    .map((r) => ({ round: r.number, room: standingOf(detail, slotId, r.number)?.reportable ?? 0 }));
  const debtLeft = debtReportable(detail, slotId);
  const rooms = contributionRooms({ open: { round: open.number, room: openRoom }, upcoming, debtLeft });
  const cap = rooms.reduce((total, r) => total + r.room, 0);
  const blockedByDebt = debtLeft > 0 && upcoming.some((r) => r.room > 0);
  return { rooms, openRoom, cap, ahead: cap - openRoom, blockedByDebt };
}

/** Payouts this viewer has to act on, oldest first: hand over (organizer), or confirm receipt (recipient). */
export function payoutsToActOnFor(detail: GroupDetail) {
  const viewer = detail.viewer;
  return [...detail.payouts]
    .reverse()
    .filter((p) =>
      viewer.isOrganizer
        ? p.status === "AWAITING_HANDOVER"
        : p.status === "HANDED_OVER" && p.recipientSlotId === viewer.slotId,
    );
}

/** Pending disputes, oldest first: reviewed before payments, since they expire at the payout (R-DEC-21). */
export function disputeQueue(detail: GroupDetail) {
  return detail.disputes.filter((d) => d.status === "PENDING");
}

/** The latest dispute about a submission, if any. */
export function latestDispute(detail: GroupDetail, submissionId: string) {
  return detail.disputes.filter((d) => d.submissionId === submissionId).at(-1) ?? null;
}

export type ReviewItem = { kind: "dispute"; item: DisputeView } | { kind: "payment"; item: Payment };

/** Disputes first (they expire at the payout, R-DEC-21), then payments in the order they came in. */
export function reviewItems(detail: GroupDetail): ReviewItem[] {
  return [
    ...disputeQueue(detail).map((item) => ({ kind: "dispute" as const, item })),
    ...reviewQueue(detail).map((item) => ({ kind: "payment" as const, item })),
  ];
}
