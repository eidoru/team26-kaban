import type { ReactNode } from "react";
import type {
  AuditLogEntry,
  DisputeEntry,
  GroupMember,
  LedgerEntry,
  MemberReliability,
  ObligationEntry,
  RoundContribution,
  RoundSummary,
} from "../api/client";
import { displayInitials } from "../lib/initials";
import { statusBadgeClass, ui } from "../lib/ui";
import { CopyableLink } from "../components/CopyableLink";

export type CycleTab = "overview" | "schedule" | "ledger" | "issues" | "members" | "audit";

export function CycleSidebar({
  tabs,
  active,
  onSelect,
}: {
  tabs: { id: CycleTab; label: string; badge?: number }[];
  active: CycleTab;
  onSelect: (tab: CycleTab) => void;
}) {
  return (
    <nav aria-label="Group sections">
      <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:overflow-visible md:pb-0">
        {tabs.map((tab) => {
          const isActive = active === tab.id;
          return (
            <li key={tab.id} className="shrink-0 md:shrink">
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelect(tab.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                  isActive
                    ? "bg-emerald-900 font-medium text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <span>{tab.label}</span>
                {tab.badge != null && tab.badge > 0 && (
                  <span
                    className={`inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-xs leading-none ${
                      isActive ? "bg-white/20 text-white" : "bg-red-600 text-white"
                    }`}
                  >
                    {tab.badge > 99 ? "99+" : tab.badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function CycleSectionLayout({
  tabs,
  active,
  onSelect,
  children,
}: {
  tabs: { id: CycleTab; label: string; badge?: number }[];
  active: CycleTab;
  onSelect: (tab: CycleTab) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <div className="md:w-40 md:shrink-0">
        <CycleSidebar tabs={tabs} active={active} onSelect={onSelect} />
      </div>
      <div className="min-w-0 flex-1" role="tabpanel">
        {children}
      </div>
    </div>
  );
}

type StatCardTone = "neutral" | "success" | "warning" | "danger";

const statCardAccent: Record<StatCardTone, string> = {
  neutral: "border-l-gray-200",
  success: "border-l-emerald-200",
  warning: "border-l-amber-200",
  danger: "border-l-red-200",
};

const statCardIconWrap: Record<StatCardTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

function StatCardIcon({ name }: { name: "clock" | "alert" | "wallet" | "users" | "check" }) {
  const className = "h-4 w-4";
  switch (name) {
    case "clock":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7v5l3 2" />
        </svg>
      );
    case "alert":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      );
    case "wallet":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18v10H3V7zm14 0V5a2 2 0 00-2-2H5a2 2 0 00-2 2v2m16 4h-4" />
        </svg>
      );
    case "users":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 13a3 3 0 100-6 3 3 0 000 6zm-2 8a5 5 0 0110 0" />
        </svg>
      );
    case "check":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
  }
}

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatCardTone;
  icon?: "clock" | "alert" | "wallet" | "users" | "check";
}) {
  return (
    <div
      className={`rounded-2xl border border-gray-100 border-l-[3px] bg-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.03)] ${statCardAccent[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-medium tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${statCardIconWrap[tone]}`}
            aria-hidden
          >
            <StatCardIcon name={icon} />
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyTabState({ title, description }: { title: string; description: string }) {
  return (
    <div className={`${ui.emptyState} py-8`}>
      <p className="font-medium text-slate-900">{title}</p>
      <p className={`mt-2 text-sm ${ui.muted}`}>{description}</p>
    </div>
  );
}

function contributionStatusLabel(status: string) {
  if (status === "confirmed") return "Confirmed";
  if (status === "reported") return "Reported";
  return "Pending";
}

function contributionStatusBadge(status: string) {
  if (status === "confirmed") return ui.badgeActive;
  if (status === "reported") return ui.badgeForming;
  return "rounded-full border border-gray-200 bg-gray-50 px-2.5 py-0.5 text-xs font-normal text-slate-600";
}

function paymentStatusBadge(status: string) {
  return `inline-flex min-w-[5.75rem] items-center justify-center ${contributionStatusBadge(status)}`;
}

function ledgerSourceLabel(source?: string) {
  if (source === "organizer") return "Recorded by manager";
  if (source === "member") return "Reported by member";
  return null;
}

function scheduleStatusBadge(status: RoundSummary["status"]) {
  const base = "inline-flex min-w-[5.75rem] items-center justify-center";
  if (status === "current") return `${base} ${statusBadgeClass("active")}`;
  if (status === "closed") return `${base} ${statusBadgeClass("completed")}`;
  return `${base} ${statusBadgeClass("forming")}`;
}

function scheduleStatusLabel(status: RoundSummary["status"] | string) {
  if (status === "current") return "Current";
  if (status === "closed") return "Closed";
  return "Scheduled";
}

function getNextPayoutRound(
  schedule: RoundSummary[],
  currentRound: RoundSummary | null,
): RoundSummary | null {
  if (!currentRound) return null;
  return (
    schedule.find((r) => r.number === currentRound.number + 1) ??
    schedule.find((r) => r.status === "scheduled" && r.number > currentRound.number) ??
    null
  );
}

function isFinalRound(schedule: RoundSummary[], currentRound: RoundSummary | null): boolean {
  if (!currentRound || schedule.length === 0) return false;
  return !schedule.some((r) => r.number > currentRound.number);
}

function obligationStatusLabel(status: string) {
  if (status === "settled") return "Settled";
  if (status === "partially_settled") return "Partially settled";
  return "Unsettled";
}

function disputeStatusLabel(status: string) {
  return status === "resolved" ? "Resolved" : "Open";
}

function auditCategoryClass(category: string) {
  switch (category) {
    case "group":
      return "bg-emerald-100 text-emerald-800";
    case "membership":
      return "bg-blue-100 text-blue-800";
    case "contribution":
      return "bg-amber-100 text-amber-800";
    case "round":
      return "bg-violet-100 text-violet-800";
    case "invite":
      return "bg-gray-100 text-slate-700";
    case "obligation":
      return "bg-red-100 text-red-800";
    case "dispute":
      return "bg-orange-100 text-orange-800";
    default:
      return "bg-gray-50 text-slate-700";
  }
}

function MemberBadge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "default" | "manager" | "muted";
}) {
  const styles =
    variant === "manager"
      ? "border-emerald-100 bg-emerald-50 text-emerald-700"
      : variant === "muted"
        ? "border-gray-200 bg-gray-50 text-slate-500"
        : "border-gray-200 bg-gray-50 text-slate-600";

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap ${styles}`}
    >
      {children}
    </span>
  );
}

function MemberRow({
  member,
  position,
  reliabilitySummary,
  showClaimAction = false,
  claimUrl,
  onClaimInvite,
  claimPending = false,
}: {
  member: GroupMember;
  position: number;
  reliabilitySummary?: string;
  showClaimAction?: boolean;
  claimUrl?: string;
  onClaimInvite?: () => void;
  claimPending?: boolean;
}) {
  const showClaim = showClaimAction && member.isPlaceholder && onClaimInvite;

  return (
    <li className="border-b border-gray-50 px-4 py-3.5 last:border-0">
      <div className="flex items-center gap-3">
        <span
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-700"
          aria-label={`Payout order ${position}`}
        >
          {position}
        </span>
        <span className={ui.avatarInitialsSm} aria-hidden>
          {displayInitials(member.displayName)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate font-medium text-slate-900">{member.displayName}</p>
            {member.isManager && <MemberBadge variant="manager">Manager</MemberBadge>}
            {member.isPlaceholder && <MemberBadge variant="muted">Unclaimed</MemberBadge>}
          </div>
          {member.contact && <p className="mt-0.5 truncate text-sm text-slate-500">{member.contact}</p>}
          {reliabilitySummary && <p className="mt-0.5 truncate text-xs text-slate-500">{reliabilitySummary}</p>}
        </div>
        {showClaim ? (
          <button
            type="button"
            onClick={onClaimInvite}
            disabled={claimPending}
            className="shrink-0 text-sm text-emerald-900 hover:underline disabled:opacity-50"
          >
            Claim link
          </button>
        ) : null}
      </div>
      {claimUrl && <CopyableLink url={claimUrl} label="Claim link" compact />}
    </li>
  );
}

const contributionActionBtn =
  "inline-flex min-w-[7.5rem] items-center justify-center";

function ContributionRow({
  contribution,
  contributionAmount,
  actionPending,
  onReportPayment,
  onConfirmPayment,
  onRecordPayment,
  onRaiseDispute,
  muted = false,
}: {
  contribution: RoundContribution;
  contributionAmount: string;
  actionPending: string | null;
  onReportPayment: (contributionId: string, expectedAmount: string) => void;
  onConfirmPayment: (contributionId: string) => void;
  onRecordPayment: (contributionId: string, expectedAmount: string) => void;
  onRaiseDispute: (contributionId: string, memberName: string) => void;
  muted?: boolean;
}) {
  const expected = contribution.expectedAmount ?? contributionAmount;
  const amountLabel =
    contribution.isPartial && contribution.expectedAmount
      ? `₱${Number(contribution.amount).toLocaleString()} / ₱${Number(contribution.expectedAmount).toLocaleString()}`
      : `₱${Number(contribution.amount).toLocaleString()}`;
  const hasActions =
    contribution.canReport ||
    contribution.canConfirm ||
    contribution.canRecord ||
    contribution.canDispute;

  return (
    <li
      className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
        muted ? "opacity-70" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className={ui.avatarInitialsSm} aria-hidden>
          {displayInitials(contribution.displayName ?? "?")}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{contribution.displayName ?? "Member"}</p>
          {(contribution.isPartial || contribution.isPlaceholder) && (
            <p className="truncate text-xs text-slate-500">
              {contribution.isPartial && "Partial payment"}
              {contribution.isPartial && contribution.isPlaceholder && " · "}
              {contribution.isPlaceholder && "Placeholder"}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <p className="text-sm font-medium tabular-nums text-slate-900">{amountLabel}</p>
        {hasActions && (
          <div className="flex flex-wrap gap-2">
            {contribution.canReport && (
              <button
                type="button"
                onClick={() => onReportPayment(contribution.id, expected)}
                disabled={actionPending === contribution.id}
                className={`${contributionActionBtn} ${ui.btnPrimarySm}`}
              >
                {actionPending === contribution.id ? "…" : "Report paid"}
              </button>
            )}
            {contribution.canConfirm && (
              <button
                type="button"
                onClick={() => onConfirmPayment(contribution.id)}
                disabled={actionPending === contribution.id}
                className={`${contributionActionBtn} ${ui.btnPrimarySm}`}
              >
                {actionPending === contribution.id ? "…" : "Confirm"}
              </button>
            )}
            {contribution.canRecord && (
              <button
                type="button"
                onClick={() => onRecordPayment(contribution.id, expected)}
                disabled={actionPending === contribution.id}
                className={`${contributionActionBtn} ${ui.btnSecondarySm}`}
              >
                {actionPending === contribution.id ? "…" : "Mark paid"}
              </button>
            )}
            {contribution.canDispute && (
              <button
                type="button"
                onClick={() => onRaiseDispute(contribution.id, contribution.displayName ?? "Member")}
                disabled={actionPending === `dispute-${contribution.id}`}
                className={ui.btnGhost}
              >
                Dispute
              </button>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function ContributionsList({
  contributions,
  contributionAmount,
  actionPending,
  onReportPayment,
  onConfirmPayment,
  onRecordPayment,
  onRaiseDispute,
}: {
  contributions: RoundContribution[];
  contributionAmount: string;
  actionPending: string | null;
  onReportPayment: (contributionId: string, expectedAmount: string) => void;
  onConfirmPayment: (contributionId: string) => void;
  onRecordPayment: (contributionId: string, expectedAmount: string) => void;
  onRaiseDispute: (contributionId: string, memberName: string) => void;
}) {
  const reported = contributions.filter((c) => c.status === "reported");
  const pending = contributions.filter((c) => c.status === "pending");
  const confirmed = contributions.filter((c) => c.status === "confirmed");

  const groups = [
    { id: "reported", label: "Awaiting confirmation", items: reported },
    { id: "pending", label: "Not yet paid", items: pending },
    { id: "confirmed", label: "Confirmed", items: confirmed },
  ].filter((group) => group.items.length > 0);

  const rowProps = {
    contributionAmount,
    actionPending,
    onReportPayment,
    onConfirmPayment,
    onRecordPayment,
    onRaiseDispute,
  };

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <section key={group.id}>
          <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
            {group.label} · {group.items.length}
          </h4>
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white">
            {group.items.map((contribution) => (
              <ContributionRow
                key={contribution.id}
                contribution={contribution}
                muted={group.id === "confirmed"}
                {...rowProps}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function LedgerRow({ entry }: { entry: LedgerEntry }) {
  const amountLabel =
    entry.isPartial && entry.expectedAmount
      ? `₱${Number(entry.amount).toLocaleString()} / ₱${Number(entry.expectedAmount).toLocaleString()}`
      : `₱${Number(entry.amount).toLocaleString()}`;
  const source = ledgerSourceLabel(entry.source);

  return (
    <li
      className={`flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${
        entry.status === "confirmed" ? "opacity-75" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <span className={ui.avatarInitialsSm} aria-hidden>
          {displayInitials(entry.displayName)}
        </span>
        <div className="min-w-0">
          <p className="truncate font-medium text-slate-900">{entry.displayName}</p>
          {(source || entry.isPlaceholder) && (
            <p className="truncate text-xs text-slate-500">
              {[source, entry.isPlaceholder && "Placeholder"].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
        <p className="text-sm font-medium tabular-nums text-slate-900">{amountLabel}</p>
        <span className={paymentStatusBadge(entry.status)}>{contributionStatusLabel(entry.status)}</span>
      </div>
    </li>
  );
}

function groupLedgerByRound(entries: LedgerEntry[]) {
  const groups = new Map<number, LedgerEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.roundNumber) ?? [];
    list.push(entry);
    groups.set(entry.roundNumber, list);
  }
  return [...groups.entries()].sort(([a], [b]) => b - a);
}

function LedgerList({ entries }: { entries: LedgerEntry[] }) {
  const rounds = groupLedgerByRound(entries);

  return (
    <div className="space-y-5">
      {rounds.map(([roundNumber, roundEntries]) => {
        const first = roundEntries[0];
        const confirmed = roundEntries.filter((e) => e.status === "confirmed").length;
        const roundStatus = first.roundStatus as RoundSummary["status"];

        return (
          <section key={roundNumber}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Round {roundNumber} · Due {first.roundDueDate} · {confirmed}/{roundEntries.length}{" "}
                confirmed
              </h4>
              <span className={scheduleStatusBadge(roundStatus)}>{scheduleStatusLabel(roundStatus)}</span>
            </div>
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-100 bg-white">
              {roundEntries.map((entry) => (
                <LedgerRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

export interface GroupCycleTabsProps {
  cycleTab: CycleTab;
  group: {
    contributionAmount: string;
    role: "manager" | "member";
  };
  currentRound: RoundSummary | null;
  schedule: RoundSummary[];
  isManager: boolean;
  isActive: boolean;
  isCompleted: boolean;
  sortedMembers: GroupMember[];
  reliabilityByMember: Map<string, MemberReliability>;
  dashboard?: {
    pendingConfirmations: number;
    openDisputes: number;
    totalOutstanding: string;
    memberCount: number;
    currentRound: {
      number: number;
      confirmedContributions: number;
      dueDate: string;
      isOverdue: boolean;
    } | null;
  };
  completionSummary?: {
    roundsCompleted: number;
    totalCollected: string;
    confirmedContributions: number;
    totalContributions: number;
    outstandingDebt: string;
    unsettledObligations: number;
    resolvedDisputes: number;
    openDisputes: number;
  };
  obligations: ObligationEntry[];
  disputes: DisputeEntry[];
  ledgerEntries: LedgerEntry[];
  auditEntries: AuditLogEntry[];
  actionPending: string | null;
  onReportPayment: (contributionId: string, expectedAmount: string) => void;
  onConfirmPayment: (contributionId: string) => void;
  onRecordPayment: (contributionId: string, expectedAmount: string) => void;
  onRaiseDispute: (contributionId: string, memberName: string) => void;
  onSettleMemberDebts: (memberId: string, memberName: string) => void;
  onResolveDispute: (disputeId: string) => void;
  claimUrls?: Record<string, string>;
  onClaimInvite?: (membershipId: string) => void;
  claimPending?: boolean;
  unclaimedSeats?: number;
}

export function GroupCycleTabPanels(props: GroupCycleTabsProps) {
  const {
    cycleTab,
    group,
    currentRound,
    schedule,
    isManager,
    isActive,
    isCompleted,
    sortedMembers,
    reliabilityByMember,
    dashboard,
    completionSummary,
    obligations,
    disputes,
    ledgerEntries,
    auditEntries,
    actionPending,
    onReportPayment,
    onConfirmPayment,
    onRecordPayment,
    onRaiseDispute,
    onSettleMemberDebts,
    onResolveDispute,
    claimUrls = {},
    onClaimInvite,
    claimPending = false,
    unclaimedSeats = 0,
  } = props;

  if (cycleTab === "overview") {
    const contributions = currentRound?.contributions ?? [];
    const confirmedCount = contributions.filter((c) => c.status === "confirmed").length;
    const totalCount = contributions.length;
    const progressPercent =
      totalCount > 0 ? Math.min(100, Math.round((confirmedCount / totalCount) * 100)) : 0;
    const potAmount = Number(group.contributionAmount) * totalCount;
    const nextRound = getNextPayoutRound(schedule, currentRound);
    const nextPotAmount = nextRound ? Number(group.contributionAmount) * totalCount : 0;
    const finalRound = isFinalRound(schedule, currentRound);

    return (
      <div className="space-y-6">
        {isCompleted && completionSummary && (
          <div className="rounded-xl border border-gray-100 bg-slate-50 p-5">
            <h2 className="text-base font-medium text-slate-900">Cycle complete</h2>
            <p className="mt-1 text-sm text-slate-600">
              {completionSummary.roundsCompleted} rounds · ₱
              {Number(completionSummary.totalCollected).toLocaleString()} collected
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <StatCard
                label="Confirmed payments"
                value={`${completionSummary.confirmedContributions} of ${completionSummary.totalContributions}`}
                tone="success"
                icon="check"
              />
              <StatCard
                label="Outstanding debt"
                value={`₱${Number(completionSummary.outstandingDebt).toLocaleString()}`}
                tone={Number(completionSummary.outstandingDebt) > 0 ? "danger" : "neutral"}
                icon="wallet"
              />
              <StatCard
                label="Disputes"
                value={`${completionSummary.resolvedDisputes} resolved`}
                hint={
                  completionSummary.openDisputes > 0
                    ? `${completionSummary.openDisputes} still open`
                    : "All resolved"
                }
                tone={completionSummary.openDisputes > 0 ? "warning" : "neutral"}
                icon="alert"
              />
            </div>
          </div>
        )}

        {currentRound ? (
          <>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">
                Round {currentRound.number}
              </p>
              <h2 className="mt-1 text-2xl font-medium text-slate-900">
                {currentRound.recipientName}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Receives ₱{potAmount.toLocaleString()} · Due {currentRound.dueDate}
              </p>
              {dashboard?.currentRound?.isOverdue && (
                <span className={`${ui.badgeForming} mt-3 inline-block`}>Overdue</span>
              )}
              {totalCount > 0 && (
                <div className="mt-5">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-slate-600">
                    <span>
                      {confirmedCount} of {totalCount} confirmed
                    </span>
                    <span>{progressPercent}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/80">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {isActive && nextRound && (
              <div className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-600">
                  {nextRound.number}
                </span>
                <span className={ui.avatarInitialsSm} aria-hidden>
                  {displayInitials(nextRound.recipientName ?? "?")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-slate-500">Next payout</p>
                  <p className="font-medium text-slate-900">{nextRound.recipientName ?? "—"}</p>
                </div>
                <div className="shrink-0 text-right text-sm text-slate-600">
                  <p>₱{nextPotAmount.toLocaleString()}</p>
                  <p className="text-xs text-slate-500">Due {nextRound.dueDate}</p>
                </div>
              </div>
            )}

            {isActive && currentRound && finalRound && (
              <div className="rounded-xl border border-gray-100 bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-500">Next payout</p>
                <p className="font-medium text-slate-900">Final round</p>
                <p className="mt-0.5 text-sm text-slate-600">
                  This is the last payout in the cycle. The paluwagan completes once this round closes.
                </p>
              </div>
            )}

            {isManager && isActive && dashboard && (
              <div className="grid gap-3 sm:grid-cols-2">
                <StatCard
                  label="Pending confirmations"
                  value={String(dashboard.pendingConfirmations)}
                  hint={dashboard.pendingConfirmations > 0 ? "Awaiting your review" : "All caught up"}
                  tone={dashboard.pendingConfirmations > 0 ? "warning" : "success"}
                  icon="clock"
                />
                <StatCard
                  label="Open disputes"
                  value={String(dashboard.openDisputes)}
                  hint={dashboard.openDisputes > 0 ? "Needs resolution" : "None open"}
                  tone={dashboard.openDisputes > 0 ? "danger" : "neutral"}
                  icon="alert"
                />
                <StatCard
                  label="Outstanding debt"
                  value={`₱${Number(dashboard.totalOutstanding).toLocaleString()}`}
                  hint={Number(dashboard.totalOutstanding) > 0 ? "Across all rounds" : "Fully settled"}
                  tone={Number(dashboard.totalOutstanding) > 0 ? "danger" : "success"}
                  icon="wallet"
                />
                <StatCard
                  label="This round"
                  value={`${dashboard.currentRound?.confirmedContributions ?? confirmedCount}/${dashboard.memberCount}`}
                  hint="members confirmed"
                  tone={
                    (dashboard.currentRound?.confirmedContributions ?? confirmedCount) >=
                    dashboard.memberCount
                      ? "success"
                      : "neutral"
                  }
                  icon="users"
                />
              </div>
            )}

            <section>
              <h3 className="mb-3 text-sm font-medium text-slate-900">Contributions</h3>
              {contributions.length > 0 ? (
                <ContributionsList
                  contributions={contributions}
                  contributionAmount={group.contributionAmount}
                  actionPending={actionPending}
                  onReportPayment={onReportPayment}
                  onConfirmPayment={onConfirmPayment}
                  onRecordPayment={onRecordPayment}
                  onRaiseDispute={onRaiseDispute}
                />
              ) : (
                <EmptyTabState
                  title="No contributions yet"
                  description="Members appear here once the round opens."
                />
              )}
            </section>
          </>
        ) : (
          !isCompleted && (
            <EmptyTabState
              title="No active round"
              description="Round details appear here when the cycle is running."
            />
          )
        )}
      </div>
    );
  }

  if (cycleTab === "schedule") {
    return schedule.length > 0 ? (
      <ul className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
        {schedule.map((r) => (
          <li
            key={r.id}
            className={`flex flex-wrap items-center justify-between gap-3 border-b border-gray-50 px-4 py-3 last:border-0 ${
              r.status === "current" ? "bg-emerald-50/40" : ""
            }`}
          >
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-700">
                {r.number}
              </span>
              <div>
                <p className="font-medium text-slate-900">{r.recipientName ?? "—"}</p>
                <p className="text-sm text-slate-500">Due {r.dueDate}</p>
              </div>
            </div>
            <span className={scheduleStatusBadge(r.status)}>{scheduleStatusLabel(r.status)}</span>
          </li>
        ))}
      </ul>
    ) : (
      <EmptyTabState title="No schedule yet" description="The rotation appears after activation." />
    );
  }

  if (cycleTab === "ledger") {
    return ledgerEntries.length > 0 ? (
      <LedgerList entries={ledgerEntries} />
    ) : (
      <EmptyTabState title="No ledger entries" description="Payments are recorded here as rounds progress." />
    );
  }

  if (cycleTab === "issues") {
    const openObligations = obligations.filter((o) => o.status !== "settled");
    const hasObligations = openObligations.length > 0;
    const hasDisputes = disputes.length > 0;

    if (!hasObligations && !hasDisputes) {
      return (
        <EmptyTabState
          title="No open issues"
          description="Shortfalls are recorded automatically when a round closes. Payment disputes appear here."
        />
      );
    }

    return (
      <div className="space-y-8">
        {hasObligations && (
          <section>
            <h2 className="text-base font-medium text-slate-900">Outstanding obligations</h2>
            <p className="mt-1 text-sm text-slate-500">
              Recorded automatically when a round closes. Each shortfall is owed to the organizer;
              interest accrues each round period on unpaid principal until settled.
            </p>
            <div className="mt-3 max-w-full overflow-x-auto rounded-2xl border border-gray-100 bg-white">
              <table className="min-w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50 text-left text-slate-600">
                  <tr>
                    <th className="px-4 py-2 font-medium">Member</th>
                    <th className="px-4 py-2 font-medium">Round</th>
                    <th className="px-4 py-2 font-medium">Remaining</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    {isManager && <th className="px-4 py-2 font-medium">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {openObligations.map((o) => (
                    <tr key={o.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2">{o.displayName}</td>
                      <td className="px-4 py-2">
                        R{o.roundNumber} · {o.roundDueDate}
                      </td>
                      <td className="px-4 py-2">
                        <div className="font-medium">₱{Number(o.remaining).toLocaleString()}</div>
                        {Number(o.accruedInterest) > 0 && (
                          <p className="mt-0.5 text-xs text-slate-500">
                            ₱{Number(o.principalRemaining).toLocaleString()} principal + ₱
                            {Number(o.accruedInterest).toLocaleString()} interest
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-2">{obligationStatusLabel(o.status)}</td>
                      {isManager && (
                        <td className="px-4 py-2">
                          <div className="flex flex-wrap gap-2">
                            {o.status !== "settled" && (
                              <button
                                type="button"
                                onClick={() => onSettleMemberDebts(o.debtorMembershipId, o.displayName)}
                                disabled={actionPending === `settle-${o.debtorMembershipId}`}
                                className={ui.btnPrimarySm}
                              >
                                Settle
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {hasDisputes && (
          <section>
            <h2 className="text-base font-medium text-slate-900">Disputes</h2>
            <ul className="mt-3 space-y-2">
              {disputes.map((d) => (
                <li key={d.id} className={ui.cardFlat}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        Round {d.roundNumber} · {d.memberDisplayName}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        ₱{Number(d.contributionAmount).toLocaleString()} · {disputeStatusLabel(d.status)}
                      </p>
                      {d.note && <p className="mt-2 text-sm text-slate-700">{d.note}</p>}
                      {d.resolution && (
                        <p className="mt-2 text-sm text-emerald-800">Resolved: {d.resolution}</p>
                      )}
                    </div>
                    {isManager && d.status === "open" && (
                      <button
                        type="button"
                        onClick={() => onResolveDispute(d.id)}
                        disabled={actionPending === `resolve-${d.id}`}
                        className={ui.btnPrimarySm}
                      >
                        Resolve
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    );
  }

  if (cycleTab === "members") {
    return (
      <>
        <p className="mb-3 text-sm text-slate-500">
          {sortedMembers.length} member{sortedMembers.length === 1 ? "" : "s"} in payout order
          {unclaimedSeats > 0 &&
            isManager &&
            ` · ${unclaimedSeats} unclaimed placeholder${unclaimedSeats === 1 ? "" : "s"}`}
        </p>
        {isManager && unclaimedSeats > 0 && (
          <p className="mb-3 text-sm text-slate-600">
            Generate a claim link so someone can take over an unclaimed seat during the cycle.
          </p>
        )}
        <ul className="overflow-hidden rounded-2xl border border-gray-100 bg-white">
          {sortedMembers.map((member, index) => (
            <MemberRow
              key={member.id}
              member={member}
              position={member.turnNumber ?? index + 1}
              reliabilitySummary={reliabilityByMember.get(member.id)?.reliabilitySummary}
              showClaimAction={isManager}
              claimUrl={claimUrls[member.id]}
              onClaimInvite={onClaimInvite ? () => onClaimInvite(member.id) : undefined}
              claimPending={claimPending}
            />
          ))}
        </ul>
      </>
    );
  }

  if (cycleTab === "audit") {
    return auditEntries.length > 0 ? (
      <ul className="space-y-2">
        {auditEntries.map((entry) => (
          <li key={entry.id} className={ui.cardFlat}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${auditCategoryClass(entry.category)}`}
                >
                  {entry.categoryLabel}
                </span>
                <span className="font-medium text-slate-900">{entry.title}</span>
              </div>
              <time className="shrink-0 text-xs text-slate-500">
                {new Date(entry.createdAt).toLocaleString()}
              </time>
            </div>
            <p className="mt-2 text-sm text-slate-700">{entry.summary}</p>
          </li>
        ))}
      </ul>
    ) : (
      <EmptyTabState title="No audit entries" description="Manager actions are logged here." />
    );
  }

  return null;
}
