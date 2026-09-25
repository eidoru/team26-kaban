import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { api, type ManagerObligationsOverview } from "../api/client";
import { Avatar } from "../components/Avatar";
import { statusBadgeClass, ui } from "../lib/ui";
import { StatCard } from "../components/StatCard";
import { KabanChest } from "../components/Illustration";

function formatPeso(amount: string | number): string {
  return `₱${Number(amount).toLocaleString()}`;
}

/** Only active/completed groups can appear here — obligations only exist once a round has closed. */
function groupStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

const PREVIEW_COUNT = 3;

type Debtor = { id: string; name: string; isPlaceholder: boolean; rounds: number; total: number };

/** One entry per member (not per unpaid round), biggest balance first. */
function debtorsOf(items: ManagerObligationsOverview["groups"][number]["items"]): Debtor[] {
  const byMember = new Map<string, Debtor>();
  for (const item of items) {
    const debtor = byMember.get(item.debtorMembershipId) ?? {
      id: item.debtorMembershipId,
      name: item.displayName,
      isPlaceholder: item.isPlaceholder,
      rounds: 0,
      total: 0,
    };
    debtor.rounds += 1;
    debtor.total += Number(item.remaining);
    byMember.set(item.debtorMembershipId, debtor);
  }
  return [...byMember.values()].sort((a, b) => b.total - a.total);
}

export function ManagerObligationsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["manager-obligations"],
    queryFn: () => api.getManagerObligations(),
  });

  // Biggest debts first, both across groups and within each group.
  const groups = [...(data?.groups ?? [])]
    .sort((a, b) => Number(b.totalOutstanding) - Number(a.totalOutstanding))
    .map((g) => ({ ...g, debtors: debtorsOf(g.items) }));
  const totalOutstanding = Number(data?.totalOutstanding ?? 0);
  const debtorCount = groups.reduce((sum, g) => sum + g.debtors.length, 0);

  return (
    <div>
      <h1 className={ui.pageTitle}>Owed to you</h1>
      <p className={ui.pageSubtitle}>Unsettled shortfalls across the paluwagans you manage.</p>

      {isLoading && (
        <div className="mt-8 space-y-4" aria-hidden>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${ui.skeleton} h-28`} />
            ))}
          </div>
          <div className={`${ui.skeleton} h-40`} />
        </div>
      )}
      {error && <p className={`mt-8 ${ui.error}`}>Failed to load obligations.</p>}

      {data && (
        <div className="mt-8 space-y-8">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Total outstanding"
              value={formatPeso(totalOutstanding)}
              hint="Includes accrued interest"
              tone={totalOutstanding > 0 ? "danger" : "neutral"}
              icon="wallet"
            />
            <StatCard
              label="Groups affected"
              value={String(groups.length)}
              tone="neutral"
              icon="users"
            />
            <StatCard
              label="Members who owe"
              value={String(debtorCount)}
              tone={debtorCount > 0 ? "warning" : "neutral"}
              icon="alert"
            />
          </div>

          {groups.length === 0 ? (
            <div className={`${ui.emptyState} flex flex-col items-center`}>
              <KabanChest className="w-36" />
              <p className="font-heading mt-4 text-xl font-bold text-ink-900">You&apos;re all square</p>
              <p className="mt-1 text-sm text-ink-500">
                No one owes you anything across the paluwagans you manage.
              </p>
            </div>
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {groups.map((g) => {
                const shown = g.debtors.slice(0, PREVIEW_COUNT);
                const hidden = g.debtors.length - shown.length;
                return (
                  <li key={g.groupId} className="flex flex-col rounded-3xl border border-ink-200 bg-white p-4 shadow-card sm:p-5">
                    <div className="flex items-start gap-3">
                      <Avatar name={g.groupName} size="md" shape="tile" />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            to={`/groups/${g.groupId}`}
                            className="font-heading truncate text-lg font-bold text-ink-900 hover:text-brand-700 hover:underline"
                          >
                            {g.groupName}
                          </Link>
                          <span className={statusBadgeClass(g.groupStatus)}>{groupStatusLabel(g.groupStatus)}</span>
                        </div>
                        <p className="mt-0.5 text-xs text-ink-500">
                          {g.debtors.length} member{g.debtors.length === 1 ? "" : "s"} owe · {g.count} round
                          {g.count === 1 ? "" : "s"} unpaid
                        </p>
                      </div>
                      <p className="font-heading hidden shrink-0 text-xl font-bold tabular-nums text-danger-700 sm:block">
                        {formatPeso(g.totalOutstanding)}
                      </p>
                    </div>

                    {/* Phones: the total gets its own strip so the group name keeps the full row. */}
                    <div className="mt-3 flex items-baseline justify-between gap-3 rounded-2xl bg-danger-50 px-4 py-2.5 sm:hidden">
                      <span className="text-xs font-bold uppercase tracking-wide text-danger-700">Owed to you</span>
                      <span className="font-heading text-xl font-bold tabular-nums text-danger-700">
                        {formatPeso(g.totalOutstanding)}
                      </span>
                    </div>

                    <ul className="mb-3 mt-4 space-y-1">
                      {shown.map((d) => (
                        <li key={d.id} className="flex items-center gap-3 rounded-2xl px-1 py-1.5 sm:px-2">
                          <Avatar name={d.name} placeholder={d.isPlaceholder} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-bold text-ink-900">{d.name}</p>
                            <p className="text-xs text-ink-500">
                              {d.rounds} unpaid round{d.rounds === 1 ? "" : "s"}
                            </p>
                          </div>
                          <p className="shrink-0 text-right text-sm font-bold tabular-nums text-ink-900">
                            {formatPeso(d.total)}
                          </p>
                        </li>
                      ))}
                    </ul>

                    <div className="mt-auto flex items-center justify-between gap-3 border-t border-ink-100 pt-3">
                      <span className="text-xs font-semibold text-ink-500">
                        {hidden > 0 ? `+${hidden} more` : ""}
                      </span>
                      <Link
                        to={`/groups/${g.groupId}?tab=issues`}
                        className="group inline-flex items-center gap-1.5 text-sm font-bold text-brand-700 hover:text-brand-900"
                      >
                        Open issues
                        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
                      </Link>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
