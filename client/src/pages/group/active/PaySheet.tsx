import { useEffect, useId, useMemo, useState } from "react";
import { Camera, X } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@domain/constants";
import { submissionAmountError } from "@domain/submissions";
import type { GroupDetail, SlotView } from "../../../api/client";
import { AmountField } from "../../../components/flow/AmountField";
import { Sheet } from "../../../components/flow/Sheet";
import { formatPeso, parsePesoInput, pesoInputValue } from "../../../lib/money";
import { proofFileError, uploadProof } from "../../../lib/proofUpload";
import { ui } from "../../../lib/ui";
import { debtReportable, owedBy, standingOf } from "./period";

export type PayMode = "CONTRIBUTION" | "DEBT_PAYMENT";
type PayInput = { slotId: string; type: PayMode; amount: number; proofPath?: string; note?: string };

/**
 * Report a payment (R-SUB-01): a contribution for the open period, or a payment toward debt
 * (R-DBT-04). Members report their own; the organizer records for themselves and placeholders
 * (R-SUB-02). The amount defaults to what's left and can't go over it (R-SUB-06). Proof is optional.
 */
export function PaySheet({
  detail,
  target,
  onClose,
  onSubmit,
}: {
  detail: GroupDetail;
  /** Whose payment, and what kind; null when closed. */
  target: { slot: SlotView; mode: PayMode } | null;
  onClose: () => void;
  onSubmit: (input: PayInput) => Promise<boolean>;
}) {
  if (!target || (target.mode === "CONTRIBUTION" && !detail.period)) return null;
  return (
    <PayForm
      key={`${target.slot.id}-${target.mode}`}
      detail={detail}
      slot={target.slot}
      mode={target.mode}
      onClose={onClose}
      onSubmit={onSubmit}
    />
  );
}

function PayForm({
  detail,
  slot,
  mode,
  onClose,
  onSubmit,
}: {
  detail: GroupDetail;
  slot: SlotView;
  mode: PayMode;
  onClose: () => void;
  onSubmit: (input: PayInput) => Promise<boolean>;
}) {
  const isDebt = mode === "DEBT_PAYMENT";
  const standing = isDebt ? null : standingOf(detail, slot.id)!;
  const cap = isDebt ? debtReportable(detail, slot.id) : standing!.reportable;
  const [amountText, setAmountText] = useState(cap > 0 ? pesoInputValue(cap) : "");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [stage, setStage] = useState<"idle" | "uploading" | "sending">("idle");
  const [error, setError] = useState("");
  const fileId = useId();
  const noteId = useId();

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const amount = parsePesoInput(amountText);
  const amountError = Number.isNaN(amount) ? "Enter an amount like 1000 or 1,000.50." : submissionAmountError(amount, cap);
  const noteError = note.trim().length > NOTE_MAX_LENGTH ? `Up to ${NOTE_MAX_LENGTH} characters.` : null;
  const forSomeoneElse = !slot.isViewer;

  async function submit() {
    if (amountError || noteError || stage !== "idle") return;
    setError("");
    try {
      let proofPath: string | undefined;
      if (file) {
        setStage("uploading");
        proofPath = await uploadProof(detail.group.id, file);
      }
      setStage("sending");
      if (await onSubmit({ slotId: slot.id, type: mode, amount, proofPath, note: note.trim() || undefined })) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it. Try again.");
    } finally {
      setStage("idle");
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={
        isDebt
          ? forSomeoneElse
            ? `Record a debt payment for ${slot.name}`
            : "Pay toward your debt"
          : forSomeoneElse
            ? `Record a payment for ${slot.name}`
            : "Report a payment"
      }
      subtitle={
        isDebt
          ? `Owes ${formatPeso(owedBy(detail, slot.id))} · ${formatPeso(cap)} left to report`
          : `Round ${detail.period!.number} · ${formatPeso(cap)} left to report`
      }
      footer={
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!!amountError || !!noteError || stage !== "idle"}
          className={`${ui.btnPrimaryFull} min-h-11`}
        >
          {stage === "uploading" ? "Uploading photo…" : stage === "sending" ? "Sending…" : "Send for review"}
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
          {forSomeoneElse
            ? "Record money you received for this slot. It still needs your review, and the audit log shows you approved your own entry."
            : isDebt
              ? `Tell ${detail.group.organizerName} what you paid back. Once approved, it pays interest first, then the rest.`
              : `Tell ${detail.group.organizerName} what you paid. It counts once they approve it.`}
        </p>
        <AmountField
          label="Amount paid"
          value={amountText}
          onChange={setAmountText}
          error={amountError}
          helper={
            standing && standing.approved > 0 ? `${formatPeso(standing.approved)} already approved this round.` : undefined
          }
        />

        <div>
          <span className={ui.label}>Proof (optional)</span>
          {file && preview ? (
            <div className="relative overflow-hidden rounded-2xl border-2 border-ink-200 bg-ink-50">
              <img src={preview} alt="Proof to attach" className="max-h-64 w-full object-contain" />
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
              className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-ink-300 bg-white px-4 py-4 text-center text-sm font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/20"
            >
              <Camera className="h-5 w-5" aria-hidden />
              Add a photo of the receipt or screenshot
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
                  else {
                    setError("");
                    setFile(chosen);
                  }
                }}
              />
            </label>
          )}
          {!file && <p className={ui.helperText}>Without proof, the organizer sees “No proof attached”.</p>}
        </div>

        <div>
          <label htmlFor={noteId} className={ui.label}>
            Note (optional)
          </label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="e.g. GCash ref 1234"
            className={ui.input}
          />
          {noteError && <p className="mt-1.5 text-xs font-semibold text-danger-700">{noteError}</p>}
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
