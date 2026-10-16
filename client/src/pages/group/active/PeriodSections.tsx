import { ChevronRight, Clock, ImageOff, Paperclip } from "lucide-react";
import type { GroupDetail, PeriodSlot, SlotView, SubmissionView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { formatDueDate } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";

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
 * Everyone's standing this round, in payout order (R-SUB-07, R-DEC-06). `onRecord` makes the
 * organizer's own row and placeholders tappable, to record their payments (R-SUB-02).
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
          const recordable = onRecord && (slot.isViewer || slot.kind === "PLACEHOLDER") && standing.status !== "PAID";
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

/** What the viewer reported this round, newest first, with Withdraw on pending ones (R-SUB-04). */
export function MyPayments({
  detail,
  pending,
  onWithdraw,
}: {
  detail: GroupDetail;
  pending: string | null;
  onWithdraw: (submission: SubmissionView) => void;
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
          return (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink-900 tabular-nums">
                    {formatPeso(s.amount)}
                    {!slot?.isViewer && <span className="font-semibold text-ink-600"> for {slot?.name}</span>}
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
              </div>
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
