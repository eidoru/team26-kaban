import { Link } from "react-router-dom";
import { Pencil } from "lucide-react";
import type { GroupDetail } from "../../api/client";
import { formatDueDate } from "../../lib/dates";
import { formatPeso, formatRate } from "../../lib/money";
import { ui } from "../../lib/ui";

/** The paluwagan's settings. Organizers can edit them in the lobby (R-LOB-09). */
export function GroupDetails({ detail, onCancel }: { detail: GroupDetail; onCancel?: () => void }) {
  const { group, viewer } = detail;
  const editable = viewer.isOrganizer && group.state === "LOBBY";
  const rows = [
    { label: "Contribution", value: `${formatPeso(group.contribution)} per member` },
    {
      label: "Pot",
      value: formatPeso(group.pot),
      note:
        group.potAdjustedFrom != null
          ? `Rounded up from ${formatPeso(group.potAdjustedFrom)} so it splits evenly.`
          : undefined,
    },
    { label: "Frequency", value: group.frequencyLabel },
    { label: "Start date", value: formatDueDate(group.startDate) },
    {
      label: "Shortfall interest",
      value: group.interestRate > 0 ? `${formatRate(group.interestRate)} per period` : "None",
    },
    { label: "Organizer", value: group.organizerName },
  ];
  return (
    <section aria-labelledby="details-heading">
      <div className="mb-3 flex items-end justify-between gap-2">
        <h2 id="details-heading" className={ui.sectionHeading}>
          Details
        </h2>
        {editable && (
          <Link to={`/groups/${group.id}/edit`} className={ui.btnSecondarySm}>
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </Link>
        )}
      </div>
      <dl className="divide-y divide-ink-100 rounded-3xl border border-ink-200 bg-white">
        {rows.map((row) => (
          <div key={row.label} className="flex gap-3 px-5 py-3">
            <dt className="w-36 shrink-0 text-sm text-ink-500">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-sm font-bold text-ink-900">
              {row.value}
              {row.note && <span className="mt-0.5 block text-xs font-normal text-ink-500">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {editable && onCancel && (
        <div className="mt-4 text-right">
          <button type="button" onClick={onCancel} className={ui.btnDangerGhost}>
            Cancel this paluwagan
          </button>
        </div>
      )}
    </section>
  );
}
