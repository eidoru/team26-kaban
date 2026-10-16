import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { api } from "../api/client";
import { dueHint, formatDueDate } from "../lib/dates";
import { formatPeso } from "../lib/money";
import { ui } from "../lib/ui";
import { homeKey } from "../lib/homeQueries";

const PAYOUT_STATUS: Record<string, string> = {
  NOT_STARTED: "Not started yet",
  UPCOMING: "Upcoming",
  COLLECTING: "Being collected now",
  AWAITING_HANDOVER: "Ready, not handed over yet",
  HANDED_OVER: "Handed over, confirm you got it",
  CONFIRMED: "Received",
};

/**
 * §15.2 money, across every paluwagan: your totals, your payouts (received and upcoming), what you
 * owe, and (as an organizer) what you're owed. Sections with nothing in them are left out.
 */
export function MoneyPage() {
  const { data } = useQuery({ queryKey: homeKey, queryFn: () => api.home() });
  if (!data) return <div className={`${ui.skeleton} h-64`} aria-busy />;
  const { totals } = data;
  const tiles = [
    { label: "You've paid in", value: totals.contributed, show: totals.contributed > 0 },
    { label: "You've received", value: totals.received, show: totals.received > 0 },
    { label: "You owe", value: totals.owed, show: totals.owed > 0, tone: "text-danger-700" },
    { label: "Owed to you", value: totals.owedToMe, show: totals.owedToMe > 0 },
    { label: "Refunds owed to you", value: totals.refundsToMe, show: totals.refundsToMe > 0 },
    { label: "Refunds you owe", value: totals.refundsIOwe, show: totals.refundsIOwe > 0 },
  ].filter((t) => t.show);
  const nothingYet = tiles.length === 0 && data.payouts.length === 0;

  return (
    <div className="space-y-8">
      <h1 className={ui.pageTitle}>Money</h1>
      {nothingYet && <p className={ui.emptyState}>Nothing yet. Money you pay in and receive shows here once a paluwagan starts.</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-ink-200 bg-white p-4">
            <dt className="text-xs text-ink-500">{t.label}</dt>
            <dd className={`font-heading mt-0.5 text-xl font-bold tabular-nums ${t.tone ?? "text-ink-900"}`}>{formatPeso(t.value)}</dd>
          </div>
        ))}
      </dl>

      {data.payouts.length > 0 && (
        <section aria-labelledby="payouts-heading">
          <h2 id="payouts-heading" className={`${ui.sectionHeading} mb-3`}>
            Your payouts
          </h2>
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
            {data.payouts.map((p) => {
              const hint = p.net == null ? dueHint(p.payoutDate) : null;
              return (
                <li key={`${p.groupId}-${p.round}`}>
                  <Link to={`/groups/${p.groupId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink-900">{p.groupName}</span>
                      <span className="block text-xs text-ink-500">
                        Round {p.round} · {formatDueDate(p.payoutDate)}
                        {hint && !hint.overdue && ` (${hint.label})`} · {PAYOUT_STATUS[p.status]}
                      </span>
                    </span>
                    {p.net != null && <span className="text-sm font-bold tabular-nums text-ink-900">{formatPeso(p.net)}</span>}
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {data.debts.length > 0 && (
        <section aria-labelledby="debts-heading">
          <h2 id="debts-heading" className={`${ui.sectionHeading} mb-3`}>
            What you owe
          </h2>
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
            {data.debts.map((d) => (
              <li key={d.groupId} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink-900">{d.groupName}</span>
                  <span className="block text-xs text-ink-500 tabular-nums">
                    {formatPeso(d.principal)} unpaid{d.interest > 0 && ` + ${formatPeso(d.interest)} interest`}
                  </span>
                </span>
                <span className="font-heading text-base font-bold tabular-nums text-danger-700">{formatPeso(d.principal + d.interest)}</span>
                <Link to={`/groups/${d.groupId}?pay=debt`} className={`${ui.btnSecondarySm} min-h-9`}>
                  Pay
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.owedToMe.length > 0 && (
        <section aria-labelledby="owed-heading">
          <h2 id="owed-heading" className={`${ui.sectionHeading} mb-3`}>
            Owed to you
          </h2>
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
            {data.owedToMe.map((o) => (
              <li key={`${o.groupId}-${o.name}`}>
                <Link to={`/groups/${o.groupId}`} className="flex items-center gap-3 px-4 py-3 hover:bg-ink-50">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-900">{o.name}</span>
                    <span className="block truncate text-xs text-ink-500">{o.groupName}</span>
                  </span>
                  <span className="font-heading text-base font-bold tabular-nums text-ink-900">{formatPeso(o.amount)}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
