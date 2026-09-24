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
      ? "inline-flex items-center justify-center rounded-full bg-danger-600 px-6 py-2.5 text-sm font-bold text-white shadow-[0_3px_0_var(--color-danger-800)] transition-all hover:bg-danger-700 active:translate-y-[2px] active:shadow-none disabled:opacity-50"
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
