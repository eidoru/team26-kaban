import { type RefObject, useEffect } from "react";

/**
 * What every modal surface (Modal, Sheet) does while open: lock page scroll, close on Escape when
 * cancelable, and move focus to the first control inside `panelRef`.
 */
export function useDialogBehavior(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose: (() => void) | undefined,
  cancelable = true,
) {
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
  }, [open, panelRef]);
}
