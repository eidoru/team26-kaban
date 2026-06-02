import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type GroupMember, type GroupSummary, type MemberReliability } from "../api/client";
import { CopyableLink } from "../components/CopyableLink";
import { useAuth } from "../context/AuthContext";
import { useDialog } from "../context/DialogContext";
import { displayInitials } from "../lib/initials";
import { formatFrequency } from "../lib/frequency";
import { formatShortfallInterestRate } from "../lib/shortfallInterest";
import { clearGroupQueries, groupQueryPollOptions, isGroupNotFoundError, shouldRetryGroupQuery } from "../lib/groupQueries";
import { statusBadgeClass, ui } from "../lib/ui";
import {
  CycleSectionLayout,
  GroupCycleTabPanels,
  type CycleTab,
} from "./GroupCycleTabs";

function SetupStep({
  number,
  title,
  done,
  active,
  children,
}: {
  number: number;
  title: string;
  done: boolean;
  active: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={`${ui.cardCompact} ${active && !done ? "border-slate-200 shadow-sm" : ""}`}
    >
      <div className="flex items-start gap-4">
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${
            done
              ? "bg-emerald-900 text-white"
              : active
                ? "border border-slate-300 bg-white text-slate-900"
                : "border border-gray-200 bg-gray-50 text-slate-400"
          }`}
        >
          {done ? (
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            number
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-medium text-slate-900">{title}</h2>
          {children && <div className="mt-4">{children}</div>}
        </div>
      </div>
    </section>
  );
}

function FormingMemberRow({
  member,
  showManagerActions,
  claimUrl,
  onClaimInvite,
  onRemoveMember,
  claimPending,
  removePending,
}: {
  member: GroupMember;
  showManagerActions: boolean;
  claimUrl?: string;
  onClaimInvite: () => void;
  onRemoveMember: () => void;
  claimPending: boolean;
  removePending: boolean;
}) {
  return (
    <div className="border-b border-gray-50 px-4 py-4 last:border-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          {member.turnNumber != null && (
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-700"
              aria-label={`Payout order ${member.turnNumber}`}
            >
              {member.turnNumber}
            </span>
          )}
          <span className={ui.avatarInitialsSm} aria-hidden>
            {displayInitials(member.displayName)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-900">{member.displayName}</span>
              {member.isManager && (
                <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                  Manager
                </span>
              )}
              {member.isPlaceholder && (
                <span className="rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-xs text-slate-500">
                  Placeholder
                </span>
              )}
            </div>
            {member.contact && <p className="mt-0.5 truncate text-sm text-slate-500">{member.contact}</p>}
          </div>
        </div>
        {showManagerActions && member.isPlaceholder && (
          <div className="flex shrink-0 gap-3">
            <button
              type="button"
              onClick={onClaimInvite}
              disabled={claimPending}
              className="text-sm text-emerald-900 hover:underline disabled:opacity-50"
            >
              Claim link
            </button>
            {!member.isManager && (
              <button
                type="button"
                onClick={onRemoveMember}
                disabled={removePending}
                className="text-sm text-red-600 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </div>
        )}
      </div>
      {claimUrl && <CopyableLink url={claimUrl} label="Claim link" compact />}
    </div>
  );
}

function formatGroupDate(iso: string | null | undefined): string {
  if (!iso) return "Not set yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not set yet";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function FormingTermCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.03)]">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1.5 text-xl font-medium tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function FormingProgressItem({
  label,
  detail,
  done,
  active,
}: {
  label: string;
  detail: string;
  done: boolean;
  active: boolean;
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
          done
            ? "bg-emerald-900 text-white"
            : active
              ? "border border-slate-300 bg-white text-slate-700"
              : "border border-gray-200 bg-gray-50 text-slate-400"
        }`}
        aria-hidden
      >
        {done ? (
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : null}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${done ? "text-slate-900" : active ? "text-slate-900" : "text-slate-500"}`}>
          {label}
        </p>
        <p className="mt-0.5 text-sm text-slate-500">{detail}</p>
      </div>
    </li>
  );
}

function formingNextStepMessage(pending: {
  openSlots: number;
  payoutOrder: boolean;
  startDateMissing: boolean;
}): string {
  if (pending.openSlots > 0) {
    return `Waiting for ${pending.openSlots} more member${pending.openSlots === 1 ? "" : "s"} to join before setup can continue.`;
  }
  if (pending.payoutOrder) {
    return "The organizer will set payout order once the roster is full.";
  }
  if (pending.startDateMissing) {
    return "The organizer will pick a start date for Round 1.";
  }
  return "Setup is complete. The organizer can start the paluwagan when ready.";
}

function FormingMemberPanel({
  group,
  members,
  sortedMembers,
  pending,
  rosterFilled,
  rosterFillPercent,
  displayStartDate,
  onLeave,
  leavePending,
}: {
  group: Pick<
    GroupSummary,
    | "contributionAmount"
    | "frequency"
    | "frequencyDays"
    | "slotCount"
    | "startDate"
    | "shortfallInterestRatePercent"
  >;
  members: GroupMember[];
  sortedMembers: GroupMember[];
  pending: {
    openSlots: number;
    payoutOrder: boolean;
    startDateMissing: boolean;
    unclaimedSeats: number;
  };
  rosterFilled: number;
  rosterFillPercent: number;
  displayStartDate: string;
  onLeave: () => void;
  leavePending: boolean;
}) {
  const { user } = useAuth();
  const manager = members.find((m) => m.isManager);
  const myMembership = members.find((m) => m.userId === user?.id);
  const amount = `₱${Number(group.contributionAmount).toLocaleString()}`;
  const freq = formatFrequency(group.frequency, group.frequencyDays);
  const shortfallInterest = formatShortfallInterestRate(
    group.shortfallInterestRatePercent,
    group.frequency,
    group.frequencyDays,
  );
  const potAmount = Number(group.contributionAmount) * group.slotCount;

  const rosterDone = pending.openSlots === 0;
  const payoutDone = !pending.payoutOrder;
  const startDateDone = !pending.startDateMissing;

  return (
    <>
      <div className={ui.callout}>
        <p className="text-sm font-medium text-emerald-900">Waiting to start</p>
        <p className="mt-1 text-sm text-emerald-800/80">{formingNextStepMessage(pending)}</p>
      </div>

      <section>
        <h2 className="mb-3 text-base font-medium text-slate-900">Paluwagan terms</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <FormingTermCard label="Organizer" value={manager?.displayName ?? "—"} hint="Runs setup and payments" />
          <FormingTermCard label="Your contribution" value={amount} hint="Due each round" />
          <FormingTermCard label="Payment schedule" value={freq} hint="Between rounds" />
          <FormingTermCard
            label="Round pot"
            value={`₱${potAmount.toLocaleString()}`}
            hint={`${group.slotCount} members × ${amount}`}
          />
          <FormingTermCard
            label="Group size"
            value={`${group.slotCount} members`}
            hint={`${rosterFilled} joined so far`}
          />
          <FormingTermCard
            label="First round due"
            value={formatGroupDate(displayStartDate || group.startDate)}
            hint={startDateDone ? "Round 1 payment date" : "Organizer has not set this yet"}
          />
          <FormingTermCard
            label="Shortfall interest"
            value={shortfallInterest}
            hint="On unpaid balances owed to the organizer"
          />
        </div>
      </section>

      {myMembership && (
        <section className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">Your seat</p>
          <p className="mt-1 text-lg font-medium text-slate-900">{myMembership.displayName}</p>
          <div className="mt-2 space-y-1 text-sm text-slate-600">
            {myMembership.turnNumber != null ? (
              <p>
                Payout turn{" "}
                <span className="font-medium text-slate-900">#{myMembership.turnNumber}</span>
                {" "}of {group.slotCount}
              </p>
            ) : (
              <p>Payout turn will appear after the organizer sets the order.</p>
            )}
            {myMembership.contact && <p>Contact on file: {myMembership.contact}</p>}
          </div>
        </section>
      )}

      <section className={ui.cardCompact}>
        <h2 className="text-base font-medium text-slate-900">Setup progress</h2>
        <p className="mt-1 text-sm text-slate-500">The organizer completes these steps before the cycle begins.</p>
        <ol className="mt-4 space-y-4">
          <FormingProgressItem
            label="Fill the roster"
            detail={
              rosterDone
                ? `${rosterFilled} of ${group.slotCount} seats filled`
                : `${rosterFilled} of ${group.slotCount} joined · ${pending.openSlots} open`
            }
            done={rosterDone}
            active={!rosterDone}
          />
          <FormingProgressItem
            label="Set payout order"
            detail={
              payoutDone
                ? "Turn order assigned for all members"
                : rosterDone
                  ? "Pending — organizer sets who receives the pot each round"
                  : "Starts after the roster is full"
            }
            done={payoutDone}
            active={rosterDone && !payoutDone}
          />
          <FormingProgressItem
            label={startDateDone ? "Start date" : "Choose start date"}
            detail={
              startDateDone
                ? `Round 1 due ${formatGroupDate(displayStartDate || group.startDate)}`
                : payoutDone
                  ? "Pending — organizer picks when Round 1 is due"
                  : "After payout order is set"
            }
            done={startDateDone}
            active={payoutDone && !startDateDone}
          />
          <FormingProgressItem
            label="Start the cycle"
            detail={
              rosterDone && payoutDone && startDateDone
                ? "Ready — waiting for the organizer to start"
                : "Complete the steps above first"
            }
            done={false}
            active={rosterDone && payoutDone && startDateDone}
          />
        </ol>
      </section>

      <section className={ui.cardCompact}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-medium text-slate-900">Members</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {rosterFilled} of {group.slotCount} joined
              {pending.unclaimedSeats > 0 &&
                ` · ${pending.unclaimedSeats} unclaimed placeholder${pending.unclaimedSeats === 1 ? "" : "s"}`}
            </p>
          </div>
        </div>
        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>{rosterFillPercent}% filled</span>
            {pending.openSlots > 0 && (
              <span>
                {pending.openSlots} open slot{pending.openSlots === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${rosterFillPercent}%` }}
            />
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
          {sortedMembers.map((m) => (
            <FormingMemberRow
              key={m.id}
              member={m}
              showManagerActions={false}
              onClaimInvite={() => {}}
              onRemoveMember={() => {}}
              claimPending={false}
              removePending={false}
            />
          ))}
          {pending.openSlots > 0 &&
            Array.from({ length: pending.openSlots }).map((_, index) => (
              <div
                key={`open-slot-${index}`}
                className="flex items-center gap-3 border-t border-dashed border-gray-100 px-4 py-3 text-sm text-slate-400"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-slate-50 text-xs">
                  ?
                </span>
                Open slot
              </div>
            ))}
        </div>
      </section>

      <div className="flex justify-end border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onLeave}
          disabled={leavePending}
          className={ui.btnDangerGhost}
        >
          {leavePending ? "Leaving…" : "Leave group"}
        </button>
      </div>
    </>
  );
}

