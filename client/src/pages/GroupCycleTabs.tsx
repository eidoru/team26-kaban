import { type ReactNode, useState } from "react";
import type {
  AuditLogEntry,
  CompletionSummary,
  DisputeEntry,
  GroupMember,
  LedgerEntry,
  ObligationEntry,
  RoundContribution,
  RoundSummary,
  SettlementClaimEntry,
} from "../api/client";
import { Check, ChevronDown, CircleCheck, Clock, FastForward, Inbox, TriangleAlert, Wrench } from "lucide-react";
import { formatFrequency } from "../lib/frequency";
import { formatDayHeading, formatDueDate, formatLocalDate, parseDateOnly } from "../lib/dates";
import { Avatar } from "../components/Avatar";
import { statusBadgeClass, ui } from "../lib/ui";
import { CopyableLink } from "../components/CopyableLink";
import { StatCard } from "../components/StatCard";
import { Celebration } from "../components/Celebration";
import { CycleNetChart } from "../components/CycleNetChart";

export type CycleTab = "overview" | "schedule" | "ledger" | "issues" | "audit";

function CompletionSummaryPanel({ summary }: { summary: CompletionSummary }) {
  const amount = Number(summary.contributionAmount);
  const collected = Number(summary.totalCollected);
  const expected = Number(summary.totalExpected);
  const outstanding = Number(summary.outstandingDebt);
  const potPerRound = Number(summary.potPerRound);
  const startLabel = summary.startDate ? formatDueDate(summary.startDate) : null;
  const endLabel = summary.completedAt ? formatLocalDate(summary.completedAt) : null;
  const freq = formatFrequency(summary.frequency, summary.frequencyDays);

  return (
    <div className="space-y-6">
      <Celebration title={`${summary.groupName} is complete!`} burst={false}>
        <p>
          {summary.memberCount} members · {freq} · ₱{amount.toLocaleString()} per member per round
        </p>
        {(startLabel || endLabel) && (
          <p className="mt-0.5 text-ink-600">
            {startLabel && `Started ${startLabel}`}
            {startLabel && endLabel && " · "}
            {endLabel && `Finished ${endLabel}`}
            {summary.cycleDurationDays != null &&
              ` · ${summary.cycleDurationDays} day${summary.cycleDurationDays === 1 ? "" : "s"}`}
          </p>
        )}
      </Celebration>

      <div className={ui.metricGrid}>
        <StatCard
          label="Total collected"
          value={`₱${collected.toLocaleString()}`}
          hint={
            expected > 0
              ? `${summary.collectionRate}% of ₱${expected.toLocaleString()} expected`
              : undefined
          }
          tone="success"
          icon="wallet"
        />
        <StatCard
          label="Collection rate"
          value={`${summary.collectionRate}%`}
          hint={`${summary.confirmedContributions} of ${summary.totalContributions} contributions confirmed`}
          tone={summary.collectionRate >= 100 ? "success" : "warning"}
          icon="check"
        />
        <StatCard
          label="Outstanding debt"
          value={`₱${outstanding.toLocaleString()}`}
          hint={
            summary.unsettledObligations > 0
              ? `${summary.unsettledObligations} unsettled obligation${summary.unsettledObligations === 1 ? "" : "s"}`
              : outstanding > 0
                ? "Includes accrued interest where applicable"
                : "All shortfalls settled"
          }
          tone={outstanding > 0 ? "danger" : "neutral"}
          icon="wallet"
        />
        <StatCard
          label="Disputes"
          value={`${summary.resolvedDisputes} resolved`}
          hint={
            summary.openDisputes > 0
              ? `${summary.openDisputes} still open`
              : summary.resolvedDisputes > 0
                ? "All disputes closed"
                : "None raised"
          }
          tone={summary.openDisputes > 0 ? "warning" : "neutral"}
          icon="alert"
        />
      </div>

      <div>
        <section className={ui.sectionCard}>
          <h3 className={ui.sectionHeader}>Payout order</h3>
          <p className={ui.sectionSubtitle}>
            {summary.roundsCompleted} rounds · ₱{potPerRound.toLocaleString()} pot each
          </p>
          <ol className="mt-3 space-y-2">
            {summary.payoutRecipients.map((round) => (
              <li
                key={round.roundNumber}
                className="flex items-center gap-3 rounded-2xl border border-ink-200 bg-white px-3 py-2.5"
              >
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 px-2 text-xs font-bold tabular-nums text-ink-700">
                  {round.roundNumber}
                </span>
                <Avatar name={round.recipientName} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-ink-900">{round.recipientName}</p>
                  <p className="text-xs text-ink-500">Due {formatDueDate(round.dueDate)}</p>
                </div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-ink-800">
                  ₱{Number(round.potAmount).toLocaleString()}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {outstanding > 0 && (
        <p className="rounded-2xl border border-danger-200 bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-800">
          ₱{outstanding.toLocaleString()} remains owed to the organizer. Check the Issues tab for unsettled
          obligations and settlement options.
        </p>
      )}
    </div>
  );
}

function EmptyTabState({ title, description }: { title: string; description: string }) {
  return (
    <div className={`${ui.emptyState} flex flex-col items-center py-8`}>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-ink-500" aria-hidden>
        <Inbox className="h-6 w-6" />
      </span>
      <p className="font-heading mt-3 text-lg font-bold text-ink-900">{title}</p>
      <p className={`mt-1 text-sm ${ui.muted}`}>{description}</p>
    </div>
  );
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

const issueActionBtn = "inline-flex min-w-[7.5rem] items-center justify-center";

function ClaimCard({
  claim,
  isManager,
  actionPending,
  onReviewSettlementClaim,
}: {
  claim: SettlementClaimEntry;
  isManager: boolean;
  actionPending: string | null;
  onReviewSettlementClaim: (claimId: string, decision: "confirm" | "reject") => void;
}) {
  const pending = actionPending === `review-claim-${claim.id}`;
  return (
    <li className="flex flex-col gap-3 rounded-3xl border-2 border-sun-200 bg-sun-50 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={claim.memberDisplayName} placeholder={claim.isPlaceholder} />
        <div className="min-w-0">
          <p className="text-sm text-ink-700">
            <span className="font-bold text-ink-900">{claim.memberDisplayName}</span> reported paying{" "}
            <span className="font-bold tabular-nums text-ink-900">₱{Number(claim.amount).toLocaleString()}</span> toward
            their debt
          </p>
          {claim.note && <p className="mt-1 text-sm italic text-ink-600">&ldquo;{claim.note}&rdquo;</p>}
        </div>
      </div>
      {isManager ? (
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onReviewSettlementClaim(claim.id, "confirm")}
            disabled={pending}
            className={ui.btnPrimarySm}
          >
            {pending ? "…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => onReviewSettlementClaim(claim.id, "reject")}
            disabled={pending}
            className={ui.btnSecondarySm}
          >
            {pending ? "…" : "Reject"}
          </button>
        </div>
      ) : (
        <span className={`${ui.badgeTurn} shrink-0 self-start sm:self-auto`}>Waiting for organizer</span>
      )}
    </li>
  );
}

function DisputeCard({
  dispute,
  isManager,
  actionPending,
  onResolveDispute,
}: {
  dispute: DisputeEntry;
  isManager: boolean;
  actionPending: string | null;
  onResolveDispute: (disputeId: string) => void;
}) {
  const selfRaised = dispute.raisedByName === dispute.memberDisplayName;
  return (
    <li className="flex flex-col gap-3 rounded-3xl border-2 border-danger-200 bg-danger-50 p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Avatar name={dispute.memberDisplayName} />
        <div className="min-w-0">
          <p className="text-sm text-ink-700">
            <span className="font-bold text-ink-900">{dispute.raisedByName}</span> disputed{" "}
            {selfRaised ? (
              "their"
            ) : (
              <>
                <span className="font-bold text-ink-900">{dispute.memberDisplayName}</span>&apos;s
              </>
            )}{" "}
            Round {dispute.roundNumber} payment ·{" "}
            <span className="font-bold tabular-nums text-ink-900">
              ₱{Number(dispute.contributionAmount).toLocaleString()}
            </span>
          </p>
          {dispute.note && <p className="mt-1 text-sm italic text-ink-600">&ldquo;{dispute.note}&rdquo;</p>}
        </div>
      </div>
      {isManager && (
        <button
          type="button"
          onClick={() => onResolveDispute(dispute.id)}
          disabled={actionPending === `resolve-${dispute.id}`}
          className={`${ui.btnPrimarySm} shrink-0 self-start sm:self-auto`}
        >
          {actionPending === `resolve-${dispute.id}` ? "…" : "Resolve"}
        </button>
      )}
    </li>
  );
}

function DebtorCard({
  obligations,
  isManager,
  isOwnDebt,
  actionPending,
  onSettleMemberDebts,
  onCoverObligationExternally,
  onSubmitSettlementClaim,
}: {
  obligations: ObligationEntry[];
  isManager: boolean;
  isOwnDebt: boolean;
  actionPending: string | null;
  onSettleMemberDebts: (memberId: string, memberName: string) => void;
  onCoverObligationExternally: (obligationId: string, memberName: string) => void;
  onSubmitSettlementClaim: () => void;
}) {
  const first = obligations[0];
  const memberId = first.debtorMembershipId;
  const total = obligations.reduce((sum, o) => sum + Number(o.remaining), 0);
  const claimPending = obligations.some((o) => o.hasPendingClaim);

  return (
    <li className="rounded-3xl border border-ink-200 bg-white p-5 shadow-card">
      <div className="flex items-start gap-3">
        <Avatar name={first.displayName} size="md" placeholder={first.isPlaceholder} />
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-lg font-bold text-ink-900">
            {first.displayName}
            {isOwnDebt && <span className="font-sans text-sm font-semibold text-ink-500"> (you)</span>}
          </p>
          <p className="text-xs text-ink-500">
            {obligations.length} unsettled round{obligations.length === 1 ? "" : "s"}
          </p>
        </div>
        <p className="font-heading shrink-0 text-xl font-bold tabular-nums text-danger-700">
          ₱{total.toLocaleString()}
        </p>
      </div>

      <ul className="mt-4 space-y-2">
        {obligations.map((o) => {
          const hasInterest = Number(o.accruedInterest) > 0;
          return (
            <li key={o.id} className="rounded-2xl bg-ink-50 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <p className="text-sm font-bold text-ink-900">
                  Round {o.roundNumber}
                  <span className="font-semibold text-ink-500"> · {formatDueDate(o.roundDueDate)}</span>
                  {o.status === "partially_settled" && (
                    <span className="ml-2 rounded-full bg-sun-100 px-2 py-0.5 text-[11px] font-bold text-sun-800">
                      Partly paid
                    </span>
                  )}
                </p>
                <p className="text-sm font-bold tabular-nums text-ink-900">₱{Number(o.remaining).toLocaleString()}</p>
              </div>
              {hasInterest && (
                <p className="mt-0.5 text-xs text-ink-500">
                  ₱{Number(o.principalRemaining).toLocaleString()} + ₱{Number(o.accruedInterest).toLocaleString()}{" "}
                  interest
                </p>
              )}
              {o.externalCoverageNote && <p className="mt-1 text-xs text-warn-800">{o.externalCoverageNote}</p>}
              {isManager && (
                <button
                  type="button"
                  onClick={() => onCoverObligationExternally(o.id, o.displayName)}
                  disabled={actionPending === `cover-${o.id}`}
                  className="mt-1.5 text-xs font-bold text-ink-600 underline-offset-2 hover:text-ink-900 hover:underline disabled:opacity-50"
                >
                  {actionPending === `cover-${o.id}` ? "…" : "Cover externally"}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {(isManager || isOwnDebt) && (
        <div className="mt-4 flex justify-end">
          {isManager ? (
            <button
              type="button"
              onClick={() => onSettleMemberDebts(memberId, first.displayName)}
              disabled={actionPending === `settle-${memberId}`}
              className={`${issueActionBtn} ${ui.btnPrimarySm}`}
            >
              {actionPending === `settle-${memberId}` ? "…" : "Record settlement"}
            </button>
          ) : claimPending ? (
            <span className={ui.badgeTurn}>Payment pending review</span>
          ) : (
            <button
              type="button"
              onClick={() => onSubmitSettlementClaim()}
              disabled={actionPending === "submit-settlement-claim"}
              className={`${issueActionBtn} ${ui.btnPrimarySm}`}
            >
              {actionPending === "submit-settlement-claim" ? "…" : "Pay"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function HistoryRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-sm text-ink-600">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </li>
  );
}

function IssuesPanel({
  obligations,
  settlementClaims,
  disputes,
  isManager,
  actionPending,
  viewerMembershipId,
  onSettleMemberDebts,
  onCoverObligationExternally,
  onResolveDispute,
  onSubmitSettlementClaim,
  onReviewSettlementClaim,
}: {
  obligations: ObligationEntry[];
  settlementClaims: SettlementClaimEntry[];
  disputes: DisputeEntry[];
  isManager: boolean;
  actionPending: string | null;
  viewerMembershipId?: string;
  onSettleMemberDebts: (memberId: string, memberName: string) => void;
  onCoverObligationExternally: (obligationId: string, memberName: string) => void;
  onResolveDispute: (disputeId: string) => void;
  onSubmitSettlementClaim: () => void;
  onReviewSettlementClaim: (claimId: string, decision: "confirm" | "reject") => void;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  const openObligations = obligations.filter((o) => o.status !== "settled");
  const openDisputes = disputes.filter((d) => d.status === "open");
  const resolvedDisputes = disputes.filter((d) => d.status === "resolved");
  const pendingClaims = settlementClaims.filter((c) => c.status === "pending");
  const reviewedClaims = settlementClaims.filter((c) => c.status !== "pending");
  const totalOutstanding = openObligations.reduce((sum, o) => sum + Number(o.remaining), 0);
  const historyCount = reviewedClaims.length + resolvedDisputes.length;

  const byDebtor = new Map<string, ObligationEntry[]>();
  for (const o of openObligations) {
    byDebtor.set(o.debtorMembershipId, [...(byDebtor.get(o.debtorMembershipId) ?? []), o]);
  }
  const owedBy = (group: ObligationEntry[]) => group.reduce((sum, o) => sum + Number(o.remaining), 0);
  const debtors = [...byDebtor.values()].sort((a, b) => owedBy(b) - owedBy(a));

  if (openObligations.length === 0 && disputes.length === 0 && settlementClaims.length === 0) {
    return (
      <EmptyTabState
        title="No open issues"
        description="Shortfalls are recorded automatically when a round closes. Payment disputes appear here."
      />
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Outstanding"
          value={`₱${totalOutstanding.toLocaleString()}`}
          hint={`${debtors.length} member${debtors.length === 1 ? "" : "s"} owe`}
          tone={totalOutstanding > 0 ? "danger" : "neutral"}
          icon="wallet"
        />
        <StatCard
          label="To review"
          value={String(pendingClaims.length)}
          hint="reported payments"
          tone={pendingClaims.length > 0 ? "warning" : "neutral"}
          icon="clock"
        />
        <StatCard
          label="Open disputes"
          value={String(openDisputes.length)}
          hint={openDisputes.length > 0 ? "need resolving" : "none open"}
          tone={openDisputes.length > 0 ? "danger" : "neutral"}
          icon="alert"
        />
      </div>

      {(pendingClaims.length > 0 || openDisputes.length > 0) && (
        <section>
          <h2 className={`mb-3 ${ui.sectionHeader}`}>{isManager ? "Needs your attention" : "In progress"}</h2>
          <ul className="space-y-3">
            {pendingClaims.map((claim) => (
              <ClaimCard
                key={claim.id}
                claim={claim}
                isManager={isManager}
                actionPending={actionPending}
                onReviewSettlementClaim={onReviewSettlementClaim}
              />
            ))}
            {openDisputes.map((dispute) => (
              <DisputeCard
                key={dispute.id}
                dispute={dispute}
                isManager={isManager}
                actionPending={actionPending}
                onResolveDispute={onResolveDispute}
              />
            ))}
          </ul>
        </section>
      )}

      {debtors.length > 0 && (
        <section>
          <h2 className={ui.sectionHeader}>Who owes</h2>
          <p className={`mb-3 ${ui.sectionSubtitle}`}>
            Recorded when a round closes. Balances are owed to the organizer; interest may accrue each period until
            settled.
          </p>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {debtors.map((group) => (
              <DebtorCard
                key={group[0].debtorMembershipId}
                obligations={group}
                isManager={isManager}
                isOwnDebt={!isManager && group[0].debtorMembershipId === viewerMembershipId}
                actionPending={actionPending}
                onSettleMemberDebts={onSettleMemberDebts}
                onCoverObligationExternally={onCoverObligationExternally}
                onSubmitSettlementClaim={onSubmitSettlementClaim}
              />
            ))}
          </ul>
        </section>
      )}

      {historyCount > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            aria-controls="issues-history"
            className="flex items-center gap-2 text-sm font-bold text-ink-600 hover:text-ink-900"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${historyOpen ? "rotate-180" : ""}`} aria-hidden />
            History ({historyCount})
          </button>
          {historyOpen && (
            <ul
              id="issues-history"
              className="animate-rise mt-3 divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white"
            >
              {reviewedClaims.map((claim) => (
                <HistoryRow
                  key={claim.id}
                  icon={
                    claim.status === "confirmed" ? (
                      <CircleCheck className="h-4 w-4 text-brand-600" aria-hidden />
                    ) : (
                      <TriangleAlert className="h-4 w-4 text-danger-600" aria-hidden />
                    )
                  }
                >
                  <p>
                    <span className="font-bold text-ink-800">{claim.memberDisplayName}</span>&apos;s ₱
                    {Number(claim.amount).toLocaleString()} payment ·{" "}
                    {claim.status === "confirmed" ? "confirmed" : "rejected"}
                  </p>
                  {claim.reviewNote && <p className="mt-0.5 text-xs text-ink-500">{claim.reviewNote}</p>}
                </HistoryRow>
              ))}
              {resolvedDisputes.map((dispute) => (
                <HistoryRow key={dispute.id} icon={<CircleCheck className="h-4 w-4 text-brand-600" aria-hidden />}>
                  <p>
                    Dispute on <span className="font-bold text-ink-800">{dispute.memberDisplayName}</span>&apos;s
                    Round {dispute.roundNumber} payment · resolved
                  </p>
                  {dispute.resolution && <p className="mt-0.5 text-xs text-ink-500">{dispute.resolution}</p>}
                </HistoryRow>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

function auditCategoryClass(category: string) {
  switch (category) {
    case "group":
      return "bg-teal-100 text-teal-800";
    case "membership":
      return "bg-sky-100 text-sky-800";
    case "contribution":
      return "bg-lime-100 text-lime-800";
    case "round":
      return "bg-violet-100 text-violet-800";
    case "invite":
      return "bg-indigo-100 text-indigo-800";
    case "obligation":
      return "bg-rose-100 text-rose-800";
    case "dispute":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-ink-100 text-ink-700";
  }
}

// Fixed order for filter chips; unknown categories from the server are appended.
const AUDIT_CATEGORIES: { id: string; label: string }[] = [
  { id: "group", label: "Group" },
  { id: "membership", label: "Members" },
  { id: "contribution", label: "Payments" },
  { id: "round", label: "Rounds" },
  { id: "invite", label: "Invites" },
  { id: "obligation", label: "Debts" },
  { id: "dispute", label: "Disputes" },
];

function auditCategoryLabel(entry: AuditLogEntry) {
  return AUDIT_CATEGORIES.find((c) => c.id === entry.category)?.label ?? entry.categoryLabel;
}

function AuditEntryRow({ entry }: { entry: AuditLogEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetails = entry.details.length > 0;
  const time = new Date(entry.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const panelId = `audit-${entry.id}`;

  const body = (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex min-w-[6.75rem] shrink-0 items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-bold ${auditCategoryClass(entry.category)}`}
        >
          {auditCategoryLabel(entry)}
        </span>
        <span className="min-w-0 flex-1 font-bold text-ink-900">{entry.title}</span>
        {hasDetails && (
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          />
        )}
      </div>
      <p className="mt-1.5 text-sm text-ink-700">{entry.summary}</p>
      <p className="mt-1 text-xs text-ink-500">
        <time dateTime={entry.createdAt}>{time}</time> · {entry.actorName}
      </p>
    </>
  );

  return (
    <li>
      {hasDetails ? (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={panelId}
          className="w-full px-4 py-3 text-left transition-colors hover:bg-ink-50"
        >
          {body}
        </button>
      ) : (
        <div className="px-4 py-3">{body}</div>
      )}
      {open && (
        <ul id={panelId} className="animate-rise mx-4 mb-3 space-y-1 rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
          {entry.details.map((detail, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-ink-400">
                •
              </span>
              {detail}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AuditLogPanel({
  entries,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  entries: AuditLogEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  const counts = new Map<string, number>();
  for (const e of entries) counts.set(e.category, (counts.get(e.category) ?? 0) + 1);
  const extra = [...counts.keys()]
    .filter((id) => !AUDIT_CATEGORIES.some((c) => c.id === id))
    .map((id) => ({ id, label: entries.find((e) => e.category === id)?.categoryLabel ?? id }));
  const chips = [...AUDIT_CATEGORIES.filter((c) => counts.has(c.id)), ...extra];

  const visible = selected.length === 0 ? entries : entries.filter((e) => selected.includes(e.category));
  const days: { key: string; label: string; items: AuditLogEntry[] }[] = [];
  for (const entry of visible) {
    const date = new Date(entry.createdAt);
    const key = date.toDateString();
    const last = days.at(-1);
    if (last && last.key === key) last.items.push(entry);
    else days.push({ key, label: formatDayHeading(date), items: [entry] });
  }

  function toggle(id: string) {
    setSelected((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : [...cur, id]));
  }

  if (entries.length === 0) {
    return <EmptyTabState title="No audit entries" description="Manager actions are logged here." />;
  }

  const chipBase = "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-colors";

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Filter by category" className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setSelected([])}
          aria-pressed={selected.length === 0}
          className={`${chipBase} ${
            selected.length === 0 ? "bg-ink-900 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
          }`}
        >
          All <span className="tabular-nums opacity-70">{entries.length}</span>
        </button>
        {chips.map((chip) => {
          const on = selected.includes(chip.id);
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => toggle(chip.id)}
              aria-pressed={on}
              className={`${chipBase} ${
                on
                  ? `${auditCategoryClass(chip.id)} ring-2 ring-current ring-inset`
                  : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {chip.label} <span className="tabular-nums opacity-70">{counts.get(chip.id)}</span>
            </button>
          );
        })}
      </div>

      {hasMore && (
        <p className="text-xs text-ink-500">
          Showing the latest {entries.length} entries. Load older entries to include more in these counts.
        </p>
      )}

      {days.length === 0 ? (
        <p className={`${ui.emptyState} text-sm text-ink-500`}>No entries of this type in the loaded history.</p>
      ) : (
        days.map((day) => (
          <section key={day.key}>
            <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{day.label}</h3>
            <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
              {day.items.map((entry) => (
                <AuditEntryRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </section>
        ))
      )}

      {hasMore && onLoadMore && (
        <div className="flex justify-center">
          <button type="button" onClick={onLoadMore} disabled={loadingMore} className={ui.btnSecondary}>
            {loadingMore ? "Loading…" : "Load older entries"}
          </button>
        </div>
      )}
    </div>
  );
}

function TimelineDot({ status }: { status: RoundSummary["status"] | undefined }) {
  if (status === "closed") {
    return (
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white">
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (status === "current") {
    return <span className="h-6 w-6 rounded-full border-[6px] border-brand-200 bg-brand-600" />;
  }
  return <span className="h-4 w-4 rounded-full border-2 border-ink-300 bg-white" />;
}

function ScheduleTimeline({
  members,
  schedule,
  isManager,
  viewerMembershipId,
  claimUrls,
  onClaimInvite,
  claimPending,
}: {
  members: GroupMember[];
  schedule: RoundSummary[];
  isManager: boolean;
  viewerMembershipId?: string;
  claimUrls: Record<string, string>;
  onClaimInvite?: (membershipId: string) => void;
  claimPending: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const roundByMember = new Map(schedule.map((r) => [r.recipientMembershipId, r]));

  return (
    <ol className="rounded-3xl border border-ink-200 bg-white px-3 py-2 sm:px-4">
      {members.map((member, index) => {
        const round = roundByMember.get(member.id);
        const status = round?.status;
        const due = round ? parseDateOnly(round.dueDate) : null;
        const expanded = expandedId === member.id;
        const panelId = `schedule-row-${member.id}`;
        const isFirst = index === 0;
        const isLast = index === members.length - 1;
        const isYou = member.id === viewerMembershipId;
        const canClaim = isManager && member.isPlaceholder && onClaimInvite;

        return (
          <li key={member.id} className="grid grid-cols-[3rem_1.5rem_minmax(0,1fr)] gap-x-3">
            <div className="py-3 text-center">
              {due ? (
                <>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
                    {due.toLocaleDateString(undefined, { month: "short" })}
                  </p>
                  <p className="font-heading text-lg font-bold leading-tight tabular-nums text-ink-900">
                    {due.getDate()}
                  </p>
                </>
              ) : (
                <p className="pt-1 text-xs font-bold text-ink-500">#{round?.number ?? member.turnNumber ?? index + 1}</p>
              )}
            </div>

            <div className="relative flex justify-center" aria-hidden>
              {!isFirst && (
                <span
                  className={`absolute left-1/2 top-0 h-1/2 w-0.5 -translate-x-1/2 ${
                    status === "closed" || status === "current" ? "bg-brand-300" : "bg-ink-200"
                  }`}
                />
              )}
              {!isLast && (
                <span
                  className={`absolute bottom-0 left-1/2 h-1/2 w-0.5 -translate-x-1/2 ${
                    status === "closed" ? "bg-brand-300" : "bg-ink-200"
                  }`}
                />
              )}
              <span className="relative z-10 flex h-full items-center">
                <TimelineDot status={status} />
              </span>
            </div>

            <div className="min-w-0 py-1.5">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : member.id)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className={`flex w-full items-center gap-3 rounded-2xl px-2 py-1.5 text-left transition-colors hover:bg-ink-50 ${
                  status === "current" ? "bg-brand-50 hover:bg-brand-50" : ""
                }`}
              >
                <Avatar
                  name={member.displayName}
                  placeholder={member.isPlaceholder}
                  className={status === "closed" ? "opacity-70" : ""}
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={`block truncate ${
                      status === "closed" ? "font-semibold text-ink-600" : "font-bold text-ink-900"
                    }`}
                  >
                    {member.displayName}
                    {isYou && <span className="font-semibold text-ink-500"> (you)</span>}
                  </span>
                  {(member.isManager || (isManager && member.isPlaceholder)) && (
                    <span className="block truncate text-xs font-semibold text-ink-500">
                      {[member.isManager && "Organizer", isManager && member.isPlaceholder && "Unclaimed"]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  )}
                </span>
                {status === "current" && <span className={`${ui.badgeActive} shrink-0`}>Now</span>}
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${expanded ? "rotate-180" : ""}`}
                  aria-hidden
                />
              </button>

              {expanded && (
                <div id={panelId} className="animate-rise mx-2 mb-2 mt-1 space-y-2 rounded-2xl bg-ink-50 px-4 py-3 text-sm">
                  <p className="text-ink-600">
                    <span className="font-bold text-ink-900">Round {round?.number ?? member.turnNumber ?? index + 1}</span>
                    {due &&
                      ` · Due ${formatDueDate(round?.dueDate)}`}
                    {status === "closed" && " · Paid out"}
                  </p>
                  <p className="text-ink-600">
                    {member.contact ? (
                      <>
                        Contact: <span className="font-bold text-ink-900">{member.contact}</span>
                      </>
                    ) : (
                      "No contact shared"
                    )}
                  </p>
                  {canClaim && (
                    <div className="space-y-2 pt-1">
                      {claimUrls[member.id] ? (
                        <CopyableLink url={claimUrls[member.id]} label="Claim link" compact />
                      ) : (
                        <button
                          type="button"
                          onClick={() => onClaimInvite(member.id)}
                          disabled={claimPending}
                          className={ui.btnSecondarySm}
                        >
                          Create claim link
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ContributionRow({
  contribution,
  contributionAmount,
  actionPending,
  isViewer,
  muted = false,
  onReportPayment,
  onConfirmPayment,
  onRecordPayment,
  onRaiseDispute,
}: {
  contribution: RoundContribution;
  contributionAmount: string;
  actionPending: string | null;
  isViewer: boolean;
  muted?: boolean;
  onReportPayment: (contributionId: string, expectedAmount: string) => void;
  onConfirmPayment: (contributionId: string) => void;
  onRecordPayment: (contributionId: string, expectedAmount: string) => void;
  onRaiseDispute: (contributionId: string, memberName: string) => void;
}) {
  const expected = contribution.expectedAmount ?? contributionAmount;
  const name = contribution.displayName ?? "Member";
  const paid = `₱${Number(contribution.amount).toLocaleString()}`;
  const ofExpected = contribution.isPartial ? ` of ₱${Number(expected).toLocaleString()}` : "";
  const pending = actionPending === contribution.id;

  const statusLine =
    contribution.status === "confirmed"
      ? `Paid ${paid}${ofExpected}`
      : contribution.status === "reported"
        ? `Reported ${paid}${ofExpected} · needs confirming`
        : "Not paid yet";

  const icon =
    contribution.status === "confirmed" ? (
      <CircleCheck className="h-5 w-5 text-brand-600" aria-hidden />
    ) : contribution.status === "reported" ? (
      <Clock className="h-5 w-5 text-sun-700" aria-hidden />
    ) : (
      <span className="block h-5 w-5 rounded-full border-2 border-dashed border-ink-300" aria-hidden />
    );

  // One primary action per row, by priority; Dispute stays available as a quiet link.
  const action = contribution.canConfirm ? (
    <button
      type="button"
      onClick={() => onConfirmPayment(contribution.id)}
      disabled={pending}
      className={ui.btnPrimarySm}
    >
      {pending ? "…" : "Confirm"}
    </button>
  ) : contribution.canReport ? (
    <button
      type="button"
      onClick={() => onReportPayment(contribution.id, expected)}
      disabled={pending}
      className={ui.btnPrimarySm}
    >
      {pending ? "…" : contribution.status === "reported" ? "Update payment" : "Report paid"}
    </button>
  ) : contribution.canRecord ? (
    <button
      type="button"
      onClick={() => onRecordPayment(contribution.id, expected)}
      disabled={pending}
      className={ui.btnSecondarySm}
    >
      {pending ? "…" : "Mark paid"}
    </button>
  ) : null;

  return (
    <li
      className={`flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 ${isViewer ? "bg-brand-50/60" : ""} ${
        muted ? "opacity-70" : ""
      }`}
    >
      <span className="flex w-5 shrink-0 justify-center">{icon}</span>
      <Avatar name={name} placeholder={contribution.isPlaceholder} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-ink-900">
          {name}
          {isViewer && <span className="font-semibold text-ink-500"> (you)</span>}
        </p>
        <p className="text-xs text-ink-500">
          <span className="tabular-nums">{statusLine}</span>
          {contribution.canDispute && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => onRaiseDispute(contribution.id, name)}
                disabled={actionPending === `dispute-${contribution.id}`}
                className="font-bold text-ink-600 underline-offset-2 hover:text-danger-700 hover:underline disabled:opacity-50"
              >
                Dispute
              </button>
            </>
          )}
        </p>
      </div>
      {/* Phones: the action drops under the name, indented to the text column (icon + avatar + gaps). */}
      {action && <div className="w-full pl-[4.75rem] sm:w-auto sm:shrink-0 sm:pl-0">{action}</div>}
    </li>
  );
}

function ContributionsList({
  contributions,
  contributionAmount,
  actionPending,
  viewerMembershipId,
  onReportPayment,
  onConfirmPayment,
  onRecordPayment,
  onRaiseDispute,
}: {
  contributions: RoundContribution[];
  contributionAmount: string;
  actionPending: string | null;
  viewerMembershipId?: string;
  onReportPayment: (contributionId: string, expectedAmount: string) => void;
  onConfirmPayment: (contributionId: string) => void;
  onRecordPayment: (contributionId: string, expectedAmount: string) => void;
  onRaiseDispute: (contributionId: string, memberName: string) => void;
}) {
  const [paidOpen, setPaidOpen] = useState(false);

  const isViewer = (c: RoundContribution) => !!viewerMembershipId && c.membershipId === viewerMembershipId;
  // The viewer's own row leads its group.
  const ofStatus = (status: RoundContribution["status"]) =>
    contributions
      .filter((c) => c.status === status)
      .sort((a, b) => Number(isViewer(b)) - Number(isViewer(a)));

  const reported = ofStatus("reported");
  const pending = ofStatus("pending");
  const confirmed = ofStatus("confirmed");
  const allPaid = reported.length === 0 && pending.length === 0;

  const rowProps = {
    contributionAmount,
    actionPending,
    onReportPayment,
    onConfirmPayment,
    onRecordPayment,
    onRaiseDispute,
  };
  const heading = "border-b border-ink-100 bg-ink-50 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-500";
  const rows = (items: RoundContribution[], muted = false) =>
    items.map((c) => <ContributionRow key={c.id} contribution={c} isViewer={isViewer(c)} muted={muted} {...rowProps} />);

  return (
    <div className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
      {reported.length > 0 && (
        <section>
          <h4 className={heading}>Needs confirming · {reported.length}</h4>
          <ul className="divide-y divide-ink-100">{rows(reported)}</ul>
        </section>
      )}
      {pending.length > 0 && (
        <section>
          <h4 className={heading}>Not paid yet · {pending.length}</h4>
          <ul className="divide-y divide-ink-100">{rows(pending)}</ul>
        </section>
      )}
      {confirmed.length > 0 &&
        (allPaid ? (
          <section>
            <h4 className={`${heading} flex items-center gap-1.5 text-brand-700`}>
              <CircleCheck className="h-3.5 w-3.5" aria-hidden />
              Everyone&apos;s paid · {confirmed.length}
            </h4>
            <ul className="divide-y divide-ink-100">{rows(confirmed)}</ul>
          </section>
        ) : (
          <section>
            <button
              type="button"
              onClick={() => setPaidOpen((v) => !v)}
              aria-expanded={paidOpen}
              aria-controls="round-paid-list"
              className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-bold text-ink-700 transition-colors hover:bg-ink-50"
            >
              <CircleCheck className="h-5 w-5 text-brand-600" aria-hidden />
              {confirmed.length} paid
              <span className="ml-auto flex items-center gap-1 text-xs text-ink-500">
                {paidOpen ? "Hide" : "Show"}
                <ChevronDown className={`h-4 w-4 transition-transform ${paidOpen ? "rotate-180" : ""}`} aria-hidden />
              </span>
            </button>
            {paidOpen && (
              <ul id="round-paid-list" className="animate-rise divide-y divide-ink-100 border-t border-ink-100">
                {rows(confirmed, true)}
              </ul>
            )}
          </section>
        ))}
    </div>
  );
}

type LedgerOutcome = "paid" | "partial" | "awaiting" | "unpaid";

function ledgerOutcome(entry: LedgerEntry): LedgerOutcome {
  if (entry.status === "confirmed") return entry.isPartial ? "partial" : "paid";
  if (entry.status === "reported") return "awaiting";
  return "unpaid";
}

// Problems first, so a round's exceptions are the first thing you see when it opens.
const OUTCOME_ORDER: Record<LedgerOutcome, number> = { unpaid: 0, partial: 1, awaiting: 2, paid: 3 };

function LedgerRow({
  entry,
  expected,
  roundClosed,
}: {
  entry: LedgerEntry;
  expected: number;
  roundClosed: boolean;
}) {
  const outcome = ledgerOutcome(entry);
  const amount = Number(entry.amount);
  const short = Math.max(0, expected - amount);
  const source = ledgerSourceLabel(entry.source);

  const icon =
    outcome === "paid" ? (
      <CircleCheck className="h-5 w-5 text-brand-600" aria-hidden />
    ) : outcome === "awaiting" ? (
      <Clock className="h-5 w-5 text-sun-700" aria-hidden />
    ) : (
      <TriangleAlert className={`h-5 w-5 ${outcome === "partial" ? "text-sun-700" : "text-danger-600"}`} aria-hidden />
    );

  const detail =
    outcome === "partial"
      ? `₱${short.toLocaleString()} short`
      : outcome === "awaiting"
        ? "Awaiting confirmation"
        : outcome === "unpaid"
          ? roundClosed
            ? "Missed"
            : "Not yet paid"
          : null;
  // The outcome line takes priority; who recorded it only matters once it's settled.
  const extras = detail || !source ? [] : [source];

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      {icon}
      <Avatar
        name={entry.displayName}
        placeholder={entry.isPlaceholder}
        className={outcome === "paid" ? "opacity-70" : ""}
      />
      <div className="min-w-0 flex-1">
        <p className={`truncate text-sm ${outcome === "paid" ? "font-semibold text-ink-600" : "font-bold text-ink-900"}`}>
          {entry.displayName}
        </p>
        {(detail || extras.length > 0) && (
          <p className="truncate text-xs text-ink-500">
            {detail && (
              <span className={outcome === "unpaid" ? "font-bold text-danger-700" : "font-bold text-ink-700"}>
                {detail}
              </span>
            )}
            {detail && extras.length > 0 && " · "}
            {extras.join(" · ")}
          </p>
        )}
      </div>
      <p className={`shrink-0 text-sm tabular-nums ${outcome === "paid" ? "font-semibold text-ink-600" : "font-bold text-ink-900"}`}>
        ₱{amount.toLocaleString()}
        {outcome === "partial" && <span className="font-semibold text-ink-500"> / ₱{expected.toLocaleString()}</span>}
      </p>
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

function LedgerRoundCard({
  roundNumber,
  entries,
  contributionAmount,
  defaultOpen,
}: {
  roundNumber: number;
  entries: LedgerEntry[];
  contributionAmount: string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const first = entries[0];
  const roundStatus = first.roundStatus as RoundSummary["status"];
  const roundClosed = roundStatus === "closed";
  const due = parseDateOnly(first.roundDueDate);
  const expectedOf = (e: LedgerEntry) => Number(e.expectedAmount ?? contributionAmount);

  const expectedTotal = entries.reduce((sum, e) => sum + expectedOf(e), 0);
  const confirmedTotal = entries
    .filter((e) => e.status === "confirmed")
    .reduce((sum, e) => sum + Number(e.amount), 0);
  const percent = expectedTotal > 0 ? Math.min(100, Math.round((confirmedTotal / expectedTotal) * 100)) : 0;

  const counts = { paid: 0, partial: 0, awaiting: 0, unpaid: 0 } as Record<LedgerOutcome, number>;
  for (const e of entries) counts[ledgerOutcome(e)] += 1;
  const tally: { label: string; tone: string }[] = [
    counts.paid > 0 && { label: `${counts.paid} paid`, tone: "bg-brand-100 text-brand-700" },
    counts.partial > 0 && { label: `${counts.partial} partial`, tone: "bg-sun-100 text-sun-800" },
    counts.awaiting > 0 && { label: `${counts.awaiting} to confirm`, tone: "bg-sun-100 text-sun-800" },
    counts.unpaid > 0 && {
      label: `${counts.unpaid} ${roundClosed ? "missed" : "unpaid"}`,
      tone: "bg-danger-50 text-danger-700",
    },
  ].filter(Boolean) as { label: string; tone: string }[];

  const sorted = [...entries].sort((a, b) => OUTCOME_ORDER[ledgerOutcome(a)] - OUTCOME_ORDER[ledgerOutcome(b)]);
  const panelId = `ledger-round-${roundNumber}`;

  return (
    <section className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="w-full px-5 py-4 text-left transition-colors hover:bg-ink-50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-heading text-lg font-bold text-ink-900">
              Round {roundNumber}
              {due && (
                <span className="font-sans text-sm font-semibold text-ink-500">
                  {" "}
                  · {formatDueDate(first.roundDueDate)}
                </span>
              )}
            </p>
            <p className="mt-0.5 text-sm text-ink-600">
              <span className="font-bold tabular-nums text-ink-900">₱{confirmedTotal.toLocaleString()}</span> of ₱
              {expectedTotal.toLocaleString()} confirmed
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-2">
            <span className={scheduleStatusBadge(roundStatus)}>{scheduleStatusLabel(roundStatus)}</span>
            <ChevronDown
              className={`h-4 w-4 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`}
              aria-hidden
            />
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100" aria-hidden>
          <div
            className={`h-full rounded-full ${percent >= 100 ? "bg-brand-500" : "bg-gradient-to-r from-brand-500 to-brand-400"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
        {tally.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {tally.map((t) => (
              <span key={t.label} className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${t.tone}`}>
                {t.label}
              </span>
            ))}
          </div>
        )}
      </button>
      {open && (
        <ul id={panelId} className="animate-rise divide-y divide-ink-100 border-t border-ink-100">
          {sorted.map((entry) => (
            <LedgerRow key={entry.id} entry={entry} expected={expectedOf(entry)} roundClosed={roundClosed} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LedgerList({ entries, contributionAmount }: { entries: LedgerEntry[]; contributionAmount: string }) {
  const rounds = groupLedgerByRound(entries);
  return (
    <div className="space-y-3">
      {rounds.map(([roundNumber, roundEntries], index) => (
        <LedgerRoundCard
          key={roundNumber}
          roundNumber={roundNumber}
          entries={roundEntries}
          contributionAmount={contributionAmount}
          defaultOpen={index === 0}
        />
      ))}
    </div>
  );
}

function ViewerRoundStatus({
  contribution,
  contributionAmount,
}: {
  contribution: RoundContribution;
  contributionAmount: string;
}) {
  const expected = Number(contribution.expectedAmount ?? contributionAmount);
  const remaining = Math.max(0, expected - Number(contribution.amount));

  if (contribution.status === "confirmed") {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-white/80 px-4 py-2.5 text-sm font-bold text-brand-800">
        <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
        You&apos;re paid up for this round.
      </p>
    );
  }
  if (contribution.status === "reported") {
    return (
      <p className="flex items-center gap-2 rounded-2xl bg-white/80 px-4 py-2.5 text-sm font-bold text-ink-800">
        <Clock className="h-4 w-4 shrink-0 text-sun-700" aria-hidden />
        Your payment is waiting for the organizer to confirm.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-2 rounded-2xl bg-danger-50 px-4 py-2.5 text-sm font-bold text-danger-700">
      <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden />
      You still owe ₱{(remaining > 0 ? remaining : expected).toLocaleString()} this round.
    </p>
  );
}

/** The most important thing on the page: who gets this round's pot and how close it is. */
function RoundHero({
  round,
  potAmount,
  confirmedCount,
  totalCount,
  progressPercent,
  isOverdue,
  isViewerRecipient,
  viewerContribution,
  contributionAmount,
}: {
  round: RoundSummary;
  potAmount: number;
  confirmedCount: number;
  totalCount: number;
  progressPercent: number;
  isOverdue: boolean;
  isViewerRecipient: boolean;
  viewerContribution?: RoundContribution;
  contributionAmount: string;
}) {
  const sunny = isViewerRecipient;
  return (
    <div
      className={`rounded-3xl p-6 ${
        sunny ? "border-2 border-sun-200 bg-sun-100 text-ink-900" : "bg-brand-700 text-white"
      }`}
    >
      {/* Round number and due date live in the header's fact strip; only urgency is repeated here. */}
      {isOverdue && (
        <div className="mb-4">
          <span className={ui.badgeDanger}>Overdue</span>
        </div>
      )}

      {sunny ? (
        <>
          <h2 className="font-heading text-3xl font-bold">It&apos;s your turn!</h2>
          <p className="mt-1 text-sm text-ink-700">You receive this round&apos;s pot once everyone has paid.</p>
        </>
      ) : (
        <div className="flex items-center gap-3">
          <Avatar name={round.recipientName} size="md" className="ring-2 ring-white/40" />
          <div className="min-w-0">
            <p className="text-sm text-brand-100">This round&apos;s pot goes to</p>
            <h2 className="font-heading truncate text-2xl font-bold">{round.recipientName}</h2>
          </div>
        </div>
      )}

      <p className="font-heading mt-4 text-4xl font-bold tabular-nums sm:text-5xl">₱{potAmount.toLocaleString()}</p>

      {totalCount > 0 && (
        <div className="mt-4">
          <div className={`h-3 overflow-hidden rounded-full ${sunny ? "bg-white/80" : "bg-white/20"}`}>
            <div
              className={`h-full rounded-full transition-all ${
                sunny ? "bg-gradient-to-r from-brand-500 to-brand-400" : "bg-sun-300"
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <p className={`mt-2 text-sm font-semibold ${sunny ? "text-ink-700" : "text-brand-50"}`}>
            {confirmedCount} of {totalCount} confirmed · {progressPercent}%
          </p>
        </div>
      )}

      {viewerContribution && (
        <div className="mt-4">
          <ViewerRoundStatus contribution={viewerContribution} contributionAmount={contributionAmount} />
        </div>
      )}
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
  dashboard?: {
    pendingConfirmations: number;
    openDisputes: number;
    outstandingObligations: number;
    totalOutstanding: string;
    memberCount: number;
    currentRound: {
      number: number;
      confirmedContributions: number;
      dueDate: string;
      isOverdue: boolean;
    } | null;
  };
  completionSummary?: CompletionSummary;
  completionSummaryLoading?: boolean;
  completionSummaryError?: boolean;
  obligations: ObligationEntry[];
  settlementClaims: SettlementClaimEntry[];
  disputes: DisputeEntry[];
  ledgerEntries: LedgerEntry[];
  auditEntries: AuditLogEntry[];
  auditHasMore?: boolean;
  auditLoadingMore?: boolean;
  onLoadMoreAudit?: () => void;
  actionPending: string | null;
  viewerMembershipId?: string;
  onReportPayment: (contributionId: string, expectedAmount: string) => void;
  onConfirmPayment: (contributionId: string) => void;
  onRecordPayment: (contributionId: string, expectedAmount: string) => void;
  onRaiseDispute: (contributionId: string, memberName: string) => void;
  onSettleMemberDebts: (memberId: string, memberName: string) => void;
  onCoverObligationExternally: (obligationId: string, memberName: string) => void;
  onResolveDispute: (disputeId: string) => void;
  onSubmitSettlementClaim: () => void;
  onReviewSettlementClaim: (claimId: string, decision: "confirm" | "reject") => void;
  onAdvanceRound?: () => void;
  advanceRoundPending?: boolean;
  showDemoTools?: boolean;
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
    dashboard,
    completionSummary,
    completionSummaryLoading,
    completionSummaryError,
    obligations,
    settlementClaims,
    disputes,
    ledgerEntries,
    auditEntries,
    auditHasMore = false,
    auditLoadingMore = false,
    onLoadMoreAudit,
    actionPending,
    viewerMembershipId,
    onReportPayment,
    onConfirmPayment,
    onRecordPayment,
    onRaiseDispute,
    onSettleMemberDebts,
    onCoverObligationExternally,
    onResolveDispute,
    onSubmitSettlementClaim,
    onReviewSettlementClaim,
    onAdvanceRound,
    advanceRoundPending = false,
    showDemoTools = false,
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
        {isCompleted && completionSummaryLoading && (
          <div className="space-y-3" role="status" aria-label="Loading completion summary">
            <div className={`${ui.skeleton} h-24`} />
            <div className={ui.metricGrid}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`${ui.skeleton} h-28`} />
              ))}
            </div>
          </div>
        )}
        {isCompleted && completionSummaryError && !completionSummary && (
          <div className={`${ui.emptyState} py-8`}>
            <p className="font-bold text-ink-900">Could not load completion summary</p>
            <p className={`mt-2 text-sm ${ui.muted}`}>Refresh the page to try again.</p>
          </div>
        )}
        {isCompleted && completionSummary && <CompletionSummaryPanel summary={completionSummary} />}

        {currentRound ? (
          <>
            <RoundHero
              round={currentRound}
              potAmount={potAmount}
              confirmedCount={confirmedCount}
              totalCount={totalCount}
              progressPercent={progressPercent}
              isOverdue={!!dashboard?.currentRound?.isOverdue}
              isViewerRecipient={!!viewerMembershipId && currentRound.recipientMembershipId === viewerMembershipId}
              viewerContribution={contributions.find((c) => c.membershipId === viewerMembershipId)}
              contributionAmount={group.contributionAmount}
            />

            {isActive && nextRound && (
              <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-ink-200 bg-white px-4 py-3">
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 px-2 text-xs font-bold tabular-nums text-ink-700">
                  {nextRound.number}
                </span>
                <Avatar name={nextRound.recipientName ?? "?"} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Next payout</p>
                  <p className="truncate font-bold text-ink-900">
                    {nextRound.recipientMembershipId === viewerMembershipId
                      ? "You're next!"
                      : (nextRound.recipientName ?? "—")}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold tabular-nums text-ink-900">₱{nextPotAmount.toLocaleString()}</p>
                  <p className="text-xs text-ink-500">Due {formatDueDate(nextRound.dueDate)}</p>
                </div>
              </div>
            )}

            {isActive && currentRound && finalRound && (
              <div className="rounded-3xl border border-ink-200 bg-ink-50 px-5 py-4">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Next payout</p>
                <p className="font-heading font-bold text-ink-900">Final round</p>
                <p className="mt-0.5 text-sm text-ink-600">
                  This is the last payout in the cycle. The paluwagan completes once this round closes.
                </p>
              </div>
            )}

            {isManager && isActive && dashboard && (
              <div className={ui.metricGrid2}>
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
                  hint={
                    Number(dashboard.totalOutstanding) > 0
                      ? `${dashboard.outstandingObligations} obligation${dashboard.outstandingObligations === 1 ? "" : "s"} across all rounds`
                      : "Fully settled"
                  }
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
              <h3 className={`mb-3 ${ui.sectionHeader}`}>Contributions</h3>
              {contributions.length > 0 ? (
                <ContributionsList
                  contributions={contributions}
                  contributionAmount={group.contributionAmount}
                  actionPending={actionPending}
                  viewerMembershipId={viewerMembershipId}
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

            {showDemoTools && isManager && isActive && currentRound && onAdvanceRound && (
              <aside
                aria-label="Developer tools"
                className="flex flex-col gap-3 rounded-3xl border-2 border-dashed border-ink-300 bg-ink-50 p-4 sm:flex-row sm:items-center"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-ink-600"
                  aria-hidden
                >
                  <Wrench className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Dev tools</p>
                  <p className="text-sm text-ink-700">
                    Close Round {currentRound.number} now and open the next payout, without waiting for the due date.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onAdvanceRound}
                  disabled={advanceRoundPending}
                  className={`${ui.btnSecondarySm} shrink-0 self-start sm:self-auto`}
                >
                  <FastForward className="h-4 w-4" aria-hidden />
                  {advanceRoundPending ? "Advancing…" : "Advance round"}
                </button>
              </aside>
            )}
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
    if (sortedMembers.length === 0) {
      return <EmptyTabState title="No schedule yet" description="The rotation appears after activation." />;
    }
    return (
      <>
        <div className="mb-6">
          <CycleNetChart
            schedule={schedule}
            viewerMembershipId={viewerMembershipId}
            contributionAmount={group.contributionAmount}
          />
        </div>
        {isManager && !isCompleted && unclaimedSeats > 0 && (
          <p className="mb-3 text-sm text-ink-600">
            Tap an unclaimed seat to create a claim link so someone can take it over during the cycle.
          </p>
        )}
        <ScheduleTimeline
          members={sortedMembers}
          schedule={schedule}
          isManager={isManager}
          viewerMembershipId={viewerMembershipId}
          claimUrls={claimUrls}
          // A completed paluwagan's roster is closed (the server refuses claims too).
          onClaimInvite={isCompleted ? undefined : onClaimInvite}
          claimPending={claimPending}
        />
      </>
    );
  }

  if (cycleTab === "ledger") {
    return ledgerEntries.length > 0 ? (
      <LedgerList entries={ledgerEntries} contributionAmount={group.contributionAmount} />
    ) : (
      <EmptyTabState title="No ledger entries" description="Payments are recorded here as rounds progress." />
    );
  }

  if (cycleTab === "issues") {
    return (
      <IssuesPanel
        obligations={obligations}
        settlementClaims={settlementClaims}
        disputes={disputes}
        isManager={isManager}
        actionPending={actionPending}
        viewerMembershipId={viewerMembershipId}
        onSettleMemberDebts={onSettleMemberDebts}
        onCoverObligationExternally={onCoverObligationExternally}
        onResolveDispute={onResolveDispute}
        onSubmitSettlementClaim={onSubmitSettlementClaim}
        onReviewSettlementClaim={onReviewSettlementClaim}
      />
    );
  }

  if (cycleTab === "audit") {
    return (
      <AuditLogPanel
        entries={auditEntries}
        hasMore={auditHasMore}
        loadingMore={auditLoadingMore}
        onLoadMore={onLoadMoreAudit}
      />
    );
  }

  return null;
}
