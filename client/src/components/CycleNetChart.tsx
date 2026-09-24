import { type KeyboardEvent, type PointerEvent, useEffect, useState } from "react";
import type { RoundSummary } from "../api/client";
import { formatDueDate } from "../lib/dates";

const HEIGHT = 220;
const PAD = { top: 28, right: 16, bottom: 28, left: 52 };

type Point = { k: number; paid: number; received: number; net: number; round?: RoundSummary };

const linkButton =
  "shrink-0 rounded-full px-2 py-1 text-xs font-bold text-brand-700 underline-offset-2 hover:text-brand-900 hover:underline";

const peso = (n: number) => `₱${Math.abs(n).toLocaleString()}`;
const signedPeso = (n: number) => (n > 0 ? `+${peso(n)}` : n < 0 ? `−${peso(n)}` : "₱0");
const compact = new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 });
const tickLabel = (n: number) => (n === 0 ? "₱0" : `${n < 0 ? "−" : ""}₱${compact.format(Math.abs(n))}`);

/** 1/2/5 × 10^k step giving about four intervals across [min, max]. */
function niceTicks(min: number, max: number): number[] {
  const span = max - min || 1;
  const raw = span / 4;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const ticks: number[] = [];
  for (let v = Math.floor(min / step) * step; v <= max + step / 2; v += step) ticks.push(Math.round(v));
  return ticks;
}

/** Callback ref + width, so it re-attaches whenever the measured element remounts. */
function useWidth() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [el]);
  return [setEl, width] as const;
}

/**
 * The viewer's cumulative position across the cycle: pot received minus contributions paid,
 * assuming everyone pays in full. Closed rounds are solid; upcoming rounds are a dotted projection.
 */
