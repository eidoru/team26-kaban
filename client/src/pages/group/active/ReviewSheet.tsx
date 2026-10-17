import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, ExternalLink, ImageOff, TriangleAlert } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@domain/constants";
import { periodStatus, refundFor } from "@domain/submissions";
import type { DisputeView, GroupDetail, SubmissionView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { Sheet } from "../../../components/flow/Sheet";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { owedBy, reviewItems, type ReviewItem } from "./period";

const sentAt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const keyOf = (review: ReviewItem) => `${review.kind}-${review.item.id}`;

/**
 * The organizer's review queue: disputes (R-DSP-02) and payments (R-SUB-03/04). It opens on a list
 * of everything waiting; a row opens that item with its proof (or "No proof attached", R-SUB-08)
 * and what approving changes, and after a decision the list comes back, shorter. With a single
 * item it opens straight on it. One member's payments still go in the order they came in
 * (R-SUB-05), so a later one waits for the earlier. `initialKey` opens it on one item instead, and
 * it closes once that item is decided.
 */
export function ReviewSheet({
  open,
  initialKey = null,
  detail,
  pending,
  onClose,
  onApprove,
  onDeny,
}: {
  open: boolean;
  initialKey?: string | null;
  detail: GroupDetail;
  pending: string | null;
  onClose: () => void;
  onApprove: (review: ReviewItem) => Promise<boolean>;
  onDeny: (review: ReviewItem, reason: string) => Promise<boolean>;
}) {
  const queue = reviewItems(detail);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const select = (key: string | null) => {
    setSelectedKey(key);
    setDenying(false);
    setReason("");
  };
  const close = () => {
    select(null);
    onClose();
  };
  if (!open) return null;
  if (queue.length === 0) {
    return (
      <Sheet open onClose={close} title="All caught up">
        <p className="text-sm text-ink-600">Nothing is waiting for review.</p>
      </Sheet>
    );
  }

  // A decided item leaves the queue, which brings the list back (or the last item, if one is left).
  const current = queue.find((q) => keyOf(q) === selectedKey) ?? (queue.length === 1 ? queue[0] : null);
  const nameOf = (slotId: string) => {
    const s = detail.slots.find((x) => x.id === slotId);
    return s?.isViewer ? "You" : (s?.name ?? "Member");
  };

  if (!current) {
    return (
      <Sheet open onClose={close} title="Waiting for review" subtitle={`${queue.length} to decide`}>
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
          {queue.map((q) => {
            const slot = detail.slots.find((s) => s.id === q.item.slotId);
            return (
              <li key={keyOf(q)}>
                <button
                  type="button"
                  onClick={() => select(keyOf(q))}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50"
                >
                  <Avatar name={slot?.name} size="md" placeholder={slot?.kind === "PLACEHOLDER"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-900">{nameOf(q.item.slotId)}</span>
                    <span className="flex items-center gap-1 text-xs text-ink-500">
                      {q.kind === "dispute" ? (
                        <>
                          <TriangleAlert className="h-3.5 w-3.5 text-sun-700" aria-hidden />
                          Problem report · {formatPeso(q.item.previousAmount)} → {formatPeso(q.item.proposedAmount)}
                        </>
                      ) : (
                        <>
                          {q.item.round ? `Round ${q.item.round}` : "Debt payment"} · {q.item.proofUrl ? "proof attached" : "no proof"}
                        </>
                      )}
                    </span>
                  </span>
                  {q.kind === "payment" && (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900">{formatPeso(q.item.amount)}</span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    );
  }

  const slot = detail.slots.find((s) => s.id === current.item.slotId);
  const name = slot?.isViewer ? "you" : (slot?.name ?? "this member");
  const reasonError = reason.trim().length > NOTE_MAX_LENGTH ? `Up to ${NOTE_MAX_LENGTH} characters.` : null;
  const busy = pending === "approve" || pending === "deny";
  const isDispute = current.kind === "dispute";
  // R-SUB-05: the same member's earlier payment comes first.
  const earlier = !isDispute
    ? queue.find((q) => q.kind === "payment" && q.item.slotId === current.item.slotId && q.item.submittedAt < current.item.submittedAt)
    : undefined;

  // Opened on one item: back to where it was opened from. Otherwise the list, one shorter.
  const done = () => (initialKey ? close() : select(null));
  async function deny() {
    if (!current || !reason.trim() || reasonError) return;
    if (await onDeny(current, reason.trim())) done();
  }
  async function approve() {
    if (current && (await onApprove(current))) done();
  }

  const title = isDispute
    ? `${slot?.name ?? "Member"} reports a problem with a ${formatPeso(current.item.previousAmount)} payment`
    : `${slot?.name ?? "Member"} paid ${formatPeso(current.item.amount)}`;
  const subtitle = `${current.item.round ? `Round ${current.item.round} · ` : ""}${sentAt(
    isDispute ? current.item.createdAt : current.item.submittedAt,
  )}`;

  return (
    <Sheet
      open
      onClose={close}
      title={title}
      subtitle={subtitle}
      footer={
        denying ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDenying(false)} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Back
            </button>
            <button
              type="button"
              onClick={() => void deny()}
              disabled={!reason.trim() || !!reasonError || busy}
              className="min-h-11 flex-1 rounded-full bg-danger-600 px-5 text-sm font-bold text-white hover:bg-danger-700 disabled:opacity-50"
            >
              {pending === "deny" ? "Denying…" : isDispute ? "Deny report" : "Deny payment"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDenying(true)} disabled={busy || !!earlier} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Deny
            </button>
            <button type="button" onClick={() => void approve()} disabled={busy || !!earlier} className={`${ui.btnPrimary} min-h-11 flex-1`}>
              {pending === "approve" ? "Approving…" : isDispute ? "Approve change" : "Approve"}
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {queue.length > 1 && (
          <button type="button" onClick={() => select(null)} className={`${ui.btnGhost} -ml-3`}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            All {queue.length}
          </button>
        )}
        {earlier && earlier.kind === "payment" && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-900">
            Review their earlier {formatPeso(earlier.item.amount)} first.
            <button type="button" onClick={() => select(keyOf(earlier))} className={`${ui.link} font-bold`}>
              Go to it
            </button>
          </p>
        )}
        {current.kind === "dispute" ? (
          <DisputeBody dispute={current.item} name={name} />
        ) : (
          <PaymentBody detail={detail} payment={current.item} name={name} />
        )}
        {denying && (
          <div>
            <label htmlFor="deny-reason" className={ui.label}>
              {isDispute ? "Why isn't the change right?" : "Why are you denying it?"}
            </label>
            <textarea
              id="deny-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder={isDispute ? "e.g. The ₱2,000 matches my GCash." : "e.g. I didn't receive this in GCash."}
              className={ui.input}
            />
            <p className={reasonError ? "mt-1.5 text-xs font-semibold text-danger-700" : ui.helperText}>
              {reasonError ?? `${slot?.isViewer ? "This" : `${slot?.name} sees this`} so they know why.`}
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}

function DisputeBody({ dispute, name }: { dispute: DisputeView; name: string }) {
  const refund = refundFor(dispute.previousAmount, dispute.proposedAmount);
  return (
    <>
      <p className="flex items-center justify-center gap-3 rounded-2xl bg-ink-50 px-4 py-4 font-heading text-2xl font-bold tabular-nums text-ink-900">
        <span className="text-ink-500 line-through decoration-2">{formatPeso(dispute.previousAmount)}</span>
        <ArrowRight className="h-5 w-5 text-ink-400" aria-label="to" />
        <span>{formatPeso(dispute.proposedAmount)}</span>
      </p>
      <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
        <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">Reason</span>
        {dispute.reason}
      </p>
      <p className="text-sm text-ink-600">
        After approval:{" "}
        <b>
          {refund > 0
            ? `you owe ${name} a ${formatPeso(refund)} refund, and they're ${formatPeso(refund)} short this round`
            : `${formatPeso(dispute.proposedAmount - dispute.previousAmount)} more counts from ${name}`}
        </b>
      </p>
      <p className="text-xs text-ink-500">Undecided at the payout, it expires and {formatPeso(dispute.previousAmount)} stands.</p>
    </>
  );
}

function PaymentBody({ detail, payment, name }: { detail: GroupDetail; payment: SubmissionView; name: string }) {
  const thisRound = payment.type === "CONTRIBUTION" && payment.round === detail.period?.number;
  const standing = thisRound ? detail.period?.slots.find((s) => s.slotId === payment.slotId) : undefined;
  const after = standing ? periodStatus(standing.due, standing.approved + payment.amount, 0).status : null;
  const owed = owedBy(detail, payment.slotId);
  return (
    <>
      {payment.proofUrl ? (
        <a
          href={payment.proofUrl}
          target="_blank"
          rel="noreferrer"
          className="group relative block overflow-hidden rounded-2xl border border-ink-200 bg-ink-50"
        >
          <img src={payment.proofUrl} alt={`Proof from ${name}`} className="max-h-72 w-full object-contain" />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-ink-700 shadow-card">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Full size
          </span>
        </a>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-sun-50 px-4 py-3 text-sm font-semibold text-sun-900">
          <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
          No proof attached
        </p>
      )}
      {payment.note && (
        <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
          <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">Note</span>
          {payment.note}
        </p>
      )}
      <p className="text-sm text-ink-600">
        {standing && after ? (
          <>
            After approval:{" "}
            <b>{after === "PAID" ? "paid up" : `${formatPeso(standing.approved + payment.amount)} of ${formatPeso(standing.due)} paid`}</b>
          </>
        ) : payment.amount > owed ? (
          // R-DEC-19: the server refuses it; say so before the organizer tries.
          <>
            {owed > 0 ? `${name} only owes ${formatPeso(owed)} now` : `${name} doesn't owe anything now`}, so this can&apos;t be
            approved. Deny it instead.
          </>
        ) : (
          <>
            {payment.type === "CONTRIBUTION" ? `Round ${payment.round} has closed, so this` : "This"} goes toward {name}&apos;s{" "}
            {formatPeso(owed)} debt, interest first.
          </>
        )}
      </p>
    </>
  );
}
