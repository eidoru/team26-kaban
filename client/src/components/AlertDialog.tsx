import { ui } from "../lib/ui";
import { Modal } from "./Modal";

export function AlertDialog({
  open,
  title,
  description,
  okLabel = "OK",
  onClose,
}: {
  open: boolean;
  title: string;
  description?: string;
  okLabel?: string;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} description={description} onClose={onClose} cancelable={false}>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className={ui.btnPrimary}>
          {okLabel}
        </button>
      </div>
    </Modal>
  );
}
