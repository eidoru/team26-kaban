import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@domain/constants";
import { periodStatus } from "@domain/submissions";
import type { GroupDetail } from "../../../api/client";
import { Sheet } from "../../../components/flow/Sheet";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { reviewQueue } from "./period";

/**
 * The organizer's review queue (R-SUB-03, R-SUB-04), one submission at a time, oldest first. Shows
 * the proof (or that there is none, R-SUB-08) and what approving would do to that member's standing.
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
  onApprove: (submissionId: string) => Promise<boolean>;
  onDeny: (submissionId: string, reason: string) => Promise<boolean>;
}) {
  const queue = reviewQueue(detail);
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

  const slot = detail.slots.find((s) => s.id === current.slotId);
  const standing = detail.period?.slots.find((s) => s.slotId === current.slotId);
  const after = standing ? periodStatus(standing.due, standing.approved + current.amount, 0).status : null;
  const reasonError = reason.trim().length > NOTE_MAX_LENGTH ? `Up to ${NOTE_MAX_LENGTH} characters.` : null;
  const busy = pending === "approve" || pending === "deny";

  async function deny() {
    if (!reason.trim() || reasonError) return;
    if (await onDeny(current.id, reason.trim())) {
      setDenying(false);
      setReason("");
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`${slot?.name ?? "Member"} paid ${formatPeso(current.amount)}`}
      subtitle={`${queue.length} waiting · round ${current.round} · sent ${new Date(current.submittedAt).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}`}
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
              {pending === "deny" ? "Denying…" : "Deny payment"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDenying(true)} disabled={busy} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Deny
            </button>
            <button
              type="button"
              onClick={() => void onApprove(current.id)}
              disabled={busy}
              className={`${ui.btnPrimary} min-h-11 flex-1`}
            >
              {pending === "approve" ? "Approving…" : "Approve"}
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {current.proofUrl ? (
          <a
            href={current.proofUrl}
            target="_blank"
            rel="noreferrer"
            className="group relative block overflow-hidden rounded-2xl border border-ink-200 bg-ink-50"
          >
            <img src={current.proofUrl} alt={`Proof from ${slot?.name}`} className="max-h-72 w-full object-contain" />
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
        {current.note && (
          <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
            <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">Note</span>
            {current.note}
          </p>
        )}
        {standing && after && (
          <p className="text-sm text-ink-600">
            Approving makes {slot?.isViewer ? "you" : slot?.name}{" "}
            <b>{after === "PAID" ? "paid up" : `partly paid (${formatPeso(standing.approved + current.amount)} of ${formatPeso(standing.due)})`}</b>{" "}
            for round {current.round}.
          </p>
        )}
        {current.mine && (
          <p className="text-xs text-ink-500">You entered this yourself, so the audit log marks the approval as self-approved.</p>
        )}
        {denying && (
          <div>
            <label htmlFor="deny-reason" className={ui.label}>
              Why are you denying it?
            </label>
            <textarea
              id="deny-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              autoFocus
              placeholder="e.g. I didn't receive this in GCash."
              className={ui.input}
            />
            <p className={reasonError ? "mt-1.5 text-xs font-semibold text-danger-700" : ui.helperText}>
              {reasonError ?? `${slot?.isViewer ? "This" : `${slot?.name} sees this`} so they know what to fix.`}
            </p>
          </div>
        )}
      </div>
    </Sheet>
  );
}
