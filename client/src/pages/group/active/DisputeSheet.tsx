import { useId, useState } from "react";
import { DISPUTE_REASON_MAX_LENGTH } from "@domain/constants";
import { disputeAmountError, refundFor } from "@domain/submissions";
import type { GroupDetail, SubmissionView } from "../../../api/client";
import { AmountField } from "../../../components/flow/AmountField";
import { Sheet } from "../../../components/flow/Sheet";
import { formatDueDate } from "../../../lib/dates";
import { formatPeso, parsePesoInput, pesoInputValue } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { standingOf } from "./period";

/**
 * R-DSP-01: ask to change an approved contribution, while its period is open (R-DSP-04). Lower is a
 * correction or a refund request; higher can't take the period past the contribution (R-DEC-13).
 */
export function DisputeSheet({
  detail,
  submission,
  onClose,
  onSubmit,
}: {
  detail: GroupDetail;
  submission: SubmissionView | null;
  onClose: () => void;
  onSubmit: (input: { submissionId: string; proposedAmount: number; reason: string }) => Promise<boolean>;
}) {
  if (!submission) return null;
  return <DisputeForm key={submission.id} detail={detail} submission={submission} onClose={onClose} onSubmit={onSubmit} />;
}

function DisputeForm({
  detail,
  submission,
  onClose,
  onSubmit,
}: {
  detail: GroupDetail;
  submission: SubmissionView;
  onClose: () => void;
  onSubmit: (input: { submissionId: string; proposedAmount: number; reason: string }) => Promise<boolean>;
}) {
  const current = submission.effectiveAmount ?? submission.amount;
  const standing = standingOf(detail, submission.slotId);
  const [amountText, setAmountText] = useState(pesoInputValue(current));
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const reasonId = useId();

  const value = parsePesoInput(amountText);
  const amountError = Number.isNaN(value)
    ? "Enter an amount like 1500, or 0."
    : disputeAmountError(value, current, standing?.approved ?? current, standing?.due ?? current);
  const reasonError =
    reason.trim().length > DISPUTE_REASON_MAX_LENGTH ? `Up to ${DISPUTE_REASON_MAX_LENGTH} characters.` : null;
  const refund = Number.isNaN(value) ? 0 : refundFor(current, value);
  const payout = detail.period ? `before the ${formatDueDate(detail.period.payoutDate)} payout` : "before the payout";

  async function submit() {
    if (amountError || reasonError || !reason.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      if (await onSubmit({ submissionId: submission.id, proposedAmount: value, reason: reason.trim() })) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it. Try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Report a problem with this payment"
      subtitle={`Recorded as ${formatPeso(current)} · round ${submission.round}`}
      footer={
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!!amountError || !!reasonError || !reason.trim() || sending}
          className={`${ui.btnPrimaryFull} min-h-11`}
        >
          {sending ? "Sending…" : "Send to the organizer"}
        </button>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <p className="text-sm text-ink-600">
          {detail.group.organizerName} decides {payout}. If not, {formatPeso(current)} stands.
        </p>
        <AmountField label="Correct amount" value={amountText} onChange={setAmountText} error={amountError} />
        {refund > 0 && !amountError && (
          <p className="rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-900">
            If approved, {detail.group.organizerName} owes you a <b>{formatPeso(refund)}</b> refund, and you&apos;ll be{" "}
            {formatPeso(refund)} short for this round unless you pay it again.
          </p>
        )}
        <div>
          <label htmlFor={reasonId} className={ui.label}>
            What happened?
          </label>
          <textarea
            id={reasonId}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. I sent ₱1,500, not ₱2,000. GCash ref 1234."
            className={ui.input}
          />
          {reasonError && <p className="mt-1.5 text-xs font-semibold text-danger-700">{reasonError}</p>}
        </div>
        {error && (
          <p className={ui.error} role="alert">
            {error}
          </p>
        )}
      </form>
    </Sheet>
  );
}
