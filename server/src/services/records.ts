import type { DebtEntryKind } from "@prisma/client";
import { formatPeso } from "../domain/money.js";
import { prisma } from "../lib/prisma.js";
import { slotName } from "./common.js";

/** R-CMP-02: one member's totals, in centavos. Available any time; final once the paluwagan completes. */
export interface MemberTotals {
  slotId: string;
  name: string;
  position: number | null;
  isOrganizer: boolean;
  /** Approved contributions, after any dispute corrections. */
  contributed: number;
  /** Net payouts handed to them. */
  received: number;
  /** Refunds from approved dispute decreases (R-DSP-03). */
  refunds: number;
  /** Shortfalls the organizer covered for them. The organizer's own count here, but never become debt. */
  coveredByOrganizer: number;
  /** Debt principal created plus every interest charge. */
  debtIncurred: number;
  /** Repayments and payout deductions. */
  debtSettled: number;
  debtOutstanding: number;
}

export interface GroupTotals {
  /** Money members paid in: approved contributions plus debt repayments. */
  collected: number;
  paidOut: number;
  coveredByOrganizer: number;
  refunds: number;
  debtOutstanding: number;
}

const sumBy = <T>(rows: T[], pick: (row: T) => bigint | number | null | undefined) =>
  rows.reduce((total, row) => total + Number(pick(row) ?? 0), 0);

/** R-CMP-02 for every slot, plus group totals. */
export async function completionSummary(groupId: string) {
  const [slots, submissions, debtEntries, payouts, refunds, results] = await Promise.all([
    prisma.slot.findMany({ where: { groupId }, include: { user: true }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] }),
    prisma.submission.findMany({ where: { groupId, status: "APPROVED" } }),
    prisma.debtEntry.findMany({ where: { groupId } }),
    prisma.payout.findMany({ where: { round: { groupId } }, include: { round: true } }),
    prisma.refund.findMany({ where: { groupId } }),
    prisma.roundSlotResult.findMany({ where: { round: { groupId } } }),
  ]);
  const members: MemberTotals[] = slots.map((slot) => {
    const mine = <T extends { slotId: string }>(rows: T[]) => rows.filter((r) => r.slotId === slot.id);
    const debt = mine(debtEntries);
    const added = debt.filter((e) => e.kind === "SHORTFALL_COVERED" || e.kind === "INTEREST_CHARGED");
    const removed = debt.filter((e) => e.kind === "REPAYMENT" || e.kind === "PAYOUT_DEDUCTION");
    return {
      slotId: slot.id,
      name: slotName(slot),
      position: slot.position,
      isOrganizer: slot.isOrganizer,
      contributed: sumBy(
        mine(submissions).filter((s) => s.appliedAs === "CONTRIBUTION"),
        (s) => s.effectiveAmount ?? s.amount,
      ),
      received: sumBy(payouts.filter((p) => p.round.recipientSlotId === slot.id && p.status !== "AWAITING_HANDOVER"), (p) => p.net),
      refunds: sumBy(mine(refunds), (r) => r.amount),
      coveredByOrganizer: sumBy(mine(results), (r) => r.coveredByOrganizer),
      debtIncurred: sumBy(added, (e) => e.principalDelta) + sumBy(added, (e) => e.interestDelta),
      // `+ 0` turns −0 (negating an empty sum) into 0.
      debtSettled: -(sumBy(removed, (e) => e.principalDelta) + sumBy(removed, (e) => e.interestDelta)) + 0,
      debtOutstanding: Number(slot.debtPrincipal) + Number(slot.debtInterest),
    };
  });
  const repaid = sumBy(
    debtEntries.filter((e) => e.kind === "REPAYMENT"),
    (e) => -(Number(e.principalDelta) + Number(e.interestDelta)),
  );
  const totals: GroupTotals = {
    collected: members.reduce((t, m) => t + m.contributed, 0) + repaid,
    paidOut: members.reduce((t, m) => t + m.received, 0),
    coveredByOrganizer: members.reduce((t, m) => t + m.coveredByOrganizer, 0),
    refunds: members.reduce((t, m) => t + m.refunds, 0),
    debtOutstanding: members.reduce((t, m) => t + m.debtOutstanding, 0),
  };
  return { members, totals };
}

/** One line of history. Amounts are centavos; debt deltas are + when debt grows, − when it shrinks. */
export interface RecordEvent {
  at: Date;
  round: number | null;
  slotId: string;
  name: string;
  event: string;
  amount: number | null;
  principalDelta: number | null;
  interestDelta: number | null;
  status: string | null;
  notes: string;
  /** Before the current holder claimed this placeholder (R-CLM-06). */
  inherited: boolean;
}