export function CycleNetChart({
  schedule,
  viewerMembershipId,
  contributionAmount,
}: {
  schedule: RoundSummary[];
  viewerMembershipId?: string;
  contributionAmount: string;
}) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const rounds = [...schedule].sort((a, b) => a.number - b.number);
  const n = rounds.length;
  const contribution = Number(contributionAmount);
  const pot = contribution * n;
  const myRound = rounds.find((r) => r.recipientMembershipId === viewerMembershipId)?.number;
  if (!myRound || n < 2 || !(contribution > 0)) return null;

  const points: Point[] = [{ k: 0, paid: 0, received: 0, net: 0 }];
  rounds.forEach((round, i) => {
    const k = i + 1;
    const paid = contribution * k;
    const received = round.number >= myRound ? pot : 0;
    points.push({ k, paid, received, net: received - paid, round });
  });
  const closedCount = rounds.filter((r) => r.status === "closed").length;
  const now = points[closedCount];

  const ticks = niceTicks(Math.min(0, ...points.map((p) => p.net)), Math.max(0, ...points.map((p) => p.net)));
  const yMin = ticks[0];
  const yMax = ticks[ticks.length - 1];
  const plotW = Math.max(120, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (k: number) => PAD.left + (k / n) * plotW;
  const y = (v: number) => PAD.top + ((yMax - v) / (yMax - yMin || 1)) * plotH;

  const path = (pts: Point[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.k)},${y(p.net)}`).join(" ");
  const actual = points.slice(0, closedCount + 1);
  const projected = points.slice(closedCount);
  const area = `${path(points)} L${x(n)},${y(0)} L${x(0)},${y(0)} Z`;

  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(plotW / 44)));
  const payout = points[myRound];
  const active = hover != null ? points[hover] : null;

  function pickRound(clientX: number, rect: DOMRect) {
    const k = Math.round(((clientX - rect.left - PAD.left) / plotW) * n);
    setHover(Math.min(n, Math.max(1, k)));
  }
  function onPointerMove(e: PointerEvent<SVGRectElement>) {
    pickRound(e.clientX, e.currentTarget.ownerSVGElement!.getBoundingClientRect());
  }
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setHover((cur) => Math.min(n, Math.max(1, (cur ?? Math.max(1, closedCount)) + (e.key === "ArrowRight" ? 1 : -1))));
  }

  const summary =
    now.net < 0
      ? { lead: `You've put in ${peso(now.net)} more than you've received.`, rest: ` It comes back to you in Round ${myRound}.` }
      : now.net > 0
        ? { lead: `You've received ${peso(now.net)} more than you've paid in.`, rest: " You pay it back over the remaining rounds." }
        : closedCount === 0
          ? { lead: "Nothing paid in yet.", rest: ` Your payout is Round ${myRound}.` }
          : { lead: "You're even.", rest: closedCount < n ? ` Your payout is Round ${myRound}.` : "" };

  const tooltipLeft = active ? Math.min(Math.max(x(active.k), 90), width - 90) : 0;

  return (
    <section className="rounded-3xl border border-ink-200 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-heading text-lg font-bold text-ink-900">Your money over the cycle</h3>
          <p className="mt-1 text-sm text-ink-600">
            <span className="font-bold text-ink-900">{summary.lead}</span>
            {summary.rest}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowTable((v) => !v)}
          aria-pressed={showTable}
          className={linkButton}
        >
          {showTable ? "Show chart" : "Show as table"}
        </button>
      </div>

      {showTable ? (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[26rem] text-left text-sm tabular-nums">
            <thead className="text-xs font-bold uppercase tracking-wide text-ink-500">
              <tr>
                <th className="py-2 pr-3 font-bold">Round</th>
                <th className="py-2 pr-3 font-bold">Due</th>
                <th className="py-2 pr-3 text-right font-bold">Paid in</th>
                <th className="py-2 pr-3 text-right font-bold">Received</th>
                <th className="py-2 text-right font-bold">Position</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink-100">
              {points.slice(1).map((p) => (
                <tr key={p.k} className={p.k > closedCount ? "text-ink-500" : "text-ink-800"}>
                  <td className="py-2 pr-3 font-bold">
                    {p.k}
                    {p.k === myRound && <span className="ml-1.5 text-xs font-bold text-sun-800">your payout</span>}
                  </td>
                  <td className="py-2 pr-3">{formatDueDate(p.round?.dueDate)}</td>
                  <td className="py-2 pr-3 text-right">{peso(p.paid)}</td>
                  <td className="py-2 pr-3 text-right">{peso(p.received)}</td>
                  <td className="py-2 text-right font-bold">{signedPeso(p.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-500">Gray rows are upcoming rounds, assuming everyone pays in full.</p>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative mt-4 rounded-2xl"
          tabIndex={0}
          role="img"
          aria-label={`Chart of your position by round. ${summary.lead}${summary.rest} Use left and right arrow keys to read each round.`}
          onKeyDown={onKeyDown}
          onFocus={() => setHover((cur) => cur ?? Math.max(1, closedCount))}
          onBlur={() => setHover(null)}
        >
          <svg width={width} height={HEIGHT} className="block overflow-visible" aria-hidden>
            {ticks.map((t) => (
              <g key={t}>
                <line
                  x1={PAD.left}
                  x2={PAD.left + plotW}
                  y1={y(t)}
                  y2={y(t)}
                  stroke={t === 0 ? "var(--color-ink-300)" : "var(--color-ink-100)"}
                  strokeWidth={1}
                />
                <text
                  x={PAD.left - 8}
                  y={y(t)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-ink-500 text-[11px] tabular-nums"
                >
                  {tickLabel(t)}
                </text>
              </g>
            ))}

            {points.slice(1).map((p) =>
              p.k % labelEvery === 0 || p.k === myRound || p.k === 1 ? (
                <text
                  key={p.k}
                  x={x(p.k)}
                  y={HEIGHT - 8}
                  textAnchor="middle"
                  className={`text-[11px] tabular-nums ${p.k === myRound ? "fill-ink-900 font-bold" : "fill-ink-500"}`}
                >
                  R{p.k}
                </text>
              ) : null,
            )}

            <path d={area} fill="var(--color-brand-500)" fillOpacity={0.1} />
            <path
              d={path(actual)}
              fill="none"
              stroke="var(--color-brand-600)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <path
              d={path(projected)}
              fill="none"
              stroke="var(--color-brand-600)"
              strokeWidth={2}
              strokeDasharray="0 6"
              strokeLinecap="round"
            />

            <circle cx={x(payout.k)} cy={y(payout.net)} r={6} fill="var(--color-sun-600)" stroke="white" strokeWidth={2} />
            <text
              x={x(payout.k)}
              y={y(payout.net) - 12}
              textAnchor={payout.k > n * 0.8 ? "end" : payout.k < n * 0.2 ? "start" : "middle"}
              className="fill-ink-700 text-[11px] font-bold"
            >
              Your payout
            </text>

            {active && (
              <g>
                <line
                  x1={x(active.k)}
                  x2={x(active.k)}
                  y1={PAD.top}
                  y2={PAD.top + plotH}
                  stroke="var(--color-ink-300)"
                  strokeWidth={1}
                />
                <circle
                  cx={x(active.k)}
                  cy={y(active.net)}
                  r={4.5}
                  fill="var(--color-brand-600)"
                  stroke="white"
                  strokeWidth={2}
                />
              </g>
            )}

            <rect
              x={PAD.left}
              y={0}
              width={plotW}
              height={HEIGHT}
              fill="transparent"
              onPointerMove={onPointerMove}
              onPointerDown={onPointerMove}
              onPointerLeave={() => setHover(null)}
            />
          </svg>

          {active && (
            <div
              className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-2xl border border-ink-200 bg-white px-3 py-2 shadow-lift"
              style={{ left: tooltipLeft }}
            >
              <p className="text-base font-bold tabular-nums text-ink-900">{signedPeso(active.net)}</p>
              <p className="text-xs text-ink-600">
                after Round {active.k}
                {active.round && ` · ${formatDueDate(active.round.dueDate)}`}
              </p>
              <p className="mt-1 text-xs tabular-nums text-ink-500">
                Paid {peso(active.paid)} · Got {peso(active.received)}
              </p>
              {active.k > closedCount && <p className="mt-1 text-[11px] font-bold text-ink-500">Projected</p>}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
