import { useState } from "react";
import { ArrowRight, ExternalLink, ImageOff } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@domain/constants";
import { periodStatus, refundFor } from "@domain/submissions";
import type { DisputeView, GroupDetail, SubmissionView } from "../../../api/client";
import { Sheet } from "../../../components/flow/Sheet";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { owedBy, reviewItems, type ReviewItem } from "./period";

const sentAt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The organizer's review queue, one item at a time: disputes (R-DSP-02) and payments (R-SUB-03/04).
 * Shows proof (or "No proof attached", R-SUB-08) and what approving would change.
 */
export function ReviewSheet({
  open,
  detail,
  pending,
  onClose,
  onApprove,
  onDeny,
}: {
  open: boolean;
  detail: GroupDetail;
  pending: string | null;
  onClose: () => void;
  onApprove: (review: ReviewItem) => Promise<boolean>;
  onDeny: (review: ReviewItem, reason: string) => Promise<boolean>;
}) {
  const queue = reviewItems(detail);
  const current = queue[0];
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  if (!open) return null;
  if (!current) {
    return (
      <Sheet open onClose={onClose} title="All caught up">
        <p className="text-sm text-ink-600">Nothing is waiting for review.</p>
      </Sheet>
    );
  }

  const slot = detail.slots.find((s) => s.id === current.item.slotId);
  const name = slot?.isViewer ? "you" : (slot?.name ?? "this member");
  const reasonError = reason.trim().length > NOTE_MAX_LENGTH ? `Up to ${NOTE_MAX_LENGTH} characters.` : null;
  const busy = pending === "approve" || pending === "deny";
  const isDispute = current.kind === "dispute";

  async function deny() {
    if (!reason.trim() || reasonError) return;
    if (await onDeny(current, reason.trim())) {
      setDenying(false);
      setReason("");
    }
  }

  const title = isDispute
    ? `${slot?.name ?? "Member"} disputes a ${formatPeso(current.item.previousAmount)} payment`
    : `${slot?.name ?? "Member"} paid ${formatPeso(current.item.amount)}`;
  const subtitle = `${queue.length} waiting · ${current.item.round ? `round ${current.item.round} · ` : ""}sent ${sentAt(
    isDispute ? current.item.createdAt : current.item.submittedAt,
  )}`;

  return (
    <Sheet
      open
      onClose={onClose}
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
              {pending === "deny" ? "Denying…" : isDispute ? "Deny dispute" : "Deny payment"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDenying(true)} disabled={busy} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Deny
            </button>
            <button type="button" onClick={() => void onApprove(current)} disabled={busy} className={`${ui.btnPrimary} min-h-11 flex-1`}>
              {pending === "approve" ? "Approving…" : isDispute ? "Approve change" : "Approve"}
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {current.kind === "dispute" ? (
          <DisputeBody dispute={current.item} name={name} />
        ) : (
          <PaymentBody detail={detail} payment={current.item} name={name} />
        )}
        {current.item.mine && (
          <p className="text-xs text-ink-500">You entered this yourself, so the audit log marks the approval as self-approved.</p>
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
        {refund > 0 ? (
          <>
            Approving records a <b>{formatPeso(refund)}</b> refund you owe {name}, and leaves them {formatPeso(refund)} short for
            this round unless they pay it again.
          </>
        ) : (
          <>Approving counts {formatPeso(dispute.proposedAmount - dispute.previousAmount)} more from {name} this round.</>
        )}{" "}
        If you don&apos;t decide before the payout, it expires and {formatPeso(dispute.previousAmount)} stands.
      </p>
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
            Approving makes {name}{" "}
            <b>
              {after === "PAID"
                ? "paid up"
                : `partly paid (${formatPeso(standing.approved + payment.amount)} of ${formatPeso(standing.due)})`}
            </b>{" "}
            for round {payment.round}.
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
