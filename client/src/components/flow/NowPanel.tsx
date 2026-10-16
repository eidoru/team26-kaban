import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

const TONES = {
  brand: { panel: "border-brand-200 bg-brand-50", icon: "bg-brand-700 text-white", eyebrow: "text-brand-700" },
  sun: { panel: "border-sun-200 bg-sun-50", icon: "bg-sun-400 text-sun-950", eyebrow: "text-sun-800" },
  danger: { panel: "border-danger-200 bg-danger-50", icon: "bg-danger-600 text-white", eyebrow: "text-danger-700" },
  calm: { panel: "border-ink-200 bg-white", icon: "bg-ink-100 text-ink-600", eyebrow: "text-ink-500" },
} as const;

export type NowTone = keyof typeof TONES;

/**
 * The top of every group page: the viewer's next step. `brand` when there's something to do, `sun`
 * for a heads-up, `danger` for something overdue, `calm` when there's nothing to do but wait.
 * `children` holds inline actions or a short list (the organizer's queue).
 */
export function NowPanel({
  tone,
  icon: Icon,
  eyebrow,
  title,
  body,
  children,
}: {
  tone: NowTone;
  icon: LucideIcon;
  eyebrow: string;
  title: ReactNode;
  body?: ReactNode;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <section aria-label="What's next" className={`animate-rise rounded-3xl border-2 p-5 sm:p-6 ${t.panel}`}>
      <div className="flex items-start gap-4">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${t.icon}`} aria-hidden>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${t.eyebrow}`}>{eyebrow}</p>
          <h2 className="font-heading mt-0.5 text-xl font-bold text-ink-900 text-balance">{title}</h2>
          {body && <div className="mt-1 text-sm text-ink-600">{body}</div>}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </section>
  );
}
