import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ui } from "../../lib/ui";

/**
 * The page's one primary action, pinned to the bottom of the screen. On phones it sits above the
 * fixed bottom nav; from md up (no bottom nav) it pins to the bottom edge. It publishes its height as
 * `--action-bar-height`, which AppLayout's <main> adds to its bottom padding so the bar never covers
 * the end of the page. (An in-page spacer would pick up its list's `space-y-*` gap and overshoot.)
 *
 * The bar itself renders into <body>: inside the page it would pick up the gaps of whatever list it
 * sits in (a parent's `space-y-*` adds a bottom margin as soon as a sheet renders after it), and a
 * margin on a fixed element moves it. Because of that, a submit button in the bar must name its form
 * with the `form` attribute.
 */
export function ActionBar({ hint, children }: { hint?: ReactNode; children: ReactNode }) {
  const barRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => root.style.setProperty("--action-bar-height", `${bar.offsetHeight}px`));
    observer.observe(bar);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--action-bar-height");
    };
  }, []);

  return createPortal(
    <div
      ref={barRef}
      data-action-bar
      className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 border-t border-ink-200 bg-cream/95 backdrop-blur md:bottom-0"
    >
      <div className={`mx-auto flex ${ui.page} flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6`}>
        {hint && <p className="text-center text-xs font-semibold text-ink-500 sm:mr-auto sm:text-left">{hint}</p>}
        <div className="flex gap-2 [&>*]:min-h-11 [&>*]:flex-1 sm:[&>*]:flex-none">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
