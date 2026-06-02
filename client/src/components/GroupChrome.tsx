import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { statusBadgeClass, ui } from "../lib/ui";

export type GroupPhase = "create" | "forming" | "active" | "completed";

const PHASES: { id: GroupPhase; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "forming", label: "Forming" },
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
];

const PHASE_BADGE: Record<GroupPhase, { label: string; className: string }> = {
  create: { label: "Draft", className: ui.badgeForming },
  forming: { label: "Forming", className: statusBadgeClass("forming") },
  active: { label: "Active", className: statusBadgeClass("active") },
  completed: { label: "Completed", className: statusBadgeClass("completed") },
};

function CheckMark() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

export function GroupPhaseRail({ phase }: { phase: GroupPhase }) {
  const currentIndex = PHASES.findIndex((p) => p.id === phase);

  return (
    <nav aria-label="Paluwagan lifecycle" className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1.5">
        {PHASES.map((step, index) => {
          const state = index < currentIndex ? "done" : index === currentIndex ? "current" : "upcoming";
          return (
            <li key={step.id} className="flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                  state === "current"
                    ? "bg-emerald-900 text-white"
                    : state === "done"
                      ? "bg-emerald-50 text-emerald-800"
                      : "bg-gray-100 text-slate-400"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    state === "current"
                      ? "bg-white text-emerald-900"
                      : state === "done"
                        ? "bg-emerald-700 text-white"
                        : "border border-gray-300 bg-white text-slate-400"
                  }`}
                >
                  {state === "done" ? <CheckMark /> : index + 1}
                </span>
                {step.label}
              </span>
              {index < PHASES.length - 1 && (
                <span
                  className={`h-px w-4 ${index < currentIndex ? "bg-emerald-300" : "bg-gray-200"}`}
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
  backTo = "/home",
  backLabel = "Home",
}: {
  title: string;
  phase: GroupPhase;
  facts: GroupFact[];
  action?: ReactNode;
  backTo?: string;
  backLabel?: string;
}) {
  const badge = PHASE_BADGE[phase];

  return (
    <div className="mb-8">
      <Link to={backTo} className={ui.backLink}>
        <span className={ui.backLinkArrow}>←</span>
        {backLabel}
      </Link>

      <div className="border-b border-gray-100 pb-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className={ui.pageTitle}>{title}</h1>
              <span className={`${badge.className} shrink-0`}>{badge.label}</span>
            </div>
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
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{fact.label}</dt>
                <dd className="mt-0.5 text-sm font-medium text-slate-900">{fact.value}</dd>
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
      <ul className={ui.sidebarNav}>
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id} className="shrink-0 md:shrink">
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
                      isActive ? "bg-white/20 text-white" : "bg-red-600 text-white"
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
      <div className="md:w-44 md:shrink-0">
        <GroupSidebar items={items} active={active} onSelect={onSelect} />
      </div>
      <div className="min-w-0 flex-1" role="tabpanel">
        {children}
      </div>
    </div>
  );
}
