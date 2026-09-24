import type { ReactNode } from "react";
import { X } from "lucide-react";

const PIECE_COLORS = ["bg-sun-300", "bg-brand-500", "bg-sun-500", "bg-brand-400", "bg-sun-200", "bg-brand-600"];

// Fixed positions/delays so renders are deterministic; animation plays once on mount.
const PIECES = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37) % 92 + 4}%`,
  delay: `${((i * 7) % 10) / 20}s`,
  color: PIECE_COLORS[i % PIECE_COLORS.length],
}));

/** Celebratory card; `burst` adds a one-shot CSS confetti burst (disabled under reduced motion). */
export function Celebration({
  title,
  children,
  onDismiss,
  burst = true,
}: {
  title: string;
  children?: ReactNode;
  onDismiss?: () => void;
  burst?: boolean;
}) {
  return (
    <div
      role="status"
      className="animate-pop relative overflow-hidden rounded-3xl border-2 border-sun-200 bg-sun-100 p-6"
    >
      {burst && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          {PIECES.map((p, i) => (
            <span
              key={i}
              className={`animate-confetti absolute -top-3 h-3 w-2 rounded-sm ${p.color}`}
              style={{ left: p.left, animationDelay: p.delay }}
            />
          ))}
        </div>
      )}
      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="font-heading text-2xl font-bold text-ink-900">{title}</p>
          {children && <div className="mt-1 text-sm text-ink-700">{children}</div>}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-full p-1.5 text-ink-600 transition-colors hover:bg-white/60"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
