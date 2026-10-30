import { useEffect, useId, useMemo, useState } from "react";
import { Camera, X } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@domain/constants";
import { contributionAmountError, roundsLabel, splitContribution, submissionAmountError } from "@domain/submissions";
import type { GroupDetail, SlotView } from "../../../api/client";
import { AmountField } from "../../../components/flow/AmountField";
import { Sheet } from "../../../components/flow/Sheet";
import { SheetDone } from "../../../components/flow/SheetDone";
import { formatPeso, formatRate, parsePesoInput, pesoInputValue } from "../../../lib/money";
import { proofFileError, uploadProof } from "../../../lib/proofUpload";
import { ui } from "../../../lib/ui";
import { debtReportable, feeRateOf, owedBy, paymentFee, payRooms, standingOf } from "./period";

export type PayMode = "CONTRIBUTION" | "DEBT_PAYMENT";
type PayInput = { slotId: string; type: PayMode; amount: number; proofPath?: string; note?: string };

/**
 * Report a payment (R-SUB-01): a contribution for the open period, or a payment toward debt
 * (R-DBT-04). Members report their own; the organizer records for themselves and placeholders
 * (R-SUB-02). The amount defaults to what's left and can't go over it (R-SUB-06). Proof is optional.
 * A contribution fills what's left of the open round, then later rounds in order once the debt is
 * covered (paying ahead, R-DEC-31); the server splits it, one part per round (R-DEC-33).
 * With an organizing fee, the sheet shows the fee and the total to send (R-DEC-39).
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
  const open = isDebt ? null : standingOf(detail, slot.id)!;
  const openRound = detail.period?.number ?? null;
  const pay = isDebt ? null : payRooms(detail, slot.id);
  const cap = isDebt ? debtReportable(detail, slot.id) : pay!.cap;
  // Nothing left this round: the whole payment goes ahead (R-DEC-31).
  const aheadOnly = !!pay && pay.openRoom === 0 && pay.cap > 0;
  // By default what's left this round, or one round's worth when paying ahead.
  const suggested = isDebt ? cap : (pay!.rooms[0]?.room ?? 0);
  const [amountText, setAmountText] = useState(suggested > 0 ? pesoInputValue(suggested) : "");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  const [stage, setStage] = useState<"idle" | "uploading" | "sending">("idle");
  const [error, setError] = useState("");
  // Once sent: what was sent, shown instead of closing on the spot.
  const [sent, setSent] = useState<{ amount: number; fee: number; rounds: number[] } | null>(null);
  const fileId = useId();
  const noteId = useId();

  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  const amount = parsePesoInput(amountText);
  const amountError = Number.isNaN(amount)
    ? "Enter an amount like 1000 or 1,000.50."
    : isDebt
      ? submissionAmountError(amount, cap)
      : contributionAmountError(amount, cap, pay!.blockedByDebt);
  // R-DEC-33: how the server will split it, shown once it reaches past this round.
  const parts = pay && !amountError ? splitContribution(amount, pay.rooms) : [];
  const reachesAhead = parts.some((p) => p.round !== openRound);
  const feeRate = feeRateOf(detail, slot);
  const fee = amountError
    ? 0
    : isDebt
      ? paymentFee(detail, slot, { type: "DEBT_PAYMENT", amount })
      : paymentFee(detail, slot, { type: "CONTRIBUTION", parts });
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
      if (await onSubmit({ slotId: slot.id, type: mode, amount, proofPath, note: note.trim() || undefined })) {
        setSent({ amount, fee, rounds: parts.map((p) => p.round) });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send it. Try again.");
    } finally {
      setStage("idle");
    }
  }

  if (sent !== null) {
    // R-SUB-03: everything waits for the organizer's review, the organizer's own reports included.
    const reviewer = detail.viewer.isOrganizer ? "you approve it in the review queue" : `${detail.group.organizerName} approves it`;
    return (
      <SheetDone title={forSomeoneElse ? `Recorded for ${slot.name}` : "Sent for review"} onClose={onClose}>
        {formatPeso(sent.amount)}
        {sent.fee > 0 && ` + ${formatPeso(sent.fee)} fee`}
        {isDebt ? " toward the debt" : ` for ${roundsLabel(sent.rounds)}`} counts once {reviewer}.
      </SheetDone>
    );
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
            : aheadOnly
              ? "Pay ahead"
              : "Report a payment"
      }
      subtitle={
        isDebt
          ? `Owes ${formatPeso(owedBy(detail, slot.id))} · ${formatPeso(cap)} left to report`
          : pay!.openRoom > 0
            ? `Round ${openRound} · ${formatPeso(pay!.openRoom)} left${
                pay!.ahead > 0 ? ` · up to ${formatPeso(cap)} with later rounds` : " to report"
              }`
            : `Round ${openRound} is covered · up to ${formatPeso(cap)} ahead`
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
        {/* The one rule worth stating here: how a debt payment is applied (R-DBT). */}
        {isDebt && (
          <p className="text-sm text-ink-600">
            Pays interest first, then the rest.{feeRate > 0 && " The fee is only on the rest."}
          </p>
        )}
        {/* R-DEC-31: what paying ahead means for the member. */}
        {pay && pay.ahead > 0 && (
          <p className="text-sm text-ink-600">
            {aheadOnly ? "It" : "Anything over this round"} goes to the next rounds in order, and counts toward each
            when it opens.
          </p>
        )}
        <AmountField
          label={feeRate > 0 ? "Amount, before the fee" : "Amount paid"}
          value={amountText}
          onChange={setAmountText}
          error={amountError}
          helper={
            !aheadOnly && open && open.approved > 0
              ? `${formatPeso(open.approved)} already approved this round.`
              : undefined
          }
        />
        {/* R-DEC-39: paid on top, in the same transfer. */}
        {fee > 0 && (
          <dl className="divide-y divide-ink-100 rounded-2xl bg-ink-50 px-4 text-sm" aria-live="polite">
            <div className="flex justify-between gap-3 py-2">
              <dt className="text-ink-700">Organizing fee ({formatRate(feeRate)})</dt>
              <dd className="font-semibold text-ink-900 tabular-nums">{formatPeso(fee)}</dd>
            </div>
            <div className="flex justify-between gap-3 py-2">
              <dt className="font-semibold text-ink-900">{forSomeoneElse ? "Total paid" : "Send in total"}</dt>
              <dd className="font-bold text-ink-900 tabular-nums">{formatPeso(amount + fee)}</dd>
            </div>
          </dl>
        )}
        {reachesAhead && (
          <ul aria-label="How it's split" className="divide-y divide-ink-100 rounded-2xl bg-ink-50 px-4 text-sm">
            {parts.map((p) => (
              <li key={p.round} className="flex justify-between gap-3 py-2">
                <span className="text-ink-700">
                  Round {p.round}
                  {p.round === openRound && <span className="text-ink-500"> (this round)</span>}
                </span>
                <span className="font-semibold text-ink-900 tabular-nums">{formatPeso(p.amount)}</span>
              </li>
            ))}
          </ul>
        )}

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
