import type { ReactNode } from "react";

/**
 * The page's one primary action, pinned to the bottom of the screen. On phones it sits above the
 * fixed bottom nav; from md up (no bottom nav) it pins to the bottom edge. A spacer of the same
 * height keeps it from covering the end of the page.
 */
export function ActionBar({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  return (
    <>
      <div className="h-24" aria-hidden />
      <div
        data-action-bar
        className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-ink-200 bg-cream/95 backdrop-blur md:bottom-0"
      >
        <div className="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6">
          {hint && <p className="text-center text-xs font-semibold text-ink-500 sm:mr-auto sm:text-left">{hint}</p>}
          <div className="flex gap-2 [&>*]:min-h-11 [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>
        </div>
      </div>
    </>
  );
}
