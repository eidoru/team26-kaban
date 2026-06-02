import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { ui } from "../lib/ui";

export function ManagerObligationsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["manager-obligations"],
    queryFn: () => api.getManagerObligations(),
  });

  return (
    <div>
      <Link to="/home" className={ui.backLink}>
        <span className={ui.backLinkArrow}>←</span>
        Back to home
      </Link>
      <h1 className={ui.pageTitle}>Owed across your groups</h1>
      <p className={ui.pageSubtitle}>Outstanding shortfall obligations you manage</p>

      {isLoading && <p className={`mt-8 ${ui.muted}`}>Loading…</p>}
      {error && <p className={`mt-8 ${ui.error}`}>Failed to load obligations.</p>}

      {data && (
        <>
          <p className="mt-6 text-lg font-medium text-red-800">
            Total outstanding: ₱{Number(data.totalOutstanding).toLocaleString()}
          </p>

          {data.groups.length === 0 ? (
            <p className={`mt-6 ${ui.muted}`}>No unsettled obligations in your managed groups.</p>
          ) : (
            <div className={`mt-6 ${ui.stack}`}>
              {data.groups.map((g) => (
                <section key={g.groupId} className={ui.cardCompact}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Link to={`/groups/${g.groupId}`} className={`font-medium ${ui.link}`}>
                      {g.groupName}
                    </Link>
                    <span className="text-sm text-red-700">
                      ₱{Number(g.totalOutstanding).toLocaleString()} · {g.count} obligation
                      {g.count === 1 ? "" : "s"}
                    </span>
                  </div>
                  <ul className="mt-3 space-y-1 text-sm text-slate-700">
                    {g.items.map((item) => (
                      <li key={item.id}>
                        {item.displayName} · Round {item.roundNumber} · ₱
                        {Number(item.remaining).toLocaleString()} remaining
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
