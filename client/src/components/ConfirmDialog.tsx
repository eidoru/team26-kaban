import { ui } from "../lib/ui";
import { Modal } from "./Modal";

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const confirmClass =
    variant === "danger"
      ? "rounded-xl bg-red-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-red-700 disabled:opacity-60"
      : ui.btnPrimary;

  return (
    <Modal open={open} title={title} description={description} onClose={onCancel}>
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} className={ui.btnSecondary}>
          {cancelLabel}
        </button>
        <button type="button" onClick={onConfirm} className={confirmClass}>
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