function PayoutOrderCard({
  members,
  payoutOrderMissing,
  manualOrder,
  onManualOrderChange,
  onRandomize,
  onSaveManual,
  randomizing,
  saving,
  embedded = false,
}: {
  members: GroupMember[];
  payoutOrderMissing: boolean;
  manualOrder: Record<string, number>;
  onManualOrderChange: (memberId: string, turn: number) => void;
  onRandomize: () => void;
  onSaveManual: () => void;
  randomizing: boolean;
  saving: boolean;
  embedded?: boolean;
}) {
  const orderIsSet = !payoutOrderMissing;
  const [editOpen, setEditOpen] = useState(!orderIsSet);

  useEffect(() => {
    if (orderIsSet) setEditOpen(false);
  }, [orderIsSet]);

  const rankedMembers = [...members].sort((a, b) => {
    if (a.turnNumber != null && b.turnNumber != null) return a.turnNumber - b.turnNumber;
    if (a.turnNumber != null) return -1;
    if (b.turnNumber != null) return 1;
    return a.displayName.localeCompare(b.displayName);
  });

  return (
    <section className={embedded ? "" : ui.cardCompact}>
      {!embedded && (
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-medium text-slate-900">Payout order</h2>
            <p className="mt-1 text-sm text-slate-500">
              Turn 1 receives the pot first, then each member in sequence.
            </p>
          </div>
          <span
            className={
              orderIsSet
                ? "rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-normal text-emerald-700"
                : "rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-normal text-slate-600"
            }
          >
            {orderIsSet ? "Set" : "Not set"}
          </span>
        </div>
      )}

      {embedded && (
        <p className="text-sm text-slate-500">
          Turn 1 receives the pot first, then each member in sequence.
        </p>
      )}

      {orderIsSet && !editOpen && (
        <ol className={`space-y-2 ${embedded ? "mt-3" : "mt-6"}`}>
          {rankedMembers.map((member) => (
            <li
              key={member.id}
              className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-sm font-medium text-slate-700">
                {member.turnNumber}
              </span>
              <span className={ui.avatarInitialsSm} aria-hidden>
                {displayInitials(member.displayName)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-slate-900">{member.displayName}</p>
                {member.isManager && (
                  <p className="text-xs text-slate-500">Manager</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className={`flex flex-wrap gap-3 ${embedded ? "mt-4" : "mt-6"}`}>
        <button
          type="button"
          onClick={onRandomize}
          disabled={randomizing}
          className={orderIsSet ? ui.btnSecondary : ui.btnOutline}
        >
          {randomizing ? "Randomizing…" : orderIsSet ? "Re-randomize" : "Randomize order"}
        </button>
        {orderIsSet && (
          <button
            type="button"
            onClick={() => setEditOpen((open) => !open)}
            className={ui.btnSecondary}
          >
            {editOpen ? "Done editing" : "Edit manually"}
          </button>
        )}
      </div>

      {(!orderIsSet || editOpen) && (
        <div className="mt-6 border-t border-gray-100 pt-6">
          <p className="mb-4 text-sm text-slate-500">
            {orderIsSet
              ? "Change turn numbers below, then save."
              : "Assign each member a turn, or use randomize above."}
          </p>
          <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-4 py-3 last:border-0 sm:flex-nowrap"
              >
                <span className={ui.avatarInitialsSm} aria-hidden>
                  {displayInitials(member.displayName)}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900">
                  {member.displayName}
                </span>
                <label className="flex items-center gap-2 text-sm text-slate-500">
                  <span className="shrink-0">Turn</span>
                  <select
                    value={manualOrder[member.id] ?? member.turnNumber ?? ""}
                    onChange={(e) => onManualOrderChange(member.id, Number(e.target.value))}
                    className={`${ui.select} min-w-[5rem]`}
                    aria-label={`Turn for ${member.displayName}`}
                  >
                    <option value="">—</option>
                    {members.map((_, index) => (
                      <option key={index + 1} value={index + 1}>
                        {index + 1}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
          </div>
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onSaveManual}
              disabled={saving}
              className={ui.btnPrimary}
            >
              {saving ? "Saving…" : "Save order"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function statusBadge(status: string) {
  const label =
    status === "active" ? "Active" : status === "completed" ? "Completed" : "Forming";
  return <span className={statusBadgeClass(status)}>{label}</span>;
}

export function GroupLobbyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dialog = useDialog();
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [claimUrls, setClaimUrls] = useState<Record<string, string>>({});
  const [addName, setAddName] = useState("");
  const [addContact, setAddContact] = useState("");
  const [formError, setFormError] = useState("");
  const [actionPending, setActionPending] = useState<string | null>(null);
  const [startDate, setStartDate] = useState("");
  const [manualOrder, setManualOrder] = useState<Record<string, number>>({});
  const [cycleTab, setCycleTab] = useState<CycleTab>("overview");

  useEffect(() => {
    setCycleTab("overview");
  }, [id]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["group", id],
    queryFn: () => api.getGroup(id!),
    enabled: !!id,
    retry: shouldRetryGroupQuery,
    refetchInterval: (query) => {
      if (isGroupNotFoundError(query.state.error)) return false;
      return groupQueryPollOptions(query.state.data?.group.status).refetchInterval;
    },
    refetchOnWindowFocus: (query) => {
      if (isGroupNotFoundError(query.state.error)) return false;
      return groupQueryPollOptions(query.state.data?.group.status).refetchOnWindowFocus;
    },
  });

  const groupUnavailable = isGroupNotFoundError(error);
  const groupLoaded = !!data && !groupUnavailable;
  const groupStatus = data?.group.status;
  const groupPoll = groupQueryPollOptions(groupStatus);
  const cycleStarted = groupLoaded && data.group.status !== "forming";

  const { data: ledgerData } = useQuery({
    queryKey: ["ledger", id],
    queryFn: () => api.getLedger(id!),
    enabled: !!id && groupLoaded && cycleStarted,
    retry: shouldRetryGroupQuery,
    ...groupPoll,
  });

  const { data: auditData } = useQuery({
    queryKey: ["audit-log", id],
    queryFn: () => api.getAuditLog(id!),
    enabled: !!id && groupLoaded && cycleStarted && data?.group.role === "manager",
    retry: shouldRetryGroupQuery,
    ...groupPoll,
  });

  const { data: obligationsData } = useQuery({
    queryKey: ["obligations", id],
    queryFn: () => api.getObligations(id!),
    enabled: !!id && groupLoaded && cycleStarted,
    retry: shouldRetryGroupQuery,
    ...groupPoll,
  });

  const { data: disputesData } = useQuery({
    queryKey: ["disputes", id],
    queryFn: () => api.getDisputes(id!),
    enabled: !!id && groupLoaded && cycleStarted,
    retry: shouldRetryGroupQuery,
    ...groupPoll,
  });

  const isManagerView = data?.group.role === "manager";

  const { data: dashboardData } = useQuery({
    queryKey: ["dashboard", id],
    queryFn: () => api.getDashboard(id!),
    enabled: !!id && groupLoaded && cycleStarted && isManagerView,
    retry: shouldRetryGroupQuery,
    ...groupPoll,
  });

  const isCompleted = groupLoaded && data.group.status === "completed";

  const { data: completionData } = useQuery({
    queryKey: ["completion-summary", id],
    queryFn: () => api.getCompletionSummary(id!),
    enabled: !!id && groupLoaded && isCompleted,
    retry: shouldRetryGroupQuery,
    refetchOnWindowFocus: true,
  });

  const redirectedForMissingGroup = useRef(false);
  useEffect(() => {
    redirectedForMissingGroup.current = false;
  }, [id]);

  useEffect(() => {
    if (!id || !groupUnavailable || redirectedForMissingGroup.current) return;
    redirectedForMissingGroup.current = true;
    void (async () => {
      await clearGroupQueries(queryClient, id);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      navigate("/home", { replace: true });
    })();
  }, [groupUnavailable, id, navigate, queryClient]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["group", id] });
    queryClient.invalidateQueries({ queryKey: ["groups"] });
    queryClient.invalidateQueries({ queryKey: ["home-overview"] });
    queryClient.invalidateQueries({ queryKey: ["ledger", id] });
    queryClient.invalidateQueries({ queryKey: ["audit-log", id] });
    queryClient.invalidateQueries({ queryKey: ["obligations", id] });
    queryClient.invalidateQueries({ queryKey: ["disputes", id] });
    queryClient.invalidateQueries({ queryKey: ["dashboard", id] });
    queryClient.invalidateQueries({ queryKey: ["completion-summary", id] });
    queryClient.invalidateQueries({ queryKey: ["manager-obligations"] });
  };

  const addMember = useMutation({
    mutationFn: () => api.addPlaceholder(id!, { displayName: addName, contact: addContact || undefined }),
  });

  const removeMember = useMutation({
    mutationFn: (memberId: string) => api.removeMember(id!, memberId),
  });

  const groupInvite = useMutation({
    mutationFn: () => api.createInvite(id!, { type: "group_invite" }),
  });

  const claimInvite = useMutation({
    mutationFn: (membershipId: string) =>
      api.createInvite(id!, { type: "membership_claim", membershipId }),
  });

  const leaveGroup = useMutation({
    mutationFn: () => api.leaveGroup(id!),
  });

  const deleteGroup = useMutation({
    mutationFn: () => api.deleteGroup(id!),
  });

  const payoutRandom = useMutation({
    mutationFn: () => api.setPayoutOrder(id!, { method: "random" }),
  });

  const payoutManual = useMutation({
    mutationFn: (order: { membershipId: string; turnNumber: number }[]) =>
      api.setPayoutOrder(id!, { method: "manual", order }),
  });

  const saveStartDate = useMutation({
    mutationFn: (date: string) => api.setStartDate(id!, date),
  });

  const activate = useMutation({
    mutationFn: (body?: { startDate?: string }) => api.activateGroup(id!, body),
  });

  const sortedMembers = useMemo(() => {
    if (!data?.members) return [];
    return [...data.members].sort((a, b) => {
      if (a.turnNumber != null && b.turnNumber != null) return a.turnNumber - b.turnNumber;
      if (a.turnNumber != null) return -1;
      if (b.turnNumber != null) return 1;
      return 0;
    });
  }, [data?.members]);

  if (isLoading) return <p className={ui.muted}>Loading group…</p>;
  if (groupUnavailable) return <p className={ui.muted}>This paluwagan is no longer available…</p>;
  if (error || !data) {
    return (
      <div>
        <p className={ui.error}>
          {error instanceof ApiError ? error.message : "Failed to load group"}
        </p>
        <Link to="/home" className={`mt-4 inline-block ${ui.backLink}`}>
          <span className={ui.backLinkArrow}>←</span>
          Back to home
        </Link>
      </div>
    );
  }

  const { group, members, pending, currentRound, schedule, reliability = [] } = data;
  const isManager = group.role === "manager";
  const isForming = group.status === "forming";
  const isActive = group.status === "active";
  const reliabilityByMember = new Map(reliability.map((r: MemberReliability) => [r.membershipId, r]));
  const displayStartDate =
    startDate || (group.startDate ? String(group.startDate).slice(0, 10) : "");

  async function promptPartialAmount(expected: string): Promise<number | undefined | null> {
    const input = await dialog.prompt({
      title: "Amount paid",
      description: `Leave blank for the full ₱${Number(expected).toLocaleString()}.`,
      label: "Amount (₱)",
      placeholder: "Full amount",
      submitLabel: "Continue",
      validate: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const amount = Number(trimmed);
        if (Number.isNaN(amount) || amount <= 0) return "Enter a valid positive amount.";
        return null;
      },
    });
    if (input == null) return null;
    const trimmed = input.trim();
    if (!trimmed) return undefined;
    return Number(trimmed);
  }

  async function handleReportPayment(contributionId: string, expectedAmount: string) {
    setFormError("");
    const amount = await promptPartialAmount(expectedAmount);
    if (amount === null) return;
    setActionPending(contributionId);
    try {
      await api.reportContribution(id!, contributionId, amount != null ? { amount } : undefined);
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to report payment");
    } finally {
      setActionPending(null);
    }
  }

  async function handleConfirmPayment(contributionId: string) {
    setFormError("");
    setActionPending(contributionId);
    try {
      await api.confirmContribution(id!, contributionId);
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to confirm payment");
    } finally {
      setActionPending(null);
    }
  }

  async function handleRecordPayment(contributionId: string, expectedAmount: string) {
    setFormError("");
    const amount = await promptPartialAmount(expectedAmount);
    if (amount === null) return;
    setActionPending(contributionId);
    try {
      await api.recordContribution(id!, contributionId, amount != null ? { amount } : undefined);
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to record payment");
    } finally {
      setActionPending(null);
    }
  }

  async function handleSettleMemberDebts(memberId: string, memberName: string) {
    setFormError("");
    const result = await dialog.settleDebt({
      title: `Settle debt for ${memberName}`,
      description: "Enter the settlement amount and an optional note.",
    });
    if (result == null) return;
    setActionPending(`settle-${memberId}`);
    try {
      await api.settleMemberDebts(id!, memberId, {
        amount: result.amount,
        note: result.note,
      });
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to settle debt");
    } finally {
      setActionPending(null);
    }
  }

  async function handleRaiseDispute(contributionId: string, memberName: string) {
    setFormError("");
    const note = await dialog.prompt({
      title: "Raise dispute",
      description: `Why are you disputing ${memberName}'s payment?`,
      label: "Reason",
      required: true,
      multiline: true,
      submitLabel: "Submit dispute",
    });
    if (note == null || !note.trim()) return;
    setActionPending(`dispute-${contributionId}`);
    try {
      await api.raiseDispute(id!, contributionId, { note: note.trim() });
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to raise dispute");
    } finally {
      setActionPending(null);
    }
  }

  async function handleResolveDispute(disputeId: string) {
    setFormError("");
    const resolution = await dialog.prompt({
      title: "Resolve dispute",
      label: "Resolution note",
      placeholder: "Describe how this was resolved",
      required: true,
      multiline: true,
      submitLabel: "Resolve",
    });
    if (resolution == null || !resolution.trim()) return;
    setActionPending(`resolve-${disputeId}`);
    try {
      await api.resolveDispute(id!, disputeId, resolution.trim());
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to resolve dispute");
    } finally {
      setActionPending(null);
    }
  }

  async function handleAddMember(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    try {
      await addMember.mutateAsync();
      setAddName("");
      setAddContact("");
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to add member");
    }
  }

  async function handleRemoveMember(memberId: string) {
    setFormError("");
    try {
      await removeMember.mutateAsync(memberId);
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to remove member");
    }
  }

  async function handleGroupInvite() {
    setFormError("");
    try {
      const res = await groupInvite.mutateAsync();
      setInviteUrl(res.invite.url);
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create invite");
    }
  }

  async function handleClaimInvite(membershipId: string) {
    setFormError("");
    try {
      const res = await claimInvite.mutateAsync(membershipId);
      setClaimUrls((prev) => ({ ...prev, [membershipId]: res.invite.url }));
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to create claim link");
    }
  }

  async function handleLeave() {
    setFormError("");
    try {
      await leaveGroup.mutateAsync();
      await clearGroupQueries(queryClient, id!);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      navigate("/home", { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to leave group");
    }
  }

  async function handleDeleteGroup() {
    const joinedMembers = members.filter((m) => !m.isManager && !m.isPlaceholder).length;
    const description =
      joinedMembers > 0
        ? `${joinedMembers} member${joinedMembers === 1 ? "" : "s"} will be notified and lose access. Invite links will stop working. This cannot be undone.`
        : "Invite links will stop working. This cannot be undone.";
    const confirmed = await dialog.confirm({
      title: `Delete "${group.name}"?`,
      description,
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      variant: "danger",
    });
    if (!confirmed) return;

    setFormError("");
    try {
      await deleteGroup.mutateAsync();
      await clearGroupQueries(queryClient, id!);
      await queryClient.invalidateQueries({ queryKey: ["groups"] });
      await queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      navigate("/home", { replace: true });
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to delete paluwagan");
    }
  }

  async function handleRandomizeOrder() {
    setFormError("");
    try {
      await payoutRandom.mutateAsync();
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to randomize order");
    }
  }

  async function handleSaveManualOrder() {
    setFormError("");
    const order = members.map((m) => ({
      membershipId: m.id,
      turnNumber: manualOrder[m.id] ?? m.turnNumber ?? 0,
    }));
    if (order.some((o) => o.turnNumber < 1)) {
      setFormError("Assign a turn number to every member");
      return;
    }
    try {
      await payoutManual.mutateAsync(order);
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to save payout order");
    }
  }

  async function handleSaveStartDate() {
    setFormError("");
    if (!displayStartDate) {
      setFormError("Choose a start date");
      return;
    }
    try {
      await saveStartDate.mutateAsync(displayStartDate);
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to save start date");
    }
  }

  const readyToActivate =
    pending.openSlots === 0 && !pending.payoutOrder && !!displayStartDate;

  const rosterFilled = group.filledCount ?? members.length;
  const rosterFillPercent =
    group.slotCount > 0 ? Math.min(100, Math.round((rosterFilled / group.slotCount) * 100)) : 0;

  async function handleActivate() {
    setFormError("");
    try {
      await activate.mutateAsync(displayStartDate ? { startDate: displayStartDate } : undefined);
      invalidate();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Failed to activate group");
    }
  }

  const openDisputeCount =
    disputesData?.disputes.filter((d) => d.status === "open").length ?? 0;
  const unsettledObligationCount =
    obligationsData?.obligations.filter((o) => o.status !== "settled").length ?? 0;
  const issuesCount = openDisputeCount + unsettledObligationCount;

  const cycleTabs: { id: CycleTab; label: string; badge?: number }[] = [
    { id: "overview", label: isActive ? "This round" : "Summary" },
    { id: "schedule", label: "Schedule" },
    { id: "ledger", label: "Ledger" },
    { id: "issues", label: "Issues", badge: issuesCount },
    { id: "members", label: "Members" },
    ...(isManager ? [{ id: "audit" as const, label: "Audit log" }] : []),
  ];

  return (
    <div className="min-w-0">
      <Link to="/home" className={ui.backLink}>
        <span className={ui.backLinkArrow}>←</span>
        Home
      </Link>

      <header className="mb-8 flex flex-wrap items-start justify-between gap-4 border-b border-gray-100 pb-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className={ui.pageTitle}>{group.name}</h1>
            {statusBadge(group.status)}
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-slate-600">
            <div>
              <dt className="inline text-slate-500">Contribution </dt>
              <dd className="inline font-medium text-slate-900">
                ₱{Number(group.contributionAmount).toLocaleString()}
              </dd>
            </div>
            <div>
              <dt className="inline text-slate-500">Schedule </dt>
              <dd className="inline">{formatFrequency(group.frequency, group.frequencyDays)}</dd>
            </div>
            <div>
              <dt className="inline text-slate-500">Roster </dt>
              <dd className="inline">
                {group.filledCount ?? members.length} / {group.slotCount}
              </dd>
            </div>
            {isActive && currentRound && (
              <div>
                <dt className="inline text-slate-500">Current round </dt>
                <dd className="inline">
                  #{currentRound.number} · due {currentRound.dueDate}
                </dd>
              </div>
            )}
            {isForming && displayStartDate && (
              <div>
                <dt className="inline text-slate-500">Starts </dt>
                <dd className="inline">{formatGroupDate(displayStartDate)}</dd>
              </div>
            )}
          </dl>
        </div>
        {isManager && !isForming && issuesCount > 0 && (
          <button
            type="button"
            onClick={() => setCycleTab("issues")}
            className={`${ui.btnSecondary} shrink-0`}
          >
            {issuesCount} issue{issuesCount === 1 ? "" : "s"}
          </button>
        )}
      </header>

      {isForming && (
        <div className="space-y-6">
          {isManager ? (
            <>
              <SetupStep
                number={1}
                title={`Fill the roster (${rosterFilled}/${group.slotCount})`}
                done={pending.openSlots === 0}
                active={pending.openSlots > 0}
              >
                <div className="mb-4">
                  <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                    <span>{rosterFillPercent}% filled</span>
                    {pending.openSlots > 0 && (
                      <span>
                        {pending.openSlots} open slot{pending.openSlots === 1 ? "" : "s"}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                    <div
                      className="h-full rounded-full bg-emerald-600 transition-all"
                      style={{ width: `${rosterFillPercent}%` }}
                    />
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
                  {sortedMembers.map((m) => (
                    <FormingMemberRow
                      key={m.id}
                      member={m}
                      showManagerActions={isManager}
                      claimUrl={claimUrls[m.id]}
                      onClaimInvite={() => void handleClaimInvite(m.id)}
                      onRemoveMember={() => void handleRemoveMember(m.id)}
                      claimPending={claimInvite.isPending}
                      removePending={removeMember.isPending}
                    />
                  ))}
                  {pending.openSlots > 0 &&
                    Array.from({ length: pending.openSlots }).map((_, index) => (
                      <div
                        key={`open-slot-${index}`}
                        className="flex items-center gap-3 border-t border-dashed border-gray-100 px-4 py-3 text-sm text-slate-400"
                      >
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-slate-50 text-xs">
                          ?
                        </span>
                        Open slot
                      </div>
                    ))}
                </div>
                {pending.openSlots > 0 && (
                  <div className="mt-4 grid gap-4 lg:grid-cols-2">
                    <form onSubmit={handleAddMember} className={ui.formStack}>
                      <div>
                        <label className={ui.label}>Add placeholder</label>
                        <input
                          placeholder="Member name"
                          required
                          value={addName}
                          onChange={(e) => setAddName(e.target.value)}
                          className={ui.input}
                        />
                      </div>
                      <div>
                        <label className={ui.label}>Contact (optional)</label>
                        <input
                          placeholder="Phone or messenger"
                          value={addContact}
                          onChange={(e) => setAddContact(e.target.value)}
                          className={ui.input}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={addMember.isPending}
                        className={`${ui.btnPrimarySm} self-start`}
                      >
                        {addMember.isPending ? "Adding…" : "Add member"}
                      </button>
                    </form>
                    <div className="rounded-xl border border-gray-100 bg-slate-50 p-4">
                      <p className="text-sm font-medium text-slate-900">Invite link</p>
                      <p className="mt-1 text-sm text-slate-500">Share so someone can claim an open slot.</p>
                      {inviteUrl ? (
                        <div className="mt-3 space-y-2">
                          <CopyableLink url={inviteUrl} label="Invite link" compact />
                          <button
                            type="button"
                            onClick={() => void handleGroupInvite()}
                            disabled={groupInvite.isPending}
                            className={`${ui.link} text-xs`}
                          >
                            Generate new link
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void handleGroupInvite()}
                          disabled={groupInvite.isPending}
                          className={`${ui.btnSecondary} mt-3`}
                        >
                          {groupInvite.isPending ? "Generating…" : "Generate invite link"}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </SetupStep>

              {pending.openSlots === 0 && (
                <>
                  <SetupStep
                    number={2}
                    title="Set payout order"
                    done={!pending.payoutOrder}
                    active={pending.payoutOrder}
                  >
                    <PayoutOrderCard
                      members={members}
                      payoutOrderMissing={pending.payoutOrder}
                      manualOrder={manualOrder}
                      onManualOrderChange={(memberId, turn) =>
                        setManualOrder((prev) => ({ ...prev, [memberId]: turn }))
                      }
                      onRandomize={() => void handleRandomizeOrder()}
                      onSaveManual={() => void handleSaveManualOrder()}
                      randomizing={payoutRandom.isPending}
                      saving={payoutManual.isPending}
                      embedded
                    />
                  </SetupStep>

                  {pending.startDateMissing && (
                    <SetupStep
                      number={3}
                      title="Choose start date"
                      done={false}
                      active={pending.payoutOrder === false}
                    >
                      <p className="text-sm text-slate-500">
                        Round 1 is due on this date. Later rounds follow your{" "}
                        {formatFrequency(group.frequency, group.frequencyDays).toLowerCase()} schedule.
                      </p>
                      <div className="mt-4 flex flex-wrap items-end gap-3">
                        <div className="min-w-[12rem]">
                          <label htmlFor="formingStartDate" className={ui.label}>
                            First round due
                          </label>
                          <input
                            id="formingStartDate"
                            type="date"
                            value={displayStartDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className={ui.input}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleSaveStartDate()}
                          disabled={saveStartDate.isPending || !displayStartDate}
                          className={ui.btnSecondary}
                        >
                          {saveStartDate.isPending ? "Saving…" : "Save date"}
                        </button>
                      </div>
                    </SetupStep>
                  )}

                  <SetupStep
                    number={pending.startDateMissing ? 4 : 3}
                    title="Start the paluwagan"
                    done={pending.cycleStarted}
                    active={readyToActivate && !pending.cycleStarted}
                  >
                    <p className="text-sm text-slate-500">
                      Locks the roster and opens Round 1. Placeholders without accounts are fine if you
                      track them offline.
                    </p>
                    {!pending.startDateMissing && displayStartDate && (
                      <p className="mt-2 text-sm text-slate-600">
                        First round due{" "}
                        <span className="font-medium text-slate-900">
                          {formatGroupDate(displayStartDate)}
                        </span>
                        . You set this when creating the group.
                      </p>
                    )}
                    {pending.unclaimedSeats > 0 && (
                      <p className="mt-2 text-xs text-slate-500">
                        {pending.unclaimedSeats} unclaimed placeholder
                        {pending.unclaimedSeats === 1 ? "" : "s"} on the roster.
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleActivate()}
                      disabled={!readyToActivate || activate.isPending}
                      className={`mt-4 ${ui.btnPrimary}`}
                    >
                      {activate.isPending ? "Starting…" : "Start paluwagan"}
                    </button>
                    {!readyToActivate && (
                      <p className="mt-2 text-sm text-slate-500">Complete the steps above first.</p>
                    )}
                  </SetupStep>
                </>
              )}

              <div className="flex justify-end border-t border-gray-100 pt-4">
                <button
                  type="button"
                  onClick={() => void handleDeleteGroup()}
                  disabled={deleteGroup.isPending}
                  className={ui.btnDangerGhost}
                >
                  {deleteGroup.isPending ? "Deleting…" : "Delete paluwagan"}
                </button>
              </div>
            </>
          ) : (
            <FormingMemberPanel
              group={group}
              members={members}
              sortedMembers={sortedMembers}
              pending={pending}
              rosterFilled={rosterFilled}
              rosterFillPercent={rosterFillPercent}
              displayStartDate={displayStartDate}
              onLeave={() => void handleLeave()}
              leavePending={leaveGroup.isPending}
            />
          )}

          {formError && <p className={ui.error}>{formError}</p>}
        </div>
      )}

      {cycleStarted && (
        <CycleSectionLayout tabs={cycleTabs} active={cycleTab} onSelect={setCycleTab}>
          <GroupCycleTabPanels
            cycleTab={cycleTab}
            group={group}
            currentRound={currentRound}
            schedule={schedule}
            isManager={isManager}
            isActive={isActive}
            isCompleted={isCompleted}
            sortedMembers={sortedMembers}
            reliabilityByMember={reliabilityByMember}
            dashboard={dashboardData?.dashboard}
            completionSummary={completionData?.summary}
            obligations={obligationsData?.obligations ?? []}
            disputes={disputesData?.disputes ?? []}
            ledgerEntries={ledgerData?.entries ?? []}
            auditEntries={auditData?.entries ?? []}
            actionPending={actionPending}
            onReportPayment={(cid, amount) => void handleReportPayment(cid, amount)}
            onConfirmPayment={(cid) => void handleConfirmPayment(cid)}
            onRecordPayment={(cid, amount) => void handleRecordPayment(cid, amount)}
            onRaiseDispute={(cid, name) => void handleRaiseDispute(cid, name)}
            onSettleMemberDebts={(memberId, name) => void handleSettleMemberDebts(memberId, name)}
            onResolveDispute={(disputeId) => void handleResolveDispute(disputeId)}
            claimUrls={claimUrls}
            onClaimInvite={(membershipId) => void handleClaimInvite(membershipId)}
            claimPending={claimInvite.isPending}
            unclaimedSeats={pending.unclaimedSeats}
          />
        </CycleSectionLayout>
      )}

      {formError && <p className={`mt-4 ${ui.error}`}>{formError}</p>}
    </div>
  );
}
