import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api, type HistoryEvent } from "../../api/client";
import { formatDayHeading } from "../../lib/dates";
import { groupKey } from "../../lib/groupQueries";
import { formatPeso } from "../../lib/money";
import { ui } from "../../lib/ui";

function debtChange(e: HistoryEvent): string | null {
  if (e.principalDelta == null || e.interestDelta == null) return null;
  const total = e.principalDelta + e.interestDelta;
  const sign = total < 0 ? "−" : "+";
  return `Debt ${sign}${formatPeso(Math.abs(total))}${e.interestDelta !== 0 && e.principalDelta !== 0 ? ` (${formatPeso(Math.abs(e.interestDelta))} interest)` : ""}`;
}

/**
 * §15.3 "My history": everything recorded for the viewer's slot, newest first: reports and their
 * reviews, debt changes, payouts, refunds. Records from before a claim are labeled inherited.
 */
export function HistoryPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data, isPending } = useQuery({ queryKey: [...groupKey(id), "history"], queryFn: () => api.history(id) });
  const days: { heading: string; items: HistoryEvent[] }[] = [];
  for (const event of data?.events ?? []) {
    const heading = formatDayHeading(new Date(event.at));
    const last = days.at(-1);
    if (last?.heading === heading) last.items.push(event);
    else days.push({ heading, items: [event] });
  }
  return (
    <div className="space-y-6">
      <div>
        {/* Reached from Money & records, which the view navigation highlights. */}
        <Link to={`/groups/${id}/money`} className={ui.btnGhost}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Money &amp; records
        </Link>
        {data?.claimedAt && (
          <p className="mt-4 rounded-2xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
            You claimed this slot on {new Date(data.claimedAt).toLocaleDateString()}. Earlier records came with it and are marked
            inherited.
          </p>
        )}
      </div>
      {isPending ? (
        <div className={`${ui.skeleton} h-48`} aria-busy />
      ) : days.length === 0 ? (
        <p className={ui.emptyState}>Nothing recorded yet.</p>
      ) : (
        days.map((day) => (
          <section key={day.heading} aria-label={day.heading}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{day.heading}</h2>
            <ol className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
              {day.items.map((e, i) => (
                <li key={`${e.at}-${i}`} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink-900">
                        {e.event}
                        {e.round != null && <span className="font-semibold text-ink-500"> · round {e.round}</span>}
                      </span>
                      {e.status && <span className="block text-xs font-semibold text-ink-600">{e.status}</span>}
                    </span>
                    {e.amount != null && <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900">{formatPeso(e.amount)}</span>}
                  </div>
                  {(debtChange(e) || e.notes || e.inherited) && (
                    <p className="mt-1 text-xs text-ink-500">
                      {[e.inherited && "Inherited", debtChange(e), e.notes].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </section>
        ))
      )}
    </div>
  );
}
