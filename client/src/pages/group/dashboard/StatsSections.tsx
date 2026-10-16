import { Link } from "react-router-dom";
import { CircleAlert, CircleCheck, ChevronRight, TriangleAlert } from "lucide-react";
import type { GroupDetail, GroupStats, Health } from "../../../api/client";
import { dueHint, formatDueDate } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";

/** Status chip: icon + label, never color alone. */
export function HealthChip({ health }: { health: Health }) {
  const spec = {
    ON_TRACK: { icon: CircleCheck, label: "On track", tone: "bg-brand-100 text-brand-800" },
    AT_RISK: { icon: CircleAlert, label: "Behind schedule", tone: "bg-sun-100 text-sun-900" },
    SHORT: { icon: TriangleAlert, label: "Likely short", tone: "bg-danger-50 text-danger-800" },
  }[health];
  const Icon = spec.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${spec.tone}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {spec.label}
    </span>
  );
}

/**
 * §15.3 "My slot": the viewer's turn, what it would come to now (after their own shortfall and
 * debt, the same rules as a real payout), or what they got.
 */
export function YourTurn({ detail, stats }: { detail: GroupDetail; stats: GroupStats }) {
  const turn = stats.myTurn;
  if (!turn) return null;
  const hint = dueHint(turn.payoutDate);
  const got = turn.net != null && turn.status !== "AWAITING_HANDOVER";
  const pot = detail.group.pot;
  return (
    <section aria-labelledby="your-turn-heading" className="rounded-3xl border border-ink-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="your-turn-heading" className="text-xs font-bold uppercase tracking-wide text-ink-500">
            Your turn · round {turn.round}
          </h2>
          <p className="font-heading mt-1 text-2xl font-bold tabular-nums text-ink-900">
            {got ? `You got ${formatPeso(turn.net!)}` : formatPeso(turn.projected ?? pot)}
          </p>
          <p className="mt-0.5 text-sm text-ink-600">
            {got
              ? `Round ${turn.round} paid out on ${formatDueDate(turn.payoutDate)}.`
              : `${formatDueDate(turn.payoutDate)}${hint && !hint.overdue ? ` · ${hint.label}` : ""}${
                  turn.projected != null && turn.projected < pot
                    ? `. That's the ${formatPeso(pot)} pot less what you owe now; paying it off first raises it.`
                    : turn.projected != null
                      ? ". The full pot, if you keep paying in full."
                      : ""
                }`}
          </p>
        </div>
      </div>
      <Link to={`/groups/${detail.group.id}/history`} className="mt-3 flex items-center gap-1 text-sm font-bold text-brand-700 hover:underline">
        Your history
        <ChevronRight className="h-4 w-4" aria-hidden />
      </Link>
    </section>
  );
}

/** §15.1 money overview for the organizer. Tiles with nothing in them are left out. */
export function MoneyOverview({ stats }: { stats: GroupStats }) {
  const tiles = [
    { label: "Collected", value: stats.money.collected, always: true },
    { label: "Paid out", value: stats.money.paidOut, always: true },
    { label: "Still to pay out", value: stats.money.toPayOut, always: true },
    { label: "Shortfalls you covered", value: stats.money.coveredByOrganizer },
    { label: "Owed to you", value: stats.money.owedToOrganizer },
  ].filter((t) => t.always || t.value > 0);
  return (
    <section aria-labelledby="money-heading">
      <h2 id="money-heading" className={`${ui.sectionHeading} mb-3`}>
        Money so far
      </h2>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-ink-200 bg-white p-4">
            <dt className="text-xs text-ink-500">{t.label}</dt>
            <dd className="font-heading mt-0.5 text-lg font-bold tabular-nums text-ink-900">{formatPeso(t.value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

const BAR_MAX = 120;

/**
 * §15.1 history and trends: how much of each closed round's pot came in on time (one series:
 * no legend, the heading names it), and each member's record. Hidden until a round has closed.
 */
export function Trends({ stats }: { stats: GroupStats }) {
  if (stats.collection.length === 0) return null;
  return (
    <section aria-labelledby="trends-heading" className="space-y-4">
      <h2 id="trends-heading" className={ui.sectionHeading}>
        How rounds went
      </h2>
      <figure className="rounded-3xl border border-ink-200 bg-white p-5">
        <figcaption className="text-sm font-bold text-ink-900">Collected by each payout</figcaption>
        <p className="text-xs text-ink-500">Share of the pot approved before the payout date. The rest the organizer covered.</p>
        <div className="mt-4 flex h-[150px] items-end gap-[2px] border-b border-ink-200" role="list" aria-label="Collected by round">
          {stats.collection.map((c, index) => {
            const pct = Math.round(c.rate * 100);
            // Tooltips open toward the middle so they never run off the card.
            const side = index < stats.collection.length / 2 ? "left-0" : "right-0";
            return (
              <div key={c.round} role="listitem" className="group relative flex h-full flex-1 flex-col items-center justify-end">
                {/* Hover and focus show the exact numbers; the table below carries them too. */}
                <span
                  className={`pointer-events-none absolute bottom-full z-10 mb-1 hidden whitespace-nowrap rounded-lg bg-ink-900 px-2 py-1 text-xs font-semibold text-white group-focus-within:block group-hover:block ${side}`}
                >
                  Round {c.round}: {pct}% ({formatPeso(c.approved)} of {formatPeso(c.expected)})
                </span>
                <button
                  type="button"
                  aria-label={`Round ${c.round}: ${pct}% collected`}
                  className="w-full max-w-6 rounded-t bg-brand-600 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30"
                  style={{ height: `${Math.max(2, (c.rate * BAR_MAX))}px` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-[2px]" aria-hidden>
          {stats.collection.map((c) => (
            <span key={c.round} className="flex-1 text-center text-[11px] text-ink-500">
              {c.round}
            </span>
          ))}
        </div>
        <p className="mt-1 text-center text-[11px] text-ink-500" aria-hidden>
          Round
        </p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer text-xs font-semibold text-ink-600">Show as a table</summary>
          <table className="mt-2 w-full text-left text-xs">
            <thead className="text-ink-500">
              <tr>
                <th className="py-1 font-semibold">Round</th>
                <th className="py-1 text-right font-semibold">Collected</th>
                <th className="py-1 text-right font-semibold">Of</th>
                <th className="py-1 text-right font-semibold">Share</th>
              </tr>
            </thead>
            <tbody className="tabular-nums text-ink-800">
              {stats.collection.map((c) => (
                <tr key={c.round} className="border-t border-ink-100">
                  <td className="py-1">{c.round}</td>
                  <td className="py-1 text-right">{formatPeso(c.approved)}</td>
                  <td className="py-1 text-right">{formatPeso(c.expected)}</td>
                  <td className="py-1 text-right">{Math.round(c.rate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>
      <Reliability stats={stats} />
    </section>
  );
}

const RELIABILITY = [
  { key: "onTime", label: "Paid in full", color: "bg-brand-600" },
  { key: "partial", label: "Partly", color: "bg-sun-500" },
  { key: "missed", label: "Missed", color: "bg-danger-700" },
] as const;

/** Each member's closed rounds: paid in full on time, partly, or missed. Counts are always written out. */
function Reliability({ stats }: { stats: GroupStats }) {
  return (
    <div className="rounded-3xl border border-ink-200 bg-white p-5">
      <p className="text-sm font-bold text-ink-900">Each member's rounds</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600" aria-label="Legend">
        {RELIABILITY.map((r) => (
          <li key={r.key} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${r.color}`} aria-hidden />
            {r.label}
          </li>
        ))}
      </ul>
      <ul className="mt-3 space-y-3">
        {stats.reliability.map((m) => {
          const total = m.onTime + m.partial + m.missed || 1;
          return (
            <li key={m.slotId}>
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-semibold text-ink-900">{m.name}</span>
                <span className="shrink-0 text-xs text-ink-600 tabular-nums">
                  {m.onTime} in full
                  {m.partial > 0 && ` · ${m.partial} partly`}
                  {m.missed > 0 && ` · ${m.missed} missed`}
                </span>
              </div>
              <div className="mt-1 flex h-2.5 gap-[2px] overflow-hidden rounded-full bg-ink-100" aria-hidden>
                {RELIABILITY.map((r) =>
                  m[r.key] > 0 ? <span key={r.key} className={r.color} style={{ width: `${(m[r.key] / total) * 100}%` }} /> : null,
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
