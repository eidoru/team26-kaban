import { ChevronRight, Clock, ImageOff, Paperclip } from "lucide-react";
import type { DisputeView, GroupDetail, PeriodSlot, SlotView, SubmissionView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { formatDueDate } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { latestDispute } from "./period";

/** The open round: whose pot it is, when, and how much is collected (approved money only, R-SUB-07). */
export function PeriodCard({ detail }: { detail: GroupDetail }) {
  const period = detail.period!;
  const recipient = detail.slots.find((s) => s.id === period.recipientSlotId);
  const percent = Math.min(100, Math.round((period.approvedTotal / period.expected) * 100));
  const pendingPercent = Math.min(100 - percent, Math.round((period.pendingTotal / period.expected) * 100));
  return (
    <section aria-label={`Round ${period.number}`} className="rounded-3xl bg-brand-700 p-5 text-white shadow-card sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-100">
          Round {period.number} of {detail.group.slotCount}
        </p>
        <p className="text-sm text-brand-50">Payout {formatDueDate(period.payoutDate)}</p>
      </div>
      <div className="mt-3 flex items-center gap-3">
        {recipient && <Avatar name={recipient.name} size="md" placeholder={recipient.kind === "PLACEHOLDER"} />}
        <p className="min-w-0">
          <span className="block text-sm text-brand-100">This pot goes to</span>
          <span className="font-heading block truncate text-xl font-bold">
            {recipient?.isViewer ? "You" : (recipient?.name ?? "—")}
          </span>
        </p>
      </div>
      <p className="font-heading mt-4 text-3xl font-bold tabular-nums">
        {formatPeso(period.approvedTotal)}
        <span className="text-base font-semibold text-brand-100"> of {formatPeso(period.expected)} collected</span>
      </p>
      <div
        className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-brand-900/50"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Collected so far"
      >
        <div className="h-full bg-sun-300" style={{ width: `${percent}%` }} />
        <div className="h-full bg-sun-300/40" style={{ width: `${pendingPercent}%` }} />
      </div>
      {period.pendingTotal > 0 && (
        <p className="mt-2 text-xs text-brand-100">{formatPeso(period.pendingTotal)} more is waiting for review.</p>
      )}
    </section>
  );
}

function StatusChip({ standing }: { standing: PeriodSlot }) {
  const styles = {
    PAID: "bg-brand-100 text-brand-800",
    PARTIAL: "bg-sun-100 text-sun-800",
    UNPAID: "bg-ink-100 text-ink-600",
  } as const;
  const label = { PAID: "Paid", PARTIAL: "Partly paid", UNPAID: "Not paid" }[standing.status];
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${styles[standing.status]}`}>{label}</span>;
}

/**
 * Everyone's standing this round, in payout order (R-SUB-07, R-DEC-06). The viewer's own row is
 * always tappable to pay, whatever the Now panel is showing; the organizer's placeholder rows too,
 * to record their payments (R-SUB-02).
 */
export function PeriodStatusList({ detail, onRecord }: { detail: GroupDetail; onRecord?: (slot: SlotView) => void }) {
  const period = detail.period!;
  const order = new Map(detail.schedule.map((r) => [r.recipientSlotId, r.number]));
  const slots = [...detail.slots].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return (
    <section aria-labelledby="round-heading">
      <h2 id="round-heading" className={`${ui.sectionHeading} mb-3`}>
        This round
      </h2>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {slots.map((slot) => {
          const standing = period.slots.find((s) => s.slotId === slot.id)!;
          const recordable =
            onRecord &&
            (slot.isViewer || (detail.viewer.isOrganizer && slot.kind === "PLACEHOLDER")) &&
            standing.status !== "PAID";
          const body = (
            <>
              <Avatar name={slot.name} size="md" placeholder={slot.kind === "PLACEHOLDER"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink-900">
                  {slot.name}
                  {slot.isViewer && <span className="font-semibold text-brand-700"> (you)</span>}
                </span>
                <span className="block text-xs text-ink-500 tabular-nums">
                  {standing.status === "PAID"
                    ? formatPeso(standing.approved)
                    : `${formatPeso(standing.approved)} of ${formatPeso(standing.due)}`}
                  {standing.pending > 0 && (
                    <span className="text-ink-600"> · {formatPeso(standing.pending)} waiting for review</span>
                  )}
                </span>
              </span>
              <StatusChip standing={standing} />
            </>
          );
          const row = "flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left";
          return (
            <li key={slot.id}>
              {recordable ? (
                <button type="button" onClick={() => onRecord(slot)} className={`${row} transition-colors hover:bg-ink-50`}>
                  {body}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </button>
              ) : (
                <div className={row}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SUBMISSION_LABELS: Record<SubmissionView["status"], { text: string; tone: string }> = {
  PENDING: { text: "Waiting for review", tone: "text-sun-800" },
  APPROVED: { text: "Approved", tone: "text-brand-700" },
  DENIED: { text: "Not approved", tone: "text-danger-700" },
  CANCELLED: { text: "Withdrawn", tone: "text-ink-500" },
};

/**
 * What the viewer reported, newest first: Withdraw on pending ones (R-SUB-04), Dispute on approved
 * contributions while their period is open (§6.2), and each dispute's outcome.
 */
export function MyPayments({
  detail,
  pending,
  onWithdraw,
  onDispute,
  onWithdrawDispute,
}: {
  detail: GroupDetail;
  pending: string | null;
  onWithdraw: (submission: SubmissionView) => void;
  onDispute: (submission: SubmissionView) => void;
  onWithdrawDispute: (dispute: DisputeView) => void;
}) {
  const mine = detail.submissions.filter((s) => s.mine).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  if (mine.length === 0) return null;
  const nameOf = (slotId: string) => detail.slots.find((s) => s.id === slotId);
  return (
    <section aria-labelledby="my-payments-heading">
      <h2 id="my-payments-heading" className={`${ui.sectionHeading} mb-3`}>
        {detail.viewer.isOrganizer ? "Payments you recorded" : "Your payments"}
      </h2>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {mine.map((s) => {
          const label = SUBMISSION_LABELS[s.status];
          const slot = nameOf(s.slotId);
          const dispute = latestDispute(detail, s.id);
          const changed = s.effectiveAmount != null && s.effectiveAmount !== s.amount;
          const disputable =
            s.status === "APPROVED" &&
            s.appliedAs === "CONTRIBUTION" &&
            s.round === detail.period?.number &&
            dispute?.status !== "PENDING";
          return (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink-900 tabular-nums">
                    {formatPeso(s.effectiveAmount ?? s.amount)}
                    {changed && <span className="font-semibold text-ink-500"> (was {formatPeso(s.amount)})</span>}
                    {!slot?.isViewer && <span className="font-semibold text-ink-600"> for {slot?.name}</span>}
                    {(s.type === "DEBT_PAYMENT" || s.appliedAs === "DEBT_PAYMENT") && (
                      <span className="font-semibold text-ink-600"> toward debt</span>
                    )}
                  </span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${label.tone}`}>
                    {s.status === "PENDING" && <Clock className="h-3 w-3" aria-hidden />}
                    {label.text}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                    {s.proofAttached ? <Paperclip className="h-3 w-3" aria-hidden /> : <ImageOff className="h-3 w-3" aria-hidden />}
                    {s.proofAttached ? "Proof attached" : "No proof"}
                    {s.note && ` · ${s.note}`}
                  </span>
                </span>
                {s.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => onWithdraw(s)}
                    disabled={pending === `withdraw-${s.id}`}
                    className={ui.btnGhost}
                  >
                    Withdraw
                  </button>
                )}
                {disputable && (
                  <button type="button" onClick={() => onDispute(s)} className={ui.btnGhost}>
                    Dispute
                  </button>
                )}
              </div>
              {dispute && <DisputeLine dispute={dispute} pending={pending} onWithdraw={onWithdrawDispute} />}
              {s.status === "DENIED" && s.denialReason && (
                <p className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-800">Reason: {s.denialReason}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * Who owes the organizer, and how much (§8, R-DEC-06: everyone sees it). Hidden when nobody owes
 * anything. `onPay` opens a debt payment for the viewer's own row, or a placeholder's (organizer).
 */
export function DebtsList({ detail, onPay }: { detail: GroupDetail; onPay: (slot: SlotView) => void }) {
  const owing = detail.slots
    .map((slot) => ({ slot, total: slot.debt.principal + slot.debt.interest }))
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);
  if (owing.length === 0) return null;
  const canPay = (slot: SlotView) => slot.isViewer || (detail.viewer.isOrganizer && slot.kind === "PLACEHOLDER");
  return (
    <section aria-labelledby="debts-heading">
      <h2 id="debts-heading" className={ui.sectionHeading}>
        Debts
      </h2>
      <p className={`${ui.sectionSubtitle} mb-3`}>
        Shortfalls {detail.group.organizerName} covered{detail.group.interestRate > 0 ? ", with interest" : ""}.
      </p>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {owing.map(({ slot, total }) => (
          <li key={slot.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
            <Avatar name={slot.name} size="md" placeholder={slot.kind === "PLACEHOLDER"} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-ink-900">
                {slot.name}
                {slot.isViewer && <span className="font-semibold text-brand-700"> (you)</span>}
              </span>
              <span className="block text-xs text-ink-500 tabular-nums">
                {formatPeso(slot.debt.principal)} unpaid
                {slot.debt.interest > 0 && ` + ${formatPeso(slot.debt.interest)} interest`}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-heading text-base font-bold tabular-nums text-danger-700">{formatPeso(total)}</span>
              {canPay(slot) && (
                <button type="button" onClick={() => onPay(slot)} className={`${ui.btnSecondarySm} min-h-9`}>
                  {slot.isViewer ? "Pay" : "Record"}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** A dispute's outcome under its payment. */
function DisputeLine({
  dispute,
  pending,
  onWithdraw,
}: {
  dispute: DisputeView;
  pending: string | null;
  onWithdraw: (dispute: DisputeView) => void;
}) {
  const to = formatPeso(dispute.proposedAmount);
  const lines: Record<DisputeView["status"], { text: string; tone: string }> = {
    PENDING: { text: `You asked to change it to ${to}. Waiting for review.`, tone: "bg-sun-50 text-sun-900" },
    APPROVED: {
      text: `Changed to ${to}.${dispute.refund ? ` The organizer owes you a ${formatPeso(dispute.refund)} refund.` : ""}`,
      tone: "bg-brand-50 text-brand-900",
    },
    DENIED: { text: `Change to ${to} not accepted: ${dispute.reviewNote}`, tone: "bg-danger-50 text-danger-800" },
    CANCELLED: { text: `You withdrew the change to ${to}.`, tone: "bg-ink-50 text-ink-600" },
    EXPIRED: {
      text: `The change to ${to} wasn't settled before the payout, so ${formatPeso(dispute.previousAmount)} stands.`,
      tone: "bg-ink-50 text-ink-600",
    },
  };
  const line = lines[dispute.status];
  return (
    <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${line.tone}`}>
      <span className="flex-1">{line.text}</span>
      {dispute.status === "PENDING" && dispute.mine && (
        <button
          type="button"
          onClick={() => onWithdraw(dispute)}
          disabled={pending === `withdraw-dispute-${dispute.id}`}
          className="shrink-0 font-bold underline"
        >
          Withdraw
        </button>
      )}
    </div>
  );
}

/** R-DSP-03 / R-DEC-14: refunds the organizer owes, recorded only. Hidden when there are none. */
export function RefundsOwed({ detail }: { detail: GroupDetail }) {
  const refunds = detail.disputes.filter((d) => d.refund);
  if (!detail.viewer.isOrganizer || refunds.length === 0) return null;
  return (
    <section aria-labelledby="refunds-heading">
      <h2 id="refunds-heading" className={ui.sectionHeading}>
        Refunds you owe
      </h2>
      <p className={`${ui.sectionSubtitle} mb-3`}>From approved disputes. Hand these back outside the app.</p>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {refunds.map((d) => {
          const slot = detail.slots.find((s) => s.id === d.slotId);
          return (
            <li key={d.id} className="flex items-center gap-3 px-4 py-3">
              <Avatar name={slot?.name} size="md" placeholder={slot?.kind === "PLACEHOLDER"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink-900">{slot?.name}</span>
                <span className="block text-xs text-ink-500">
                  Round {d.round}: {formatPeso(d.previousAmount)} corrected to {formatPeso(d.proposedAmount)}
                </span>
              </span>
              <span className="font-heading text-base font-bold tabular-nums text-ink-900">{formatPeso(d.refund!)}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
