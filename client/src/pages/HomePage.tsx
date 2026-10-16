import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Plus } from "lucide-react";
import { api, type MyGroup } from "../api/client";
import { KabanChest } from "../components/Illustration";
import { formatDueDate } from "../lib/dates";
import { myGroupsKey } from "../lib/homeQueries";
import { formatPeso } from "../lib/money";
import { ui } from "../lib/ui";

/** What each card says about where a paluwagan stands, for this viewer. */
function standing(g: MyGroup): string {
  switch (g.state) {
    case "LOBBY":
      return g.occupied < g.slotCount
        ? `${g.occupied} of ${g.slotCount} joined`
        : g.isOrganizer
          ? "Everyone's in. Set the order and launch."
          : "Everyone's in. Waiting to launch.";
    case "LAUNCHED":
      return `Starts ${formatDueDate(g.startDate)}`;
    case "ACTIVE":
      return "Running";
    case "CANCELLED":
      return "Cancelled";
    default:
      return "Completed";
  }
}

/**
 * Interim home: the viewer's paluwagans. The full member dashboard (due soon, payouts, totals,
 * activity; spec §15.2) replaces this in phase 8.
 */
export function HomePage() {
  const { data, isPending } = useQuery({ queryKey: myGroupsKey, queryFn: () => api.myGroups() });
  const groups = data?.groups ?? [];
  const live = groups.filter((g) => g.state !== "CANCELLED");
  const cancelled = groups.filter((g) => g.state === "CANCELLED");

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className={ui.pageTitle}>Your paluwagans</h1>
        {live.length > 0 && (
          <Link to="/groups/new" className={`${ui.btnPrimary} ${ui.tapFull}`}>
            <Plus className="h-4 w-4" aria-hidden />
            Start a paluwagan
          </Link>
        )}
      </div>

      {isPending ? (
        <div className="space-y-3" aria-busy>
          {[0, 1].map((i) => (
            <div key={i} className={`${ui.skeleton} h-24`} />
          ))}
        </div>
      ) : live.length === 0 ? (
        <div className={`${ui.emptyState} flex flex-col items-center`}>
          <KabanChest className="w-32" />
          <p className="font-heading mt-4 text-xl font-bold text-ink-900">No paluwagans yet</p>
          <p className={`mt-1 max-w-sm text-sm ${ui.muted}`}>
            Start one and invite your group, or open an invite link someone sent you.
          </p>
          <Link to="/groups/new" className={`mt-6 ${ui.btnPrimary}`}>
            <Plus className="h-4 w-4" aria-hidden />
            Start a paluwagan
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {live.map((g) => (
            <GroupCard key={g.id} group={g} />
          ))}
        </ul>
      )}

      {cancelled.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-ink-500">Cancelled ({cancelled.length})</summary>
          <ul className="mt-3 space-y-3">
            {cancelled.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function GroupCard({ group }: { group: MyGroup }) {
  return (
    <li>
      <Link
        to={`/groups/${group.id}`}
        className="flex items-center gap-4 rounded-3xl border border-ink-200 bg-white p-5 shadow-card transition-colors hover:border-brand-300"
      >
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
            {group.isOrganizer ? "You organize" : `By ${group.organizerName}`}
          </p>
          <p className="font-heading mt-0.5 truncate text-lg font-bold text-ink-900">{group.name}</p>
          <p className="mt-0.5 text-sm text-ink-600">
            {formatPeso(group.contribution)} {group.frequencyLabel.toLowerCase()} · {standing(group)}
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
      </Link>
    </li>
  );
}
