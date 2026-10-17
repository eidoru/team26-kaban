import { ChevronRight } from "lucide-react";
import type { SlotView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { Sheet } from "../../../components/flow/Sheet";
import { formatPeso } from "../../../lib/money";

/**
 * Recording a payment with more than one placeholder owing (R-SUB-02): who paid, then the pay sheet.
 * Used for contributions (Dashboard) and debt payments (Debts view); `owes` is what that slot can
 * still be recorded for.
 */
export function WhoPaidSheet({
  open,
  rows,
  onClose,
  onPick,
}: {
  open: boolean;
  rows: { slot: SlotView; owes: number }[];
  onClose: () => void;
  onPick: (slot: SlotView) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Who paid you?" subtitle="Placeholders pay you outside the app.">
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {rows.map(({ slot, owes }) => (
          <li key={slot.id}>
            <button
              type="button"
              onClick={() => onPick(slot)}
              className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50"
            >
              <Avatar name={slot.name} size="md" placeholder />
              <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-900">{slot.name}</span>
              <span className="shrink-0 text-sm tabular-nums text-ink-600">owes {formatPeso(owes)}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
