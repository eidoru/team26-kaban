import { useState } from "react";
import { CircleCheck } from "lucide-react";
import type { GroupDetail, SlotView, SubmissionView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { ActionBar } from "../../../components/flow/ActionBar";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { debtReportable, owedBy, pendingTowardDebt } from "../active/period";
import { WhoPaidSheet } from "../active/WhoPaidSheet";

interface DebtRow {
  slot: SlotView;
  owed: number;
  /** Paid back plus taken from their payout. */
  paid: number;
  /** Pending submissions that will land on the debt, oldest first. */
  inReview: SubmissionView[];
}

/** A cell amount, or a dash for nothing. */
const cell = (centavos: number) => (centavos === 0 ? "–" : formatPeso(centavos));

/**
 * The Debts view, a member × round grid: one row per person who has had a debt (every member sees
 * every debt, R-DEC-06), a column per round with what that round's payout added (the shortfall
 * covered, R-DBT-01, and interest, R-DBT-02/03), what's been paid back (R-DBT-04/05, R-PAY-03),
 * and what's owed now, with totals underneath. The name column stays put while rounds scroll.
 * Then the refunds the organizer owes back (R-DSP-03, R-DEC-14).
 *
 * No buttons in the grid: the actions are in the bottom bar, where every page keeps its main one.
 * The organizer reviews debt payments that are waiting (R-SUB-03, oldest first per R-SUB-05) and
 * records a placeholder's payment (R-SUB-02), picking who paid; a member pays toward their own.
 */
export function DebtsView({
  detail,
  onPay,
  onReview,
}: {
  detail: GroupDetail;
  onPay: (slot: SlotView) => void;
  onReview: (submission: SubmissionView) => void;
}) {
  const { viewer } = detail;
  const [picking, setPicking] = useState(false);
  const rows: DebtRow[] = detail.slots
    .map((slot) => ({
      slot,
      owed: owedBy(detail, slot.id),
      paid: slot.debt.repaid + slot.debt.deducted,
      inReview: pendingTowardDebt(detail, slot.id),
    }))
    .filter((r) => r.owed > 0 || r.inReview.length > 0 || r.slot.debt.rounds.length > 0)
    .sort((a, b) => b.owed - a.owed || a.slot.name.localeCompare(b.slot.name, undefined, { sensitivity: "base" }));
  const refunds = viewer.isOrganizer ? detail.disputes.filter((d) => d.refund) : [];

  if (rows.length === 0 && refunds.length === 0) {
    return (
      <div className={`${ui.emptyState} flex flex-col items-center`}>
        <CircleCheck className="h-8 w-8 text-brand-600" aria-hidden />
        <p className="font-heading mt-3 text-lg font-bold text-ink-900">Nobody owes anything</p>
        <p className={`mt-1 text-sm ${ui.muted}`}>Shortfalls the organizer covers at a payout show up here.</p>
      </div>
    );
  }

  // The bar's actions. Reviews first: the money is already in, it only needs a decision.
  const waiting = viewer.isOrganizer
    ? rows.flatMap((r) => r.inReview).sort((a, b) => a.submittedAt.localeCompare(b.submittedAt))
    : [];
  const recordable = viewer.isOrganizer ? rows.filter((r) => r.slot.kind === "PLACEHOLDER" && canPay(detail, r.slot)) : [];
  const mine = rows.find((r) => r.slot.isViewer && canPay(detail, r.slot));
  const record = () => (recordable.length === 1 ? onPay(recordable[0].slot) : setPicking(true));
  // What's in review is said once, here above the buttons that act on it, not in the grid.
  const nameOf = (slotId: string) => rows.find((r) => r.slot.id === slotId)?.slot.name;
  const myReview = mine?.inReview.reduce((total, x) => total + x.amount, 0) ?? 0;
  const hint =
    waiting.length > 0
      ? `${waiting.length > 1 ? "Oldest first: " : ""}${nameOf(waiting[0].slotId)} sent ${formatPeso(waiting[0].amount)}`
      : myReview > 0
        ? `${formatPeso(myReview)} in review with ${detail.group.organizerName}`
        : undefined;

  return (
    <div className="space-y-4">
      {rows.length > 0 && <DebtGrid rows={rows} />}
      {refunds.length > 0 && (
        <ul aria-label="Refunds you owe" className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
          {refunds.map((d) => {
            const slot = detail.slots.find((s) => s.id === d.slotId);
            return (
              <li key={d.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                <Avatar name={slot?.name} size="md" placeholder={slot?.kind === "PLACEHOLDER"} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink-900">You owe {slot?.name} a refund</span>
                  <span className="block text-xs text-ink-500">
                    Round {d.round}: {formatPeso(d.previousAmount)} corrected to {formatPeso(d.proposedAmount)}. Hand it back
                    outside the app.
                  </span>
                </span>
                {/* R-DEC-39: the fee on the refunded part goes back with it. */}
                <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900">
                  {formatPeso(d.refund! + (d.refundFee ?? 0))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {(waiting.length > 0 || recordable.length > 0 || mine) && (
        <ActionBar hint={hint}>
          {recordable.length > 0 && (
            <button type="button" onClick={record} className={waiting.length > 0 ? ui.btnSecondary : ui.btnPrimary}>
              {/* Beside Review it gets half the bar on phones, so the short label. */}
              {waiting.length > 0
                ? "Record payment"
                : recordable.length === 1
                  ? `Record ${recordable[0].slot.name}'s payment`
                  : "Record a debt payment"}
            </button>
          )}
          {waiting.length > 0 && (
            <button type="button" onClick={() => onReview(waiting[0])} className={ui.btnPrimary}>
              {waiting.length === 1 ? `Review ${formatPeso(waiting[0].amount)}` : `Review ${waiting.length} payments`}
            </button>
          )}
          {mine && (
            <button type="button" onClick={() => onPay(mine.slot)} className={ui.btnPrimary}>
              Pay toward your {formatPeso(mine.owed)} debt
            </button>
          )}
        </ActionBar>
      )}
      <WhoPaidSheet
        open={picking}
        rows={recordable.map((r) => ({ slot: r.slot, owes: r.owed }))}
        onClose={() => setPicking(false)}
        onPick={(slot) => {
          setPicking(false);
          onPay(slot);
        }}
      />
    </div>
  );
}

/** The viewer can pay toward this debt: their own, or the organizer for a placeholder (R-SUB-02). */
function canPay(detail: GroupDetail, slot: SlotView) {
  const forThem = slot.isViewer || (detail.viewer.isOrganizer && slot.kind === "PLACEHOLDER");
  return forThem && debtReportable(detail, slot.id) > 0;
}

/** The grid itself. Rows are people, most owed first; columns are the rounds that added debt. */
function DebtGrid({ rows }: { rows: DebtRow[] }) {
  const rounds = [...new Set(rows.flatMap((r) => r.slot.debt.rounds.map((x) => x.round)))].sort((a, b) => a - b);
  const added = (row: DebtRow, round: number) => {
    const r = row.slot.debt.rounds.find((x) => x.round === round);
    return r ? r.shortfall + r.interest : 0;
  };
  const sum = (f: (row: DebtRow) => number) => rows.reduce((total, row) => total + f(row), 0);
  const num = "px-4 py-4 text-right tabular-nums whitespace-nowrap";
  // The name column stays in view while the rounds scroll; it needs its own background to cover them.
  const sticky = "sticky left-0 z-10 max-w-44 border-r border-ink-100 px-5 py-4 text-left";

  return (
    <div className="overflow-x-auto rounded-3xl border border-ink-200 bg-white">
      <table aria-label="Debts" className="w-full border-collapse text-base">
        <thead>
          <tr className="border-b border-ink-100 text-sm font-semibold text-ink-500">
            <th scope="col" className={`${sticky} bg-white font-semibold`}>
              <span className="sr-only">Member</span>
            </th>
            {rounds.map((round) => (
              <th key={round} scope="col" className={`${num} font-semibold`}>
                Round {round}
              </th>
            ))}
            <th scope="col" className={`${num} font-semibold`}>
              Paid back
            </th>
            <th scope="col" className={`${num} font-semibold text-ink-900`}>
              Owed
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-100">
          {rows.map((row) => {
            const { slot, owed, paid } = row;
            const bg = slot.isViewer ? "bg-brand-50" : "bg-white";

            return (
              <tr key={slot.id} className={bg}>
                <th scope="row" className={`${sticky} ${bg} font-normal`}>
                  <span className="block truncate font-bold text-ink-900">{slot.isViewer ? "You" : slot.name}</span>
                </th>
                {rounds.map((round) => (
                  <td key={round} className={`${num} text-ink-700`}>
                    {cell(added(row, round))}
                  </td>
                ))}
                <td className={`${num} text-ink-700`}>{paid > 0 ? `−${cell(paid)}` : "–"}</td>
                <td className={`${num} font-bold ${owed > 0 ? "text-danger-700" : "text-ink-500"}`}>{cell(owed)}</td>
              </tr>
            );
          })}
        </tbody>
        {rows.length > 1 && (
          <tfoot>
            <tr className="border-t border-ink-200 bg-ink-50 font-bold text-ink-900">
              <th scope="row" className={`${sticky} bg-ink-50`}>
                Total
              </th>
              {rounds.map((round) => (
                <td key={round} className={num}>
                  {cell(sum((row) => added(row, round)))}
                </td>
              ))}
              <td className={num}>{sum((r) => r.paid) > 0 ? `−${cell(sum((r) => r.paid))}` : "–"}</td>
              <td className={num}>{cell(sum((r) => r.owed))}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
