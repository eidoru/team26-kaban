import { useEffect, useId, useMemo, useState } from "react";
import { Camera, X } from "lucide-react";
import type { GroupDetail, PayoutView } from "../../../api/client";
import { Sheet } from "../../../components/flow/Sheet";
import { SheetDone } from "../../../components/flow/SheetDone";
import { RECEIPT_AUTO_CONFIRM_DAYS } from "@domain/constants";
import { proofError } from "@domain/submissions";
import { formatDueDate, formatLocalDate } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";
import { proofFileError, uploadProof } from "../../../lib/proofUpload";
import { ui } from "../../../lib/ui";

/** How a payout's net amount was reached (R-PAY-03): the pot, less what the recipient owed. */
export function PayoutBreakdown({ payout }: { payout: PayoutView }) {
  const rows = [
    { label: "Pot", value: payout.gross, sign: "" },
    { label: "Their unpaid share this round", value: payout.ownShortfall, sign: "−" },
    { label: "Debt interest", value: payout.interestDeducted, sign: "−" },
    { label: "Debt principal", value: payout.principalDeducted, sign: "−" },
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
 * R-PAY-05 for one payout. The organizer marks it handed over with a proof photo (R-DEC-37, their
 * own payout included, R-DEC-44); the recipient then confirms they got it. For a placeholder or the
 * organizer's own payout, the handover is also the receipt. A recipient who never got it says so,
 * and it goes back to the organizer (R-DEC-46).
 */
export function PayoutSheet({
  detail,
  payout,
  pending,
  onClose,
  onHandOver,
  onConfirm,
  onNotReceived,
}: {
  detail: GroupDetail;
  payout: PayoutView | null;
  pending: string | null;
  onClose: () => void;
  onHandOver: (round: number, proofPath?: string) => Promise<boolean>;
  onConfirm: (round: number) => Promise<boolean>;
  onNotReceived: (round: number) => Promise<boolean>;
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
      onNotReceived={onNotReceived}
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
  onNotReceived,
}: {
  detail: GroupDetail;
  payout: PayoutView;
  pending: string | null;
  onClose: () => void;
  onHandOver: (round: number, proofPath?: string) => Promise<boolean>;
  onConfirm: (round: number) => Promise<boolean>;
  onNotReceived: (round: number) => Promise<boolean>;
}) {
  const recipient = detail.slots.find((s) => s.id === payout.recipientSlotId);
  const isRecipient = payout.recipientSlotId === detail.viewer.slotId;
  const handingOver = detail.viewer.isOrganizer && payout.status === "AWAITING_HANDOVER";
  // The organizer's own payout: they hold the pot already, so taking it, with proof, is the receipt.
  const ownPayout = handingOver && isRecipient;
  const confirming = isRecipient && payout.status === "HANDED_OVER";
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  // Once recorded: what was done, shown instead of closing on the spot.
  const [done, setDone] = useState<"handedOver" | "received" | "notReceived" | null>(null);
  // R-DEC-46: saying it never came takes back the handover, so it's asked twice.
  const [denying, setDenying] = useState(false);
  const fileId = useId();
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  async function handOver() {
    if (!file) return;
    setError("");
    try {
      setUploading(true);
      const proofPath = await uploadProof(detail.group.id, file);
      if (await onHandOver(payout.round, proofPath)) setDone("handedOver");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save it. Try again.");
    } finally {
      setUploading(false);
    }
  }

  const busy = uploading || pending === "handover" || pending === "confirm" || pending === "notReceived";
  const missingProof = proofError(!!file);
  const name = isRecipient ? "you" : (recipient?.name ?? "the recipient");
  if (done === "notReceived") {
    return (
      <SheetDone title={`${detail.group.organizerName} was told`} onClose={onClose}>
        They're asked to hand over {formatPeso(payout.net)} again, with a new photo.
      </SheetDone>
    );
  }
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
          <button
            type="button"
            onClick={() => void handOver()}
            disabled={busy || !!missingProof}
            className={`${ui.btnPrimaryFull} min-h-11`}
          >
            {uploading
              ? "Uploading photo…"
              : pending === "handover"
                ? "Saving…"
                : ownPayout
                  ? `I took my ${formatPeso(payout.net)}`
                  : `I handed ${formatPeso(payout.net)} to ${name}`}
          </button>
        ) : confirming && denying ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDenying(false)} disabled={busy} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Back
            </button>
            <button
              type="button"
              onClick={() => void onNotReceived(payout.round).then((ok) => ok && setDone("notReceived"))}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full bg-danger-600 px-5 text-sm font-bold text-white hover:bg-danger-700 disabled:opacity-50"
            >
              {pending === "notReceived" ? "Sending…" : "Tell the organizer"}
            </button>
          </div>
        ) : confirming ? (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => void onConfirm(payout.round).then((ok) => ok && setDone("received"))}
              disabled={busy}
              className={`${ui.btnPrimaryFull} min-h-11`}
            >
              {pending === "confirm" ? "Confirming…" : "Yes, I received it"}
            </button>
            <button type="button" onClick={() => setDenying(true)} disabled={busy} className={`${ui.btnSecondary} min-h-11 w-full`}>
              I didn't get it
            </button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4">
        <PayoutBreakdown payout={payout} />
        {payout.net === 0 && (
          <p className="text-sm text-ink-600">What {name} owed used up the whole pot, so there was nothing to hand over.</p>
        )}
        {handingOver && (
          <div>
            <span className={ui.label}>Proof</span>
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
                {ownPayout ? "Add a photo of your payout" : "Add a photo of the transfer"}
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
          </div>
        )}
        {confirming && denying && (
          <p className="text-sm text-ink-600">
            {detail.group.organizerName} is told, and the handover is taken back until they send it again.
          </p>
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
