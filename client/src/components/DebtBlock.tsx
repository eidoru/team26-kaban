import { Link } from "react-router-dom";
import { HandCoins } from "lucide-react";
import { inDebtMessage, type DebtOwed } from "@domain/debt";
import { formatPeso } from "../lib/money";
import { ui } from "../lib/ui";

/**
 * R-DEC-39: why the user can't start, join or claim a slot yet, and where to pay. Same rows as
 * Home's "Due soon", so Pay opens the debt payment there.
 */
export function DebtBlock({ debts, action }: { debts: DebtOwed[]; action: "create" | "join" }) {
  return (
    <div className="space-y-3">
      <p className="text-center text-sm font-bold text-ink-700">{inDebtMessage(debts, action)}</p>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-2xl border border-ink-200 bg-white text-left">
        {debts.map((debt) => (
          <li key={debt.groupId} className="flex items-center gap-3 px-4 py-3">
            <HandCoins className="h-5 w-5 shrink-0 text-danger-700" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-bold tabular-nums text-ink-900">
              {formatPeso(debt.owed)}
              <span className="font-semibold text-danger-700"> debt</span>
              <span className="font-semibold text-ink-600"> · {debt.groupName}</span>
            </span>
            <Link to={`/groups/${debt.groupId}?pay=debt`} className={`${ui.btnPrimarySm} min-h-9`}>
              Pay
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
