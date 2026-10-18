import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronRight, Shuffle } from "lucide-react";
import type { GroupDetail, ScheduleRound, SlotView } from "../../api/client";
import { dueHint, formatMonthDay } from "../../lib/dates";
import { formatPeso } from "../../lib/money";
import { ui } from "../../lib/ui";
import { currentOrder, slotHasActions, slotTag } from "./slots";
import { swapRequestBlocker } from "./swaps/swaps";

const PAYOUT_LINE = {
  AWAITING_HANDOVER: (net: string) => `${net} to hand over`,
  HANDED_OVER: (net: string) => `Handed over ${net}`,
  CONFIRMED: (net: string) => `Paid out ${net}`,
} as const;

/** One half of the rail, leading into `round`: solid once that round has started, dashed before. */
function railClass(round: ScheduleRound): string {
  return round.status === "UPCOMING" ? "border-l-2 border-dashed border-ink-200" : "w-0.5 bg-brand-600";
}

/**
 * Who gets the pot on which date: the payout order and the schedule in one list (R-ORD, §4.3).
 * Once everyone has a turn this is also the member list, so organizers tap a row for that slot's
 * actions. In the lobby the organizer arranges it here; the page owns the draft so it can hide
 * other actions while one is open.
 */
export function PayoutSchedule({
  detail,
  canArrange = false,
  draft = null,
  pending = null,
  onDraftChange,
  onShuffle,
  onSaveOrder,
  onSelect,
  onOpenPayout,
  onSwap,
  animateIn = false,
}: {
  detail: GroupDetail;
  /** Organizer, in the lobby, with every slot filled (R-ORD-01). */
  canArrange?: boolean;
  /** The order being arranged, or null when not arranging. */
  draft?: string[] | null;
  pending?: string | null;
  onDraftChange?: (draft: string[] | null) => void;
  onShuffle?: () => void;
  onSaveOrder?: (slotIds: string[]) => void;
  onSelect?: (slot: SlotView) => void;
  /** Closed rounds open their payout (breakdown, handover, receipt). */
  onOpenPayout?: (round: number) => void;
  /** While it runs: ask to swap turns with that slot (§9). Shown as a "Swap" button where allowed. */
  onSwap?: (slot: SlotView) => void;
  /** The rows rise in one after another: the schedule has just taken over from the member list. */
  animateIn?: boolean;
}) {
  const { schedule, slots, group } = detail;
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const order = currentOrder(detail);
  // Before an order is set, the organizer first, then by joining: what Arrange starts from.
  const provisional = [...slots].sort((a, b) => Number(b.isOrganizer) - Number(a.isOrganizer)).map((s) => s.id);
  // In the lobby this list replaces the member list once every slot is filled, so it names everyone even
  // before an order is set (muted, with how they joined) and the organizer can still tap a row to remove
  // someone. While arranging, the rows follow the draft; dates stay fixed to round numbers.
  const unordered = !draft && !order && group.state === "LOBBY";
  const recipients: (SlotView | undefined)[] = (draft ?? order ?? (unordered ? provisional : [])).map((id) =>
    slotById.get(id),
  );
  // If any payout falls outside this year, every date shows its year so the column lines up.
  const thisYear = String(new Date().getFullYear());
  const withYear = schedule.some((r) => !r.payoutDate.startsWith(thisYear));

  function startArranging() {
    onDraftChange?.(order ?? provisional);
  }

  function move(index: number, by: -1 | 1) {
    if (!draft) return;
    const next = [...draft];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onDraftChange?.(next);
  }

  const moveButton =
    "flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-30";

  return (
    <section aria-labelledby="schedule-heading" className={animateIn ? "animate-rise" : undefined}>
      {/* Once it runs, the Schedule view's tab names this list: the heading is for screen readers only,
          with no margin, so the list starts where the Members list does. */}
      <div className={group.state === "LOBBY" ? "mb-3 flex flex-wrap items-end justify-between gap-2" : ""}>
        <h2 id="schedule-heading" className={group.state === "LOBBY" ? ui.sectionHeading : "sr-only"}>
          Payout schedule
        </h2>
        {/* While arranging, the buttons stay in the layout but invisible (and out of reach), so the list
            doesn't move up, even on a phone where they wrap below the heading. */}
        {canArrange && (
          <div className={`flex gap-2 ${draft ? "invisible" : ""}`}>
            {/* A shuffle takes a split second and the rows changing are the feedback, so the button doesn't
                disable or relabel (that flickered on repeated clicks); clicks while one runs are ignored. */}
            <button
              type="button"
              onClick={() => pending !== "shuffle" && onShuffle?.()}
              aria-busy={pending === "shuffle"}
              className={ui.btnSecondarySm}
            >
              <Shuffle className="h-4 w-4" aria-hidden />
              {order ? "Shuffle again" : "Shuffle"}
            </button>
            <button type="button" onClick={startArranging} className={ui.btnSecondarySm}>
              Arrange
            </button>
          </div>
        )}
      </div>

      <ol className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {schedule.map((round, index) => {
          const slot = recipients[index];
          const payout = detail.payouts.find((p) => p.round === round.number);
          // A second line only when there's news: a payout made or pending. The ringed dot marks the round
          // collecting now, and upcoming turns need nothing beyond the date in the left column.
          const status = payout ? PAYOUT_LINE[payout.status](formatPeso(payout.net)) : null;
          const hint = dueHint(round.payoutDate)?.label ?? "";
          const next = schedule[index + 1];
          const body = (
            <>
              {/* The date leads: this is a calendar. The year sits underneath when the list crosses years. */}
              <span className="w-14 shrink-0 tabular-nums leading-tight">
                <span className="block text-base font-bold text-ink-900">{formatMonthDay(round.payoutDate)}</span>
                {withYear && <span className="block text-sm text-ink-500">{round.payoutDate.slice(0, 4)}</span>}
              </span>
              {/* The rail: solid up to the round collecting now, dashed after it, so progress reads at a
                  glance. Paid-out rounds are filled, the open one is ringed, upcoming ones are hollow. */}
              <span className="relative flex w-8 shrink-0 items-center justify-center self-stretch" aria-hidden>
                {index > 0 && <span className={`absolute top-0 h-1/2 ${railClass(round)}`} />}
                {next && <span className={`absolute bottom-0 h-1/2 ${railClass(next)}`} />}
                <span
                  className={`relative flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                    round.status === "CLOSED"
                      ? "bg-brand-600 text-white"
                      : round.status === "OPEN"
                        ? "border-2 border-brand-600 bg-white text-brand-700"
                        : "border-2 border-ink-200 bg-white text-ink-500"
                  }`}
                >
                  {round.number}
                </span>
              </span>
              <span className="sr-only">Round {round.number}</span>
              <span className="min-w-0 flex-1">
                {slot && unordered ? (
                  // No turn yet: who's in, not who's paid when.
                  <>
                    <span className="block truncate text-base font-bold text-ink-500">{slot.name}</span>
                    <span className="block truncate text-sm text-ink-500">{slotTag(slot)}</span>
                  </>
                ) : slot ? (
                  <>
                    <span className="block truncate text-base font-bold text-ink-900">{slot.name}</span>
                    {status && (
                      <span className="block truncate text-sm tabular-nums text-ink-500">{status}</span>
                    )}
                  </>
                ) : (
                  // No order yet: how far off the date is.
                  <span className="block truncate text-base text-ink-500">{hint.charAt(0).toUpperCase() + hint.slice(1)}</span>
                )}
              </span>
            </>
          );
          const opensPayout = !!payout && !!onOpenPayout;
          // A labelled button, not a bare chevron: swapping is an action people need to see to know of.
          // Only where the viewer may actually ask (R-SWP-01/03, R-DEC-23).
          const canSwap = !!onSwap && !draft && !payout && !!slot && !slot.isViewer && swapRequestBlocker(detail, slot.id) === null;
          const tappable = !draft && !canSwap && slot && (opensPayout || (onSelect && slotHasActions(slot, detail)));
          // One fixed height and spacing for every row, arranging or not: it fits the 44px move buttons, and
          // the text lines truncate instead of wrapping. 72px, like the Members rows, with the Debts table's
          // type and padding so the views read alike.
          const rowClass = "flex h-18 w-full items-center gap-3 px-5 text-left";
          return (
            <li
              key={round.number}
              className={animateIn ? "animate-rise" : undefined}
              style={animateIn ? { animationDelay: `${Math.min(index, 12) * 40}ms` } : undefined}
            >
              {tappable ? (
                <button
                  type="button"
                  onClick={() => (opensPayout ? onOpenPayout!(round.number) : onSelect!(slot))}
                  className={`${rowClass} transition-colors hover:bg-ink-50`}
                >
                  {body}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </button>
              ) : (
                <div className={rowClass}>
                  {body}
                  {canSwap ? (
                    <button type="button" onClick={() => onSwap!(slot!)} className={`${ui.btnSecondarySm} shrink-0`}>
                      <ArrowLeftRight className="h-4 w-4" aria-hidden />
                      Swap
                    </button>
                  ) : (
                    // Same width as the chevron on tappable rows, so every date lines up.
                    !draft && <span className="w-4 shrink-0" aria-hidden />
                  )}
                  {draft && (
                    <span className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => move(index, -1)} disabled={index === 0} aria-label={`Move ${slot?.name} earlier`} className={moveButton}>
                        <ArrowUp className="h-4 w-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(index, 1)}
                        disabled={index === schedule.length - 1}
                        aria-label={`Move ${slot?.name} later`}
                        className={moveButton}
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden />
                      </button>
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {draft && (
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" onClick={() => onDraftChange?.(null)} className={`${ui.btnSecondary} min-h-11 flex-1 sm:flex-none`}>
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onSaveOrder?.(draft)}
            disabled={pending === "order"}
            className={`${ui.btnPrimary} min-h-11 flex-1 sm:flex-none`}
          >
            {pending === "order" ? "Saving…" : "Save order"}
          </button>
        </div>
      )}
    </section>
  );
}
