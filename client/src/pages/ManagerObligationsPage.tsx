import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { displayInitials } from "../lib/initials";
import { statusBadgeClass, ui } from "../lib/ui";
import { StatCard } from "../components/StatCard";

function formatPeso(amount: string | number): string {
  return `₱${Number(amount).toLocaleString()}`;
}

/** Only active/completed groups can appear here — obligations only exist once a round has closed. */
function groupStatusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function ManagerObligationsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["manager-obligations"],
    queryFn: () => api.getManagerObligations(),
  });

  // Biggest debts first, both across groups and within each group.
  const groups = [...(data?.groups ?? [])]
    .sort((a, b) => Number(b.totalOutstanding) - Number(a.totalOutstanding))
    .map((g) => ({
      ...g,
      items: [...g.items].sort((a, b) => Number(b.remaining) - Number(a.remaining)),
    }));
  const totalOutstanding = Number(data?.totalOutstanding ?? 0);
  const obligationCount = groups.reduce((sum, g) => sum + g.count, 0);

  return (
    <div>
      <h1 className={ui.pageTitle}>Owed to you</h1>
      <p className={ui.pageSubtitle}>Unsettled shortfalls across the paluwagans you manage.</p>

      {isLoading && <p className={`mt-8 ${ui.muted}`}>Loading…</p>}
      {error && <p className={`mt-8 ${ui.error}`}>Failed to load obligations.</p>}

      {data && (
        <div className="mt-8 space-y-8">
          <div className="grid gap-3 sm:grid-cols-3">
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
              label="Unsettled obligations"
              value={String(obligationCount)}
              tone={obligationCount > 0 ? "warning" : "neutral"}
              icon="alert"
            />
          </div>

          {groups.length === 0 ? (
            <div className={ui.emptyState}>
              <p className="font-heading text-base font-medium text-slate-900">You're all square</p>
              <p className="mt-1 text-sm text-slate-500">
                No one owes you anything across the paluwagans you manage.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groups.map((g) => (
                <section key={g.groupId} className={ui.cardCompact}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Link
                        to={`/groups/${g.groupId}`}
                        className={`font-heading truncate text-base font-medium ${ui.link}`}
                      >
                        {g.groupName}
                      </Link>
                      <span className={statusBadgeClass(g.groupStatus)}>{groupStatusLabel(g.groupStatus)}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-medium tabular-nums text-red-800">
                        {formatPeso(g.totalOutstanding)}
                      </p>
                      <p className="text-xs text-slate-500">
                        {g.count} obligation{g.count === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>

                  <ul className="mt-4 divide-y divide-gray-50 border-t border-gray-100">
                    {g.items.map((item) => (
                      <li key={item.id} className="flex items-center gap-3 py-3">
                        <span className={ui.avatarInitialsSm} aria-hidden>
                          {displayInitials(item.displayName)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-900">{item.displayName}</p>
                          <p className="text-xs text-slate-500">Round {item.roundNumber}</p>
                        </div>
                        <p className="text-sm font-medium tabular-nums text-slate-900">
                          {formatPeso(item.remaining)}
                        </p>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