const DEBT_EVENTS: Record<DebtEntryKind, string> = {
  SHORTFALL_COVERED: "Shortfall covered by the organizer",
  INTEREST_CHARGED: "Interest charged",
  REPAYMENT: "Debt repayment",
  PAYOUT_DEDUCTION: "Taken from payout",
};

const SUBMISSION_STATUS: Record<string, string> = {
  PENDING: "Waiting for review",
  APPROVED: "Approved",
  DENIED: "Denied",
  CANCELLED: "Withdrawn",
};

/**
 * Every recorded money event for the group, oldest first, or one slot's (§14 member statement,
 * organizer ledger): reports and their reviews, debt changes, payouts, refunds.
 */
export async function recordEvents(groupId: string, slotId?: string): Promise<RecordEvent[]> {
  const bySlot = slotId ? { slotId } : {};
  const [slots, submissions, debtEntries, payouts, refunds] = await Promise.all([
    prisma.slot.findMany({ where: { groupId }, include: { user: true } }),
    prisma.submission.findMany({ where: { groupId, ...bySlot }, include: { round: true } }),
    prisma.debtEntry.findMany({ where: { groupId, ...bySlot }, include: { round: true } }),
    prisma.payout.findMany({
      where: { round: { groupId, ...(slotId ? { recipientSlotId: slotId } : {}) } },
      include: { round: true },
    }),
    prisma.refund.findMany({ where: { groupId, ...bySlot }, include: { dispute: { include: { submission: { include: { round: true } } } } } }),
  ]);
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const base = (id: string, at: Date) => {
    const slot = slotById.get(id);
    return {
      slotId: id,
      name: slot ? slotName(slot) : "Former member",
      inherited: !!slot?.claimedAt && at < slot.claimedAt,
    };
  };

  const events: RecordEvent[] = [
    ...submissions.map((s) => {
      const effective = s.effectiveAmount != null && s.effectiveAmount !== s.amount ? Number(s.effectiveAmount) : null;
      const late = s.type === "CONTRIBUTION" && s.appliedAs === "DEBT_PAYMENT";
      return {
        at: s.submittedAt,
        round: s.round?.number ?? null,
        ...base(s.slotId, s.submittedAt),
        event: s.type === "DEBT_PAYMENT" ? "Debt payment reported" : "Contribution reported",
        amount: Number(s.amount),
        principalDelta: null,
        interestDelta: null,
        status: SUBMISSION_STATUS[s.status] ?? s.status,
        notes: [
          s.proofPath ? "Proof attached" : "No proof attached",
          s.selfApproved && "Self-approved",
          late && "Counted toward debt (period had closed)",
          effective !== null && `Corrected to ${formatPeso(effective)}`,
          s.status === "DENIED" && s.denialReason && `Reason: ${s.denialReason}`,
          s.note && `Note: ${s.note}`,
        ]
          .filter(Boolean)
          .join(". "),
      };
    }),
    ...debtEntries.map((e) => ({
      at: e.createdAt,
      round: e.round?.number ?? null,
      ...base(e.slotId, e.createdAt),
      event: DEBT_EVENTS[e.kind],
      amount: null,
      principalDelta: Number(e.principalDelta),
      interestDelta: Number(e.interestDelta),
      status: null,
      notes: "",
    })),
    ...payouts.map((p) => {
      const at = p.round.closedAt ?? p.round.payoutDate;
      const deductions = Number(p.ownShortfall) + Number(p.interestDeducted) + Number(p.principalDeducted);
      return {
        at,
        round: p.round.number,
        ...base(p.round.recipientSlotId, at),
        event: "Payout",
        amount: Number(p.net),
        principalDelta: null,
        interestDelta: null,
        status: { AWAITING_HANDOVER: "Not handed over yet", HANDED_OVER: "Handed over", CONFIRMED: "Received" }[p.status],
        notes:
          deductions > 0
            ? `${formatPeso(Number(p.gross))} pot, less ${formatPeso(Number(p.ownShortfall))} own shortfall, ${formatPeso(Number(p.interestDeducted))} interest and ${formatPeso(Number(p.principalDeducted))} debt`
            : `Full ${formatPeso(Number(p.gross))} pot`,
      };
    }),
    ...refunds.map((r) => ({
      at: r.createdAt,
      round: r.dispute.submission.round?.number ?? null,
      ...base(r.slotId, r.createdAt),
      event: "Refund owed by the organizer",
      amount: Number(r.amount),
      principalDelta: null,
      interestDelta: null,
      status: null,
      notes: `${formatPeso(Number(r.dispute.previousAmount))} corrected to ${formatPeso(Number(r.dispute.proposedAmount))}`,
    })),
  ];
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}
