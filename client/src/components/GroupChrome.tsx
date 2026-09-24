import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { ui } from "../lib/ui";

export type GroupPhase = "create" | "forming" | "active" | "completed";

const PHASES: { id: GroupPhase; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "forming", label: "Forming" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
];

export function GroupPhaseRail({ phase }: { phase: GroupPhase }) {
  const currentIndex = PHASES.findIndex((p) => p.id === phase);

  return (
    <nav aria-label="Paluwagan lifecycle" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1.5">
        {PHASES.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step.id} className="flex items-center gap-1.5" aria-current={state === "current" ? "step" : undefined}>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                  state === "current"
                    ? "bg-brand-700 text-white"
                    : state === "done"
                      ? "bg-brand-100 text-brand-800"
                      : "bg-ink-100 text-ink-500"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    state === "current"
                      ? "bg-white text-brand-700"
                      : state === "done"
                        ? "bg-brand-700 text-white"
                        : "border border-ink-300 bg-white text-ink-500"
                  }`}
                >
                  {state === "done" ? <Check className="h-3 w-3" strokeWidth={3.5} aria-hidden /> : index + 1}
                </span>
                {step.label}
              </span>
              {index < PHASES.length - 1 && (
                <span
                  className={`h-0.5 w-4 rounded-full ${index < currentIndex ? "bg-brand-300" : "bg-ink-200"}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export type GroupFact = { label: string; value: string };

export function GroupHeader({
  title,
  phase,
  facts,
  action,
}: {
  title: string;
  phase: GroupPhase;
  facts: GroupFact[];
  action?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="border-b border-ink-100 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {/* The phase rail below already shows the current stage, so no separate status pill here. */}
            <h1 className={ui.pageTitle}>{title}</h1>
            <div className="mt-4">
              <GroupPhaseRail phase={phase} />
            </div>
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>

        {facts.length > 0 && (
          <dl className={ui.factStrip}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{fact.label}</dt>
                <dd className="mt-0.5 text-sm font-bold text-ink-900 tabular-nums">{fact.value}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
    </div>
  );
}

export type SectionNavItem = {
  id: string;
  label: string;
  badge?: number;
  disabled?: boolean;
};

export function GroupSidebar({
  items,
  active,
  onSelect,
}: {
  items: SectionNavItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav aria-label="Sections">
      <ul role="tablist" className={ui.sidebarNav}>
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id} role="presentation" className="shrink-0 md:shrink">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={item.disabled}
                onClick={() => !item.disabled && onSelect(item.id)}
                className={`${ui.sidebarNavItem} ${
                  item.disabled
                    ? ui.sidebarNavItemDisabled
                    : isActive
                      ? ui.sidebarNavItemActive
                      : ui.sidebarNavItemIdle
                }`}
              >
                <span>{item.label}</span>
                {item.badge != null && item.badge > 0 && (
                  <span
                    className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none ${
                      isActive ? "bg-white/20 text-white" : "bg-danger-600 text-white"
                    }`}
                  >
                    {item.badge > 99 ? "99+" : item.badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function GroupSectionLayout({
  items,
  active,
  onSelect,
  children,
}: {
  items: SectionNavItem[];
  active: string;
  onSelect: (id: string) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <div className="relative md:w-44 md:shrink-0">
        <GroupSidebar items={items} active={active} onSelect={onSelect} />
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-cream md:hidden" />
      </div>
      <div className="min-w-0 flex-1" role="tabpanel">
        {children}
      </div>
    </div>
  );
}
