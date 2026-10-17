import { Link, NavLink, Outlet, useLocation, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, CalendarDays, CloudOff, HandCoins, LayoutDashboard, Users, Wallet, type LucideIcon } from "lucide-react";
import { ApiError, type GroupDetail } from "../../api/client";
import { groupKey, useGroup } from "../../lib/groupQueries";
import { ui } from "../../lib/ui";
import { useGroupRealtime } from "../../lib/useGroupRealtime";
import { hasDebtsView } from "./active/period";
import { hasViews, STATE_LABELS, type GroupShellContext } from "./groupShell";

/**
 * Every page of one paluwagan. Loads the group (live, with polling as the fallback), handles the
 * missing and failed cases once, and after launch adds the header and the view navigation:
 * Dashboard · Schedule · Members · Debts · Money & records · Activity. The lobby stays a single page.
 */
export function GroupShell() {
  const { id = "" } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { realtimeActive } = useGroupRealtime({
    groupId: id,
    enabled: !!id,
    onUpdate: () => void queryClient.invalidateQueries({ queryKey: groupKey(id) }),
  });
  // Poll only while the live channel isn't up.
  const { data: detail, error, refetch, isFetching } = useGroup(id, realtimeActive ? false : 15_000);

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className={ui.emptyState}>
        <p className="font-heading text-lg font-bold text-ink-900">This paluwagan isn&apos;t available</p>
        <p className={`mt-1 text-sm ${ui.muted}`}>It may have been cancelled, or you&apos;re no longer a member.</p>
        <Link to="/home" className={`mt-5 ${ui.btnPrimarySm}`}>
          Go home
        </Link>
      </div>
    );
  }
  if (error && !detail) {
    return (
      <div className={`${ui.emptyState} flex flex-col items-center`} role="alert">
        <CloudOff className="h-8 w-8 text-danger-600" aria-hidden />
        <p className="font-heading mt-3 text-lg font-bold text-ink-900">Couldn&apos;t load this paluwagan</p>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className={`mt-5 ${ui.btnPrimarySm}`}>
          {isFetching ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }
  if (!detail) {
    return (
      <div className="space-y-6" aria-busy>
        <div className={`${ui.skeleton} h-16 w-2/3`} />
        <div className={`${ui.skeleton} h-36`} />
        <div className={`${ui.skeleton} h-64`} />
      </div>
    );
  }

  const navMode = hasViews(detail.group.state);
  const context: GroupShellContext = { detail, navMode };
  if (!navMode) return <Outlet context={context} />;

  const { group } = detail;
  return (
    <div className="min-w-0 space-y-6">
      <header>
        {STATE_LABELS[group.state] && (
          <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">{STATE_LABELS[group.state]}</p>
        )}
        <h1 className={ui.pageTitle}>{group.name}</h1>
        {detail.period && (
          <p className="mt-1 text-sm text-ink-500">
            Round {detail.period.number} of {group.slotCount}
          </p>
        )}
      </header>
      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start lg:gap-8">
        <GroupNav detail={detail} />
        <div className="mt-6 min-w-0 lg:mt-0">
          <Outlet context={context} />
        </div>
      </div>
    </div>
  );
}

interface NavItem {
  to: string;
  label: string;
  /** Phones show every view at once, so they get a short label. */
  short: string;
  icon: LucideIcon;
  /** Other paths that belong to this view (Your history sits under Money & records). */
  also?: string[];
}

/**
 * Every view visible at once: an even row of icon-over-label tabs on phones, pills from sm, and a
 * column beside the content from lg up.
 */
function GroupNav({ detail }: { detail: GroupDetail }) {
  const { pathname } = useLocation();
  const base = `/groups/${detail.group.id}`;
  const started = detail.group.state !== "LAUNCHED";
  const items: NavItem[] = [
    { to: base, label: "Dashboard", short: "Dashboard", icon: LayoutDashboard },
    { to: `${base}/schedule`, label: "Schedule", short: "Schedule", icon: CalendarDays },
    { to: `${base}/members`, label: "Members", short: "Members", icon: Users },
    // Only while there's a debt or refund to show or act on.
    ...(hasDebtsView(detail) || pathname === `${base}/debts`
      ? [{ to: `${base}/debts`, label: "Debts", short: "Debts", icon: HandCoins }]
      : []),
    ...(started
      ? [{ to: `${base}/money`, label: "Money & records", short: "Money", icon: Wallet, also: [`${base}/history`] }]
      : []),
    { to: `${base}/activity`, label: "Activity", short: "Activity", icon: Activity },
  ];
  return (
    <nav aria-label="Paluwagan" className="lg:sticky lg:top-24">
      <ul
        className={`grid ${items.length > 5 ? "gap-0" : "gap-1"} sm:flex sm:flex-wrap sm:gap-2 lg:flex-col lg:flex-nowrap lg:gap-1`}
        style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}
      >
        {items.map((item) => (
          <li key={item.to} className="min-w-0">
            <NavLink
              to={item.to}
              end
              aria-label={item.label}
              className={({ isActive }) => {
                const active = isActive || (item.also ?? []).includes(pathname);
                // Six tabs (with Debts) need the smaller size, and no gap, for "Dashboard" to fit at 390px.
                return `flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-0.5 ${items.length > 5 ? "text-[11px]" : "text-xs"} font-bold transition-colors sm:min-h-11 sm:flex-row sm:gap-2 sm:rounded-full sm:px-4 sm:text-sm lg:justify-start lg:rounded-2xl ${
                  active ? "bg-brand-100 text-brand-800" : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
                }`;
              }}
            >
              <item.icon className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" aria-hidden />
              <span className="max-w-full truncate sm:hidden">{item.short}</span>
              <span className="hidden whitespace-nowrap sm:inline">{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
