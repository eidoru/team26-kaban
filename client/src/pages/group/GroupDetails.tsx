import { Link } from "react-router-dom";
import { ChevronRight, History, Pencil, ReceiptText, Wallet, type LucideIcon } from "lucide-react";
import type { GroupDetail } from "../../api/client";
import { formatDueDate } from "../../lib/dates";
import { formatPeso, formatRate } from "../../lib/money";
import { ui } from "../../lib/ui";

function PageLink({ to, icon: Icon, title, note }: { to: string; icon: LucideIcon; title: string; note: string }) {
  return (
    <Link
      to={to}
      className="mt-3 flex min-h-14 items-center gap-3 rounded-3xl border border-ink-200 bg-white px-5 py-3 transition-colors hover:border-brand-300"
    >
      <Icon className="h-5 w-5 shrink-0 text-ink-500" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink-900">{title}</span>
        <span className="block text-xs text-ink-500">{note}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
    </Link>
  );
}

/**
 * The paluwagan's settings, and links to its other pages. Organizers can edit the settings in the
 * lobby (R-LOB-09).
 */
export function GroupDetails({ detail, onCancel }: { detail: GroupDetail; onCancel?: () => void }) {
  const { group, viewer } = detail;
  const editable = viewer.isOrganizer && group.state === "LOBBY";
  const started = group.state === "ACTIVE" || group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT";
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
            <dt className="w-36 shrink-0 text-sm text-ink-500 lg:w-28">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-sm font-bold text-ink-900">
              {row.value}
              {row.note && <span className="mt-0.5 block text-xs font-normal text-ink-500">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {started && (
        <PageLink
          to={`/groups/${group.id}/money`}
          icon={Wallet}
          title="Money & records"
          note={viewer.isOrganizer ? "Collected and paid out, how rounds went, downloads" : "Your statement and the summary, to download"}
        />
      )}
      {started && (
        <PageLink to={`/groups/${group.id}/history`} icon={ReceiptText} title="Your history" note="Every payment, debt change and payout for your slot" />
      )}
      <PageLink
        to={`/groups/${group.id}/activity`}
        icon={History}
        title="Activity"
        note="Everything that happens here, visible to every member"
      />
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
