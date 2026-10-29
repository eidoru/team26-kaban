import { useEffect, useId, useMemo, useState } from "react";
import { Camera, X } from "lucide-react";
import type { GroupDetail, PayoutView } from "../../../api/client";
import { Sheet } from "../../../components/flow/Sheet";
import { SheetDone } from "../../../components/flow/SheetDone";
import { RECEIPT_AUTO_CONFIRM_DAYS } from "@domain/constants";
import { formatDueDate, formatLocalDate } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";
import { proofFileError, uploadProof } from "../../../lib/proofUpload";
import { ui } from "../../../lib/ui";

/** How a payout's net amount was reached (R-PAY-03, R-DEC-39): the pot, less what the recipient owed. */
export function PayoutBreakdown({ payout }: { payout: PayoutView }) {
  const rows = [
    { label: "Pot", value: payout.gross, sign: "" },
    { label: "Their unpaid share this round", value: payout.ownShortfall, sign: "−" },
    { label: "Debt interest", value: payout.interestDeducted, sign: "−" },
    { label: "Debt principal", value: payout.principalDeducted, sign: "−" },
    // R-DEC-39: the fee on the unpaid share and the principal.
    { label: "Organizing fee", value: payout.feeDeducted, sign: "−" },
  ].filter((row, i) => i === 0 || row.value > 0);
  return (
    <dl className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white text-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-3 px-4 py-2.5">
          <dt className="text-ink-600">{row.label}</dt>
          <dd className="font-semibold tabular-nums text-ink-900">
            {row.sign}
            {formatPeso(row.value)}
          </dd>
        </div>
      ))}
      <div className="flex justify-between gap-3 bg-ink-50 px-4 py-2.5">
        <dt className="font-bold text-ink-900">Handed over</dt>
        <dd className="font-heading text-lg font-bold tabular-nums text-ink-900">{formatPeso(payout.net)}</dd>
      </div>
    </dl>
  );
}

/**
 * R-PAY-05 for one payout. The organizer marks it handed over (optional proof); the recipient then
 * confirms they got it. For a placeholder, the organizer's handover is also the receipt.
 */
export function PayoutSheet({
  detail,
  payout,
  pending,
  onClose,
  onHandOver,
  onConfirm,
}: {
  detail: GroupDetail;
  payout: PayoutView | null;
  pending: string | null;
  onClose: () => void;
  onHandOver: (round: number, proofPath?: string) => Promise<boolean>;
  onConfirm: (round: number) => Promise<boolean>;
}) {
  if (!payout) return null;
  return (
    <PayoutForm
      key={payout.round}
      detail={detail}
      payout={payout}
      pending={pending}
      onClose={onClose}
      onHandOver={onHandOver}
      onConfirm={onConfirm}
    />
  );
}

