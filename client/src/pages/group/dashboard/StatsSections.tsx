import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { GroupDetail, GroupStats, Health } from "../../../api/client";
import { dueHint, formatShortDate } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";

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
/**
 * A member's own numbers at a glance (§15.3): where they stand this round, what they owe, and their
 * payout. Tiles with nothing in them are left out. The actions for each live in the To do list.
 */
export function MyStanding({ detail, stats }: { detail: GroupDetail; stats?: GroupStats }) {
  const me = detail.slots.find((s) => s.isViewer);
  const standing = detail.period?.slots.find((s) => s.slotId === detail.viewer.slotId);
  const owed = me ? me.debt.principal + me.debt.interest : 0;
  const turn = stats?.myTurn;
  const hint = detail.period ? dueHint(detail.period.payoutDate) : null;
  const tiles: { label: string; value: string; note: string; tone?: string }[] = [];
  if (standing) {
    const paid = standing.status === "PAID";
    tiles.push({
      label: `Round ${detail.period!.number}`,
      value: paid ? "Paid" : `${formatPeso(standing.approved)} of ${formatPeso(standing.due)}`,
      // Money in review is shown once, in the To do item; here, just when it's due.
      note: paid ? `${formatPeso(standing.approved)} in` : hint ? `Due ${hint.label}` : "",
      tone: paid ? "text-brand-700" : undefined,
    });
  }
  if (owed > 0) {
    tiles.push({ label: "You owe", value: formatPeso(owed), note: `To ${detail.group.organizerName}`, tone: "text-danger-700" });
  }
  if (turn) {
    const got = turn.net != null && turn.status !== "AWAITING_HANDOVER";
    tiles.push({
      label: "Your payout",
      value: got ? `Got ${formatPeso(turn.net!)}` : formatPeso(turn.projected ?? detail.group.pot),
      // The round number is turn-speak; the date is what a member plans around.
      note: `${got ? "Received" : "Expected"} ${formatShortDate(turn.payoutDate, true)}`,
    });
  }
  if (tiles.length === 0) return null;
  return (
    <section aria-labelledby="standing-heading" className="rounded-3xl border border-ink-200 bg-white p-5">
      {/* The tiles say "you" already; the heading is for screen readers. */}
      <h2 id="standing-heading" className="sr-only">
        You
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className="min-w-0">
            <dt className="text-xs text-ink-500">{t.label}</dt>
            <dd className={`font-heading mt-0.5 text-xl font-bold tabular-nums ${t.tone ?? "text-ink-900"}`}>{t.value}</dd>
            {t.note && <dd className="text-xs text-ink-500">{t.note}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

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
          {/* When, briefly; the amount above already says what it comes to. */}
          <p className="mt-0.5 text-sm text-ink-600">
            {got
              ? `Paid out ${formatShortDate(turn.payoutDate, true)}`
              : `${formatShortDate(turn.payoutDate, true)}${hint && !hint.overdue ? ` · ${hint.label}` : ""}`}
          </p>
        </div>
      </div>
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
    // R-DEC-39: outside the pot, so not part of "Collected".
    { label: "Your organizing fees", value: stats.money.fees },
  ].filter((t) => t.always || t.value > 0);
  return (
    <section aria-label="Money so far">
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
 * Bars for rounds still to close are outlined, not filled: their share can still grow (R-DEC-31).
 * The outline keeps them at 3:1 against the card, which a pale fill alone wouldn't.
 */
const COLLECTION = [
  { key: "closed", label: "By the payout", color: "bg-brand-600" },
  { key: "later", label: "So far: this round, and rounds paid ahead", color: "border-2 border-brand-600 bg-brand-100" },
] as const;

/** "Round 3 (open)", "Round 4 (paid ahead)" or "Round 2", for the tooltip and the table. */
function barLabel(c: GroupStats["collection"][number]) {
  return `Round ${c.round}${c.status === "OPEN" ? " (open)" : c.status === "UPCOMING" ? " (paid ahead)" : ""}`;
}

/**
 * §15.1 history and trends: how much of each round's pot came in, and each member's record. Closed
 * rounds show what was approved by the payout; the open round what's approved so far, and later
 * rounds what was paid ahead (R-DEC-31), in a lighter shade with a legend. Hidden until there's a
 * bar to show; the member record waits for a closed round.
 */
export function Trends({ stats }: { stats: GroupStats }) {
  if (stats.collection.length === 0) return null;
  const hasLater = stats.collection.some((c) => c.status !== "CLOSED");
  const hasClosed = stats.collection.some((c) => c.status === "CLOSED");
  return (
    <section aria-label="How rounds went" className="space-y-4">
      <figure className="rounded-3xl border border-ink-200 bg-white p-5">
        <figcaption className="text-sm font-bold text-ink-900">Collected by each payout</figcaption>
        <p className="text-xs text-ink-500">
          Share of the pot approved before the payout date.{hasClosed && " The rest the organizer covered."}
        </p>
        {hasLater && (
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600" aria-label="Legend">
            {COLLECTION.filter((k) => hasClosed || k.key === "later").map((k) => (
              <li key={k.key} className="flex items-center gap-1.5">
                <span className={`h-2.5 w-2.5 rounded-sm ${k.color}`} aria-hidden />
                {k.label}
              </li>
            ))}
          </ul>
        )}
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
                  {barLabel(c)}: {pct}% ({formatPeso(c.approved)} of {formatPeso(c.expected)})
                </span>
                <button
                  type="button"
                  aria-label={`${barLabel(c)}: ${pct}% collected${c.status === "CLOSED" ? "" : " so far"}`}
                  className={`w-full max-w-6 rounded-t ${
                    c.status === "CLOSED" ? COLLECTION[0].color : `${COLLECTION[1].color} border-b-0`
                  } focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-500/30`}
                  style={{ height: `${Math.max(2, (c.rate * BAR_MAX))}px` }}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex gap-[2px]" aria-hidden>
          {stats.collection.map((c) => (
            <span key={c.round} className="flex-1 text-center text-xs text-ink-500">
              {c.round}
            </span>
          ))}
        </div>
        <p className="mt-1 text-center text-xs text-ink-500" aria-hidden>
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
                  <td className="py-1">
                    {c.round}
                    {c.status !== "CLOSED" && (
                      <span className="text-ink-500">{c.status === "OPEN" ? " (open)" : " (paid ahead)"}</span>
                    )}
                  </td>
                  <td className="py-1 text-right">{formatPeso(c.approved)}</td>
                  <td className="py-1 text-right">{formatPeso(c.expected)}</td>
                  <td className="py-1 text-right">{Math.round(c.rate * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </figure>
      {hasClosed && <Reliability stats={stats} />}
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
