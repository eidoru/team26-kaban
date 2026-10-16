import { type ReactNode, useId, useRef } from "react";
import { ui } from "../lib/ui";
import { useDialogBehavior } from "../lib/useDialogBehavior";

export function Modal({
  open,
  title,
  description,
  onClose,
  cancelable = true,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose?: () => void;
  cancelable?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogBehavior(open, panelRef, onClose, cancelable);

  if (!open) return null;

  function handleBackdropClick() {
    if (cancelable && onClose) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
        onClick={handleBackdropClick}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className="animate-pop relative w-full max-w-md rounded-3xl border border-ink-200 bg-white p-6 shadow-lift"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className={ui.sectionHeading}>
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-2 text-sm text-ink-600">
            {description}
          </p>
        )}
        <div className={description ? "mt-4" : "mt-3"}>{children}</div>
      </div>
    </div>
  );
}
