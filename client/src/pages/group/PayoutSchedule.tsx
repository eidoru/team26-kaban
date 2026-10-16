import { ArrowDown, ArrowUp, ChevronRight, Shuffle } from "lucide-react";
import type { GroupDetail, SlotView } from "../../api/client";
import { dueHint, formatShortDate } from "../../lib/dates";
import { formatPeso } from "../../lib/money";
import { ui } from "../../lib/ui";
import { currentOrder, slotHasActions } from "./slots";

const PAYOUT_LINE = {
  AWAITING_HANDOVER: (net: string) => `${net} to hand over`,
  HANDED_OVER: (net: string) => `Handed over ${net}`,
  CONFIRMED: (net: string) => `Paid out ${net}`,
} as const;

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
}) {
  const { schedule, slots, group } = detail;
  const slotById = new Map(slots.map((s) => [s.id, s]));
  const order = currentOrder(detail);
  // While arranging, the rows follow the draft; dates stay fixed to round numbers.
  const recipients: (SlotView | undefined)[] = (draft ?? order ?? []).map((id) => slotById.get(id));
  // If any payout falls outside this year, every date shows its year so the column lines up.
  const thisYear = String(new Date().getFullYear());
  const withYear = schedule.some((r) => !r.payoutDate.startsWith(thisYear));

  function startArranging() {
    onDraftChange?.(order ?? [...slots].sort((a, b) => Number(b.isOrganizer) - Number(a.isOrganizer)).map((s) => s.id));
  }

  function move(index: number, by: -1 | 1) {
    if (!draft) return;
    const next = [...draft];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onDraftChange?.(next);
  }

  // The one thing worth saying: before launch, an order can still change.
  const subtitle = group.state === "LOBBY" && order ? "You can change it until you launch." : null;
  const moveButton =
    "flex h-11 w-11 items-center justify-center rounded-full border-2 border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-30";

  return (
    <section aria-labelledby="schedule-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="schedule-heading" className={ui.sectionHeading}>
            Payout schedule
          </h2>
          {subtitle && <p className={ui.sectionSubtitle}>{subtitle}</p>}
        </div>
        {canArrange && !draft && (
          <div className="flex gap-2">
            <button type="button" onClick={onShuffle} disabled={pending === "shuffle"} className={ui.btnSecondarySm}>
              <Shuffle className="h-4 w-4" aria-hidden />
              {pending === "shuffle" ? "Shuffling…" : order ? "Shuffle again" : "Shuffle"}
            </button>
            <button type="button" onClick={startArranging} className={ui.btnSecondarySm}>
              Arrange
            </button>
          </div>
        )}
      </div>

      <ol className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {schedule.map((round, index) => {
          const slot = recipients[index];
          const payout = detail.payouts.find((p) => p.round === round.number);
          // One idea per row: who, and when. A second line appears only when there's news: a payout
          // made or pending, or the round collecting now. Upcoming turns need nothing beyond the date.
          const status = payout
            ? PAYOUT_LINE[payout.status](formatPeso(payout.net))
            : null;
          const hint = dueHint(round.payoutDate)?.label ?? "";
          const body = (
            <>
              <span
                className={`font-heading flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl text-lg font-bold ${
                  round.status === "OPEN"
                    ? "bg-brand-700 text-white"
                    : round.status === "CLOSED"
                      ? "bg-brand-100 text-brand-800"
                      : "bg-ink-100 text-ink-700"
                }`}
                aria-label={`Round ${round.number}`}
              >
                {round.number}
              </span>
              <span className="min-w-0 flex-1">
                {slot ? (
                  <>
                    <span className="block truncate text-sm font-bold text-ink-900">
                      {slot.name}
                    </span>
                    {status && (
                      <span className={`block truncate text-xs ${payout ? "text-ink-500" : "font-semibold text-brand-700"}`}>
                        {status}
                      </span>
                    )}
                  </>
                ) : (
                  // No order yet (the subtitle says so): the countdown is all there is to say.
                  <span className="block truncate text-sm text-ink-500">{hint.charAt(0).toUpperCase() + hint.slice(1)}</span>
                )}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-700">{formatShortDate(round.payoutDate, withYear)}</span>
            </>
          );
          const opensPayout = !!payout && !!onOpenPayout;
          const tappable = !draft && slot && (opensPayout || (onSelect && slotHasActions(slot, detail)));
          // One fixed height for every row, arranging or not: it fits the 44px move buttons, and the
          // text lines truncate instead of wrapping. Arranging tightens the spacing to leave the name room.
          const rowClass = `flex h-14 w-full items-center ${draft ? "gap-2 px-3" : "gap-3 px-4"} text-left ${slot?.isViewer ? "bg-brand-50" : ""}`;
          return (
            <li key={round.number}>
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
                  {/* Same width as the chevron on tappable rows, so every date lines up. */}
                  {!draft && <span className="w-4 shrink-0" aria-hidden />}
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
        <div className="mt-3 flex gap-2">
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