function PayoutForm({
  detail,
  payout,
  pending,
  onClose,
  onHandOver,
  onConfirm,
}: {
  detail: GroupDetail;
  payout: PayoutView;
  pending: string | null;
  onClose: () => void;
  onHandOver: (round: number, proofPath?: string) => Promise<boolean>;
  onConfirm: (round: number) => Promise<boolean>;
}) {
  const recipient = detail.slots.find((s) => s.id === payout.recipientSlotId);
  const isRecipient = payout.recipientSlotId === detail.viewer.slotId;
  const handingOver = detail.viewer.isOrganizer && payout.status === "AWAITING_HANDOVER";
  // The organizer's own payout: they hold the pot already, so taking it is the receipt.
  const ownPayout = handingOver && isRecipient;
  const confirming = isRecipient && payout.status === "HANDED_OVER";
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Once recorded: what was done, shown instead of closing on the spot.
  const [done, setDone] = useState<"handedOver" | "received" | null>(null);
  const fileId = useId();
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function handOver() {
    setError("");
    try {
      let proofPath: string | undefined;
      if (file) {
        setUploading(true);
        proofPath = await uploadProof(detail.group.id, file);
      }
      if (await onHandOver(payout.round, proofPath)) setDone("handedOver");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save it. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || pending === "handover" || pending === "confirm";
  const name = isRecipient ? "you" : (recipient?.name ?? "the recipient");
  if (done) {
    // R-PAY-05: the recipient confirms; for a placeholder the organizer's record is the receipt.
    const title =
      done === "received" ? "Payout received" : isRecipient ? `You took your ${formatPeso(payout.net)}` : `Handed over to ${name}`;
    return (
      <SheetDone title={title} onClose={onClose}>
        {done === "received" || isRecipient
          ? `Round ${payout.round}'s ${formatPeso(payout.net)} is recorded as received.`
          : recipient?.kind === "PLACEHOLDER"
            ? `Round ${payout.round}'s ${formatPeso(payout.net)} is recorded for ${name}.`
            : `${name} is asked to confirm they got ${formatPeso(payout.net)}.`}
      </SheetDone>
    );
  }
  return (
    <Sheet
      open
      onClose={onClose}
      title={confirming ? `Did you get ${formatPeso(payout.net)}?` : `Round ${payout.round} payout to ${isRecipient ? "you" : recipient?.name}`}
      subtitle={`Payout date ${formatDueDate(payout.payoutDate)}`}
      footer={
        handingOver ? (
          <button type="button" onClick={() => void handOver()} disabled={busy} className={`${ui.btnPrimaryFull} min-h-11`}>
            {uploading
              ? "Uploading photo…"
              : pending === "handover"
                ? "Saving…"
                : ownPayout
                  ? `I took my ${formatPeso(payout.net)}`
                  : `I handed ${formatPeso(payout.net)} to ${name}`}
          </button>
        ) : confirming ? (
          <button
            type="button"
            onClick={() => void onConfirm(payout.round).then((ok) => ok && setDone("received"))}
            disabled={busy}
            className={`${ui.btnPrimaryFull} min-h-11`}
          >
            {pending === "confirm" ? "Confirming…" : "Yes, I received it"}
          </button>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <PayoutBreakdown payout={payout} />
        {payout.net === 0 && (
          <p className="text-sm text-ink-600">What {name} owed used up the whole pot, so there was nothing to hand over.</p>
        )}
        {handingOver && !ownPayout && (
          <div>
            <span className={ui.label}>Proof (optional)</span>
            {file && preview ? (
              <div className="relative overflow-hidden rounded-2xl border-2 border-ink-200 bg-ink-50">
                <img src={preview} alt="Handover proof to attach" className="max-h-56 w-full object-contain" />
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  aria-label="Remove photo"
                  className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink-700 shadow-card"
                >
                  <X className="h-5 w-5" aria-hidden />
                </button>
              </div>
            ) : (
              <label
                htmlFor={fileId}
                className="flex min-h-16 cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-ink-300 bg-white px-4 py-3 text-sm font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50"
              >
                <Camera className="h-5 w-5" aria-hidden />
                Add a photo of the transfer
                <input
                  id={fileId}
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const chosen = e.target.files?.[0];
                    e.target.value = "";
                    if (!chosen) return;
                    const problem = proofFileError(chosen);
                    if (problem) setError(problem);
                    else setFile(chosen);
                  }}
                />
              </label>
            )}
            <p className={ui.helperText}>
              {recipient?.kind === "PLACEHOLDER"
                ? `${recipient.name} has no account, so this also counts as received.`
                : `${recipient?.name} is asked to confirm they got it.`}
            </p>
          </div>
        )}
        {payout.status === "HANDED_OVER" && !confirming && (
          <p className="text-sm text-ink-600">Handed over. Waiting for {recipient?.name} to confirm.</p>
        )}
        {payout.status === "CONFIRMED" && (
          <p className="text-sm text-ink-600">
            {payout.net === 0
              ? "Nothing to hand over."
              : payout.autoConfirmed
                ? `Marked received automatically ${formatLocalDate(payout.confirmedAt)}: not confirmed within ${RECEIPT_AUTO_CONFIRM_DAYS} days.`
                : `Received${payout.confirmedAt ? ` ${formatLocalDate(payout.confirmedAt)}` : ""}.`}
          </p>
        )}
        {payout.proofUrl && (
          <a href={payout.proofUrl} target="_blank" rel="noreferrer" className={ui.link}>
            View handover photo
          </a>
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
