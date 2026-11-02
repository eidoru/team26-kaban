import { useState } from "react";
import type { GroupDetail, WithdrawalView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { Sheet } from "../../../components/flow/Sheet";
import { StarInput } from "../../../components/StarRating";
import { formatDueDate } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";

type Row = { label: string; value: string; danger?: boolean };

/**
 * R-WDR-09: the organizer's look at a request both sides agreed to: why, the proof, the leaver's
 * standing and who takes over. Approval re-checks everything on the server; `blockers` says what
 * stops it now. The organizer may rate the leaver as they approve (R-DEC-43); it's their only chance
 * before the paluwagan completes.
 */
export function WithdrawalReviewSheet(props: {
  detail: GroupDetail;
  request: WithdrawalView | null;
  pending: string | null;
  error: string | null;
  onClose: () => void;
  onApprove: (request: WithdrawalView, stars: number | null) => void;
  onReject: (request: WithdrawalView) => void;
}) {
  if (!props.request) return null;
  // Keyed by request, so the stars start empty for each one.
  return <ReviewBody key={props.request.id} {...props} request={props.request} />;
}

function ReviewBody({
  detail,
  request,
  pending,
  error,
  onClose,
  onApprove,
  onReject,
}: {
  detail: GroupDetail;
  request: WithdrawalView;
  pending: string | null;
  error: string | null;
  onClose: () => void;
  onApprove: (request: WithdrawalView, stars: number | null) => void;
  onReject: (request: WithdrawalView) => void;
}) {
  const [stars, setStars] = useState<number | null>(null);
  const slot = detail.slots.find((s) => s.id === request.slotId);
  const turn = detail.schedule.find((r) => r.recipientSlotId === request.slotId);
  const debt = slot ? slot.debt.principal + slot.debt.interest : 0;
  const busy = pending === `withdrawal-${request.id}`;
  const blocked = request.blockers.length > 0 || request.status !== "AWAITING_ORGANIZER";
  const rows: (Row | false | null | undefined)[] = [
    turn && { label: "Payout turn", value: `Round ${turn.number} · ${formatDueDate(turn.payoutDate)}` },
    request.contributed != null && { label: "Contributed so far", value: formatPeso(request.contributed) },
    request.leftAhead > 0 && { label: "Paid ahead, left to the replacement", value: formatPeso(request.leftAhead) },
    debt > 0 && { label: "Debt that goes with the slot", value: formatPeso(debt), danger: true },
  ];

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${request.leaverName} wants to leave`}
      footer={
        <div className="flex gap-2">
          <button type="button" onClick={() => onReject(request)} disabled={busy} className={`${ui.btnSecondary} min-h-11 flex-1`}>
            Reject
          </button>
          <button type="button" onClick={() => onApprove(request, stars)} disabled={busy || blocked} className={`${ui.btnPrimary} min-h-11 flex-1`}>
            {busy ? "Saving…" : "Approve"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
          <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">Reason</span>
          {request.reason}
        </p>
        {request.proofUrl && (
          <a href={request.proofUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-2xl border-2 border-ink-200 bg-ink-50">
            <img src={request.proofUrl} alt="Proof attached to the request" className="max-h-64 w-full object-contain" />
          </a>
        )}
        <dl className="divide-y divide-ink-100 rounded-2xl border border-ink-200 px-4">
          {rows.filter((r): r is Row => !!r).map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 py-2.5">
              <dt className="text-sm text-ink-600">{r.label}</dt>
              <dd className={`text-sm font-bold tabular-nums ${r.danger ? "text-danger-700" : "text-ink-900"}`}>{r.value}</dd>
            </div>
          ))}
        </dl>
        {request.replacement && (
          <div className="flex items-center gap-3 rounded-2xl bg-sky-50 px-4 py-3">
            <Avatar name={request.replacement.name} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-ink-900">{request.replacement.name}</p>
              {request.replacement.email && <p className="truncate text-xs text-ink-600">{request.replacement.email}</p>}
              <p className="text-xs text-ink-600">Takes over · agreed to the terms and everything above</p>
            </div>
          </div>
        )}
        {request.blockers.map((b) => (
          <p key={b} className={ui.warning}>
            {b}
          </p>
        ))}
        {!blocked && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-2xl border border-ink-200 px-4 py-2">
            <span className="text-sm text-ink-600">Rate {request.leaverName} (optional)</span>
            <StarInput value={stars} onChange={setStars} label={`Rate ${request.leaverName} as a member`} disabled={busy} />
          </div>
        )}
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
