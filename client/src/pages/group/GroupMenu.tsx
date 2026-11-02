import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, type LucideIcon } from "lucide-react";

export interface GroupMenuItem {
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

/**
 * The group header's ⋯ menu: rare, final actions kept out of the page's way. The organizer's
 * "Cancel this paluwagan" in the lobby (R-LOB-06, R-DEC-03); a member's "Leave…" after launch (§9.1).
 */
export function GroupMenu({ items, disabled }: { items: GroupMenuItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        className="flex h-10 w-10 items-center justify-center rounded-full text-ink-600 transition-colors hover:bg-ink-100"
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="animate-pop absolute right-0 top-12 z-50 w-60 origin-top-right rounded-2xl border border-ink-200 bg-white p-1.5 shadow-lift"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger-700 hover:bg-danger-50 disabled:opacity-50"
            >
              <item.icon className="h-4 w-4" aria-hidden />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
