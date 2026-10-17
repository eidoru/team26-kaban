import { type ReactNode, useId, useRef } from "react";
import { X } from "lucide-react";
import { ui } from "../../lib/ui";
import { useDialogBehavior } from "../../lib/useDialogBehavior";

/**
 * Details and secondary actions. Slides up from the bottom on phones and sits centered from sm up.
 * `footer` stays pinned below the scrolling body, for the sheet's main action. `wide` gives it more
 * room from sm up, for sheets with a photo and several notes (phones already use the full width).
 */
export function Sheet({
  open,
  title,
  subtitle,
  onClose,
  footer,
  wide = false,
  children,
}: {
  open: boolean;
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  wide?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useDialogBehavior(open, panelRef, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-ink-900/40 backdrop-blur-[2px]"
        onClick={onClose}
        tabIndex={-1}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`animate-rise relative flex max-h-[88dvh] w-full flex-col rounded-t-3xl border border-ink-200 bg-white shadow-lift sm:rounded-3xl ${wide ? "sm:max-w-3xl" : "sm:max-w-xl"}`}
      >
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-ink-200 sm:hidden" aria-hidden />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-3 sm:px-6 sm:pt-5">
          <div className="min-w-0">
            <h2 id={titleId} className={`${ui.sectionHeading} text-balance`}>
              {title}
            </h2>
            {subtitle && <div className="mt-0.5 text-sm text-ink-500">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-ink-100 hover:text-ink-900"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-5 sm:px-6">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-ink-100 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
