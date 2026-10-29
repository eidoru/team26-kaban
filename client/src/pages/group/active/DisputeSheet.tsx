import { useId, useState } from "react";
import { DISPUTE_REASON_MAX_LENGTH } from "@domain/constants";
import { disputeAmountError, refundFor } from "@domain/submissions";
import type { GroupDetail, SubmissionView } from "../../../api/client";
import { AmountField } from "../../../components/flow/AmountField";
import { Sheet } from "../../../components/flow/Sheet";
import { SheetDone } from "../../../components/flow/SheetDone";
import { formatDueDate } from "../../../lib/dates";
import { formatPeso, parsePesoInput, pesoInputValue } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { correctionFees, standingOf } from "./period";

/**
 * R-DSP-01: ask to change an approved contribution, while its period is open or, for one paid
 * ahead, still to come (R-DSP-04, R-DEC-32). Lower is a
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
  const standing = standingOf(detail, submission.slotId, submission.round ?? undefined);
  // R-DEC-32: a report expires at its own round's payout, which for one paid ahead is a later one.
  const payoutDate = detail.schedule.find((r) => r.number === submission.round)?.payoutDate ?? detail.period?.payoutDate;
  const [amountText, setAmountText] = useState(pesoInputValue(current));
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const reasonId = useId();

  const value = parsePesoInput(amountText);
  const amountError = Number.isNaN(value)
    ? "Enter an amount like 1500, or 0."
    : // R-DEC-29: what's waiting for review holds its room, so it limits an increase.
      disputeAmountError(value, current, standing?.approved ?? current, standing?.due ?? current, standing?.waiting ?? 0);
  const reasonError =
    reason.trim().length > DISPUTE_REASON_MAX_LENGTH ? `Up to ${DISPUTE_REASON_MAX_LENGTH} characters.` : null;
  const refund = Number.isNaN(value) ? 0 : refundFor(current, value);
  const { refundFee } = Number.isNaN(value) ? { refundFee: 0 } : correctionFees(detail, submission, value);
  const forRound = submission.round === detail.period?.number ? "this round" : `round ${submission.round}`;
  const payout = payoutDate ? `before the ${formatDueDate(payoutDate)} payout` : "before the payout";

  async function submit() {
    if (amountError || reasonError || !reason.trim() || sending) return;
    setSending(true);
    setError("");
    try {
      if (await onSubmit({ submissionId: submission.id, proposedAmount: value, reason: reason.trim() })) setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it. Try again.");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    const organizer = detail.viewer.isOrganizer ? null : detail.group.organizerName;
    return (
      <SheetDone title={organizer ? `Sent to ${organizer}` : "Sent for review"} onClose={onClose}>
        {organizer ? `${organizer} decides ${payout}.` : `Decide it in your review queue ${payout}.`} Until then,{" "}
        {formatPeso(current)} stands.
      </SheetDone>
    );
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
            If approved, {detail.group.organizerName} owes you a <b>{formatPeso(refund + refundFee)}</b> refund
            {refundFee > 0 && ` (with the ${formatPeso(refundFee)} fee)`}, and you&apos;ll be{" "}
            {formatPeso(refund)} short for {forRound} unless you pay it again.
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
