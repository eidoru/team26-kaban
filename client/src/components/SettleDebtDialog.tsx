import { type FormEvent, useEffect, useState } from "react";
import { ui } from "../lib/ui";
import { Modal } from "./Modal";

export function SettleDebtDialog({
  open,
  title,
  description,
  submitLabel = "Settle",
  cancelLabel = "Cancel",
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  onSubmit: (result: { amount: number; note?: string }) => void;
  onCancel: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount("");
      setNote("");
      setError(null);
    }
  }, [open]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const parsed = Number(amount.trim());
    if (Number.isNaN(parsed) || parsed <= 0) {
      setError("Enter a valid positive amount.");
      return;
    }
    onSubmit({
      amount: parsed,
      note: note.trim() || undefined,
    });
  }

  return (
    <Modal open={open} title={title} description={description} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="settle-amount" className={ui.label}>
            Amount (₱)
          </label>
          <input
            id="settle-amount"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setError(null);
            }}
            placeholder="0.00"
            className={ui.input}
          />
        </div>
        <div>
          <label htmlFor="settle-note" className={ui.label}>
            Note (optional)
          </label>
          <input
            id="settle-note"
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note"
            className={ui.input}
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className={ui.btnSecondary}>
            {cancelLabel}
          </button>
          <button type="submit" disabled={!amount.trim()} className={ui.btnPrimary}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
