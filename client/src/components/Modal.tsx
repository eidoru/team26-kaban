import { type ReactNode, useEffect, useId, useRef } from "react";
import { ui } from "../lib/ui";

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

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !cancelable || !onClose) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose!();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, cancelable, onClose]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelector<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    );
    focusable?.focus();
  }, [open]);

  if (!open) return null;

  function handleBackdropClick() {
    if (cancelable && onClose) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Close dialog"
        className="absolute inset-0 bg-slate-900/40"
        onClick={handleBackdropClick}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`relative w-full max-w-md ${ui.cardCompact}`}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className={ui.sectionHeading}>
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-2 text-sm text-slate-600">
            {description}
          </p>
        )}
        <div className={description ? "mt-4" : "mt-3"}>{children}</div>
      </div>
    </div>
  );
}
