import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ui } from "../lib/ui";

export type GroupStatus = "forming" | "active" | "completed";

const STATUS_BADGE: Record<GroupStatus, { label: string; className: string }> = {
  forming: { label: "Forming", className: ui.badgeForming },
  active: { label: "Active", className: ui.badgeActive },
  completed: { label: "Completed", className: ui.badgeCompleted },
};

export type GroupFact = {
  label: string;
  value: string;
};

/**
 * Page title, status and one line of terms. Round/due details live on the This round tab and setup
 * progress in the forming checklist, so the header stays short and never repeats them.
 */
export function GroupHeader({
  title,
  status,
  subtitle,
  facts = [],
  factsClassName = "",
}: {
  title: string;
  status?: GroupStatus;
  subtitle?: string;
  facts?: GroupFact[];
  factsClassName?: string;
}) {
  const badge = status ? STATUS_BADGE[status] : null;
  return (
    <div className="mb-6 border-b border-ink-100 pb-5 sm:mb-8 sm:pb-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className={ui.pageTitle}>{title}</h1>
        {badge && <span className={badge.className}>{badge.label}</span>}
      </div>
      {subtitle && <p className={ui.pageSubtitle}>{subtitle}</p>}

      {facts.length > 0 && (
        <dl className={`${ui.factStrip} ${factsClassName}`}>
          {facts.map((fact) => (
            <div key={fact.label}>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{fact.label}</dt>
              <dd className="mt-0.5 text-sm font-bold tabular-nums text-ink-900">{fact.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

export type SectionNavItem = {
  id: string;
  label: string;
  badge?: number;
  disabled?: boolean;
  /** Used by the compact phone tab row (4+ tabs): icon above a short label. */
  icon?: LucideIcon;
  shortLabel?: string;
};

// Static strings so Tailwind generates them.
const PHONE_TAB_COLUMNS: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

function TabBadge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none ${
        active ? "bg-white/20 text-white" : "bg-danger-600 text-white"
      }`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

/** Phones: a segmented tab row that always fits (icon + short label at 4+ tabs). md+: a vertical sidebar. */
export function GroupSidebar({
  items,
  active,
  onSelect,
}: {
  items: SectionNavItem[];
  active: string;
  onSelect: (id: string) => void;
}) {
  const compact = items.length >= 4;

  return (
    <nav aria-label="Sections">
      <ul
        role="tablist"
        className={`grid gap-1 rounded-2xl bg-ink-100 p-1 md:hidden ${PHONE_TAB_COLUMNS[items.length] ?? "grid-cols-5"}`}
      >
        {items.map((item) => {
          const isActive = active === item.id;
          const badge = item.badge != null && item.badge > 0 ? item.badge : 0;
          const Icon = item.icon;
          return (
            <li key={item.id} role="presentation" className="min-w-0">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                disabled={item.disabled}
                onClick={() => !item.disabled && onSelect(item.id)}
                aria-label={compact && badge ? `${item.label}, ${badge}` : compact ? item.label : undefined}
                className={`flex w-full flex-col items-center justify-center gap-0.5 rounded-xl px-1 text-center font-bold leading-tight transition-colors ${
                  compact ? "min-h-12 py-1.5" : "min-h-10 py-2"
                } ${
                  item.disabled
                    ? "cursor-not-allowed text-ink-300"
                    : isActive
                      ? "bg-white text-brand-700 shadow-sm"
                      : "text-ink-600 hover:text-ink-900"
                }`}
              >
                {compact ? (
                  <>
                    <span className="relative" aria-hidden>
                      {Icon && <Icon className="h-[18px] w-[18px]" />}
                      {badge > 0 && (
                        <span className="absolute -right-2.5 -top-1.5 inline-flex min-w-[1rem] items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] leading-4 text-white ring-2 ring-ink-100">
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </span>
                    <span className="w-full truncate text-[11px]" aria-hidden>
                      {item.shortLabel ?? item.label}
                    </span>
                  </>
                ) : (
                  <span className="flex items-center gap-1.5 text-sm">
                    {item.label}
                    {badge > 0 && <TabBadge count={badge} active={false} />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <ul role="tablist" aria-orientation="vertical" className={ui.sidebarNav}>
        {items.map((item) => {
          const isActive = active === item.id;
          return (
            <li key={item.id} role="presentation">
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
                {item.badge != null && item.badge > 0 && <TabBadge count={item.badge} active={isActive} />}
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

// Radius is set per block, so this skips ui.skeleton (which carries its own rounded-2xl).
const bone = "animate-pulse bg-ink-100";

/** Placeholder with the group page's shape (header, phase rail, facts, hero, list) while it loads. */
export function GroupPageSkeleton() {
  return (
    <div role="status" aria-label="Loading group" className="min-w-0">
      <div className="mb-8 border-b border-ink-200 pb-6">
        <div className={`${bone} h-9 w-64 max-w-full rounded-2xl`} />
        <div className="mt-4 flex flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${bone} h-7 w-24 rounded-full`} />
          ))}
        </div>
        <div className="mt-5 flex flex-wrap gap-8">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <div className={`${bone} h-3 w-20 rounded-full`} />
              <div className={`${bone} h-4 w-24 rounded-full`} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <div className="flex gap-1 md:w-44 md:shrink-0 md:flex-col">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${bone} h-9 w-24 rounded-full md:w-full`} />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-4">
          <div className={`${bone} h-56 rounded-3xl`} />
          <div className={`${bone} h-16 rounded-3xl`} />
          <div className={`${bone} h-16 rounded-3xl`} />
        </div>
      </div>
    </div>
  );
}
