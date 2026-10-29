import { Link } from "react-router-dom";
import {
  CalendarDays,
  ChevronRight,
  HandCoins,
  History,
  Pencil,
  Percent,
  Repeat,
  UserRound,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { GroupDetail } from "../../api/client";
import { formatDueDate } from "../../lib/dates";
import { formatPeso, formatRate } from "../../lib/money";
import { ui } from "../../lib/ui";

export function PageLink({ to, icon: Icon, title, note }: { to: string; icon: LucideIcon; title: string; note: string }) {
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
export function GroupDetails({
  detail,
  links = true,
  heading = true,
}: {
  detail: GroupDetail;
  /** The "Details" heading; off on the Dashboard, where the card speaks for itself. */
  heading?: boolean;
  /** The page links (Money & records, Your history, Activity); off where the view navigation has them. */
  links?: boolean;
}) {
  const { group, viewer } = detail;
  const editable = viewer.isOrganizer && group.state === "LOBBY";
  // Short labels with icons: the terms at a glance, one line each.
  const rows: { icon: LucideIcon; label: string; value: string; note?: string }[] = [
    { icon: HandCoins, label: "Each pays", value: formatPeso(group.contribution) },
    {
      icon: Wallet,
      label: "Pot",
      value: formatPeso(group.pot),
      note: group.potAdjustedFrom != null ? `Rounded up from ${formatPeso(group.potAdjustedFrom)}` : undefined,
    },
    { icon: Repeat, label: "Payouts", value: group.frequencyLabel },
    { icon: CalendarDays, label: "Starts", value: formatDueDate(group.startDate) },
    {
      icon: Percent,
      label: "Interest",
      value: group.interestRate > 0 ? `${formatRate(group.interestRate)} per period` : "None",
    },
    { icon: UserRound, label: "Organizer", value: group.organizerName },
  ];
  return (
    <section aria-labelledby="details-heading">
      <div className={heading || editable ? "mb-3 flex items-end justify-between gap-2" : ""}>
        <h2 id="details-heading" className={heading ? ui.sectionHeading : "sr-only"}>
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
          <div key={row.label} className="flex items-start gap-3 px-5 py-3">
            <row.icon className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" aria-hidden />
            <dt className="shrink-0 text-sm text-ink-500">{row.label}</dt>
            <dd className="min-w-0 flex-1 text-right text-sm font-bold text-ink-900">
              {row.value}
              {row.note && <span className="block text-xs font-normal text-ink-500">{row.note}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {/* Before launch there's no view navigation, so Activity is linked from here. */}
      {links && (
        <PageLink
          to={`/groups/${group.id}/activity`}
          icon={History}
          title="Activity"
          note="Everything that happens here, visible to every member"
        />
      )}
    </section>
  );
}
