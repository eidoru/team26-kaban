import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { displayInitials } from "../lib/initials";
import { formatFrequency } from "../lib/frequency";
import { formatShortfallInterestRate } from "../lib/shortfallInterest";
import { ui } from "../lib/ui";
import { useAuth } from "../context/AuthContext";
import { CopyableLink } from "../components/CopyableLink";
import { GroupSectionLayout, type SectionNavItem } from "../components/GroupChrome";
import type { GroupDetail, GroupMember, GroupSummary } from "../api/client";

type FormingGroup = Pick<
  GroupSummary,
  | "contributionAmount"
  | "frequency"
  | "frequencyDays"
  | "slotCount"
  | "shortfallInterestRatePercent"
  | "startDate"
>;

type FormingPending = {
  openSlots: number;
  payoutOrder: boolean;
  startDateMissing: boolean;
  unclaimedSeats: number;
  cycleStarted: boolean;
};

type ManagerTab = "members" | "order" | "start";
type MemberTab = "members" | "order" | "terms";

export function formatGroupDate(iso: string | null | undefined): string {
  if (!iso) return "Not set yet";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not set yet";
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

function CheckMark() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SetupChecklist({
  rosterDone,
  orderDone,
  startDone,
  needsStartDate,
  ready,
}: {
  rosterDone: boolean;
  orderDone: boolean;
  startDone: boolean;
  needsStartDate: boolean;
  ready: boolean;
}) {
  const items = [
    { done: rosterDone, label: "Fill roster" },
    { done: orderDone, label: "Set payout order" },
    ...(needsStartDate ? [{ done: startDone, label: "Pick start date" }] : []),
    { done: ready, label: "Launch" },
  ];

  return (
    <ol className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item.label}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm ${
            item.done ? "bg-emerald-50 text-emerald-800" : "bg-gray-100 text-slate-500"
          }`}
        >
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full ${
              item.done ? "bg-emerald-900 text-white" : "border border-gray-300 bg-white text-xs text-slate-400"
            }`}
          >
            {item.done ? <CheckMark /> : "·"}
          </span>
          {item.label}
        </li>
      ))}
    </ol>
  );
}

function MemberTableRow({
  member,
  turn,
  managerView,
  claimUrl,
  onClaimInvite,
  onRemoveMember,
  claimPending,
  removePending,
}: {
  member: GroupMember;
  turn: number | null;
  managerView: boolean;
  claimUrl?: string;
  onClaimInvite?: () => void;
  onRemoveMember?: () => void;
  claimPending?: boolean;
  removePending?: boolean;
}) {
  return (
    <tr className={ui.tableRow}>
      <td className="w-12 px-4 py-3 text-sm font-medium text-slate-500">{turn ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <span className={ui.avatarInitialsSm} aria-hidden>
            {displayInitials(member.displayName)}
          </span>
          <div className="min-w-0">
            <p className="font-medium text-slate-900">{member.displayName}</p>
            <p className="text-xs text-slate-500">
              {member.isManager && "Organizer · "}
              {member.isPlaceholder ? "Placeholder" : "Member"}
            </p>
          </div>
        </div>
      </td>
      <td className="hidden px-4 py-3 text-sm text-slate-500 sm:table-cell">{member.contact ?? "—"}</td>
      {managerView && (
        <td className="px-4 py-3 text-right">
          {member.isPlaceholder && (
            <div className="flex flex-wrap justify-end gap-2">
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
          {claimUrl && (
            <div className="mt-2">
              <CopyableLink url={claimUrl} label="Claim link" compact />
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

function OpenSlotRow() {
  return (
    <tr className={ui.tableRow}>
      <td className="px-4 py-3 text-sm text-slate-400">—</td>
      <td className="px-4 py-3 text-sm text-slate-400" colSpan={3}>
        Open slot
      </td>
    </tr>
  );
}

function OrderRow({
  member,
  position,
  draggable,
  isDragging,
  isDragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  member: GroupMember;
  position: number;
  draggable: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  return (
    <li
      draggable={draggable}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", member.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex items-center gap-4 border-b border-gray-50 px-4 py-3 last:border-0 ${
        draggable ? "cursor-grab active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-40" : ""} ${isDragOver ? "bg-emerald-50/80" : ""}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-900 text-sm font-medium text-white">
        {position}
      </span>
      <span className={ui.avatarInitialsSm} aria-hidden>
        {displayInitials(member.displayName)}
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{member.displayName}</span>
      {draggable && (
        <span className="text-xs text-slate-400" aria-hidden>
          Drag
        </span>
      )}
    </li>
  );
}

export function FormingManagerPanel({
  group,
  members: _members,
  sortedMembers,
  pending,
  rosterFilled,
  displayStartDate,
  readyToActivate,
  payoutDraftActive,
  manualOrder,
  addName,
  addContact,
  inviteUrl,
  claimUrls,
  addMemberPending,
  removeMemberPending,
  claimInvitePending,
  groupInvitePending,
  lockingInPayout,
  saveStartDatePending,
  activatePending,
  deleteGroupPending,
  onAddNameChange,
  onAddContactChange,
  onAddMember,
  onRemoveMember,
  onClaimInvite,
  onGroupInvite,
  onReorderMembers,
  onRandomize,
  onLockIn,
  onBeginDraft,
  onStartDateChange,
  onSaveStartDate,
  onActivate,
  onDeleteGroup,
}: {
  group: GroupDetail["group"];
  members: GroupMember[];
  sortedMembers: GroupMember[];
  pending: FormingPending;
  rosterFilled: number;
  rosterFillPercent: number;
  displayStartDate: string;
  readyToActivate: boolean;
  payoutDraftActive: boolean;
  manualOrder: Record<string, number>;
  addName: string;
  addContact: string;
  inviteUrl: string | null;
  claimUrls: Record<string, string>;
  addMemberPending: boolean;
  removeMemberPending: boolean;
  claimInvitePending: boolean;
  groupInvitePending: boolean;
  lockingInPayout: boolean;
  saveStartDatePending: boolean;
  activatePending: boolean;
  deleteGroupPending: boolean;
  onAddNameChange: (value: string) => void;
  onAddContactChange: (value: string) => void;
  onAddMember: (e: FormEvent) => void;
  onRemoveMember: (memberId: string) => void;
  onClaimInvite: (memberId: string) => void;
  onGroupInvite: () => void;
  onReorderMembers: (orderedMemberIds: string[]) => void;
  onRandomize: () => void;
  onLockIn: () => void;
  onBeginDraft: () => void;
  onStartDateChange: (value: string) => void;
  onSaveStartDate: () => void;
  onActivate: () => void;
  onDeleteGroup: () => void;
}) {
  const rosterDone = pending.openSlots === 0;
  const orderDone = !pending.payoutOrder;
  const startDone = !pending.startDateMissing;
  const orderLocked = orderDone && !payoutDraftActive;

  const defaultTab: ManagerTab = !rosterDone ? "members" : !orderDone ? "order" : "start";
  const [tab, setTab] = useState<ManagerTab>(defaultTab);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    setTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (tab === "order" && rosterDone && !orderLocked && !payoutDraftActive) {
      onBeginDraft();
    }
  }, [tab, rosterDone, orderLocked, payoutDraftActive, onBeginDraft]);

  const getTurn = (member: GroupMember) => manualOrder[member.id] ?? member.turnNumber ?? null;

  const orderedMembers = useMemo(() => {
    if (!rosterDone) return sortedMembers;
    return [...sortedMembers].sort((a, b) => {
      const turnA = getTurn(a);
      const turnB = getTurn(b);
      if (turnA != null && turnB != null) return turnA - turnB;
      if (turnA != null) return -1;
      if (turnB != null) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [rosterDone, sortedMembers, manualOrder]);

  const canDragOrder = tab === "order" && rosterDone && !orderLocked;

  function handleDropOnMember(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = orderedMembers.map((m) => m.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    onReorderMembers(ids);
    setDragId(null);
    setDragOverId(null);
  }

  const pot = `₱${(Number(group.contributionAmount) * group.slotCount).toLocaleString()}`;

  const navItems: SectionNavItem[] = [
    { id: "members", label: "Members" },
    { id: "order", label: "Payout order", disabled: !rosterDone },
    { id: "start", label: "Launch", disabled: !rosterDone || !orderDone },
  ];

  return (
    <div className="space-y-6">
      <div className={ui.sectionCard}>
        <p className="text-sm text-slate-600">
          Finish setup to open Round 1. Pot size: <span className="font-medium text-slate-900">{pot}</span>
        </p>
        <div className="mt-4">
          <SetupChecklist
            rosterDone={rosterDone}
            orderDone={orderDone}
            startDone={startDone}
            needsStartDate={pending.startDateMissing}
            ready={readyToActivate}
          />
        </div>
      </div>

      <GroupSectionLayout items={navItems} active={tab} onSelect={(id) => setTab(id as ManagerTab)}>
        {tab === "members" && (
          <section className={`${ui.sectionCard} space-y-6`}>
            <div>
              <h2 className={ui.sectionHeader}>
                Members ({rosterFilled}/{group.slotCount})
              </h2>
              <p className={ui.sectionSubtitle}>
                Add everyone who will join this cycle. Placeholders work for people without accounts yet.
              </p>
            </div>

            <div className={ui.tableWrap}>
              <table className="w-full min-w-[28rem] text-left text-sm">
                <thead className={ui.tableHead}>
                  <tr>
                    <th className="px-4 py-2.5 font-normal">Turn</th>
                    <th className="px-4 py-2.5 font-normal">Name</th>
                    <th className="hidden px-4 py-2.5 font-normal sm:table-cell">Contact</th>
                    <th className="px-4 py-2.5 text-right font-normal">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedMembers.map((member) => (
                    <MemberTableRow
                      key={member.id}
                      member={member}
                      turn={orderDone ? getTurn(member) : null}
                      managerView
                      claimUrl={claimUrls[member.id]}
                      onClaimInvite={() => onClaimInvite(member.id)}
                      onRemoveMember={() => onRemoveMember(member.id)}
                      claimPending={claimInvitePending}
                      removePending={removeMemberPending}
                    />
                  ))}
                  {pending.openSlots > 0 &&
                    Array.from({ length: pending.openSlots }).map((_, i) => <OpenSlotRow key={`open-${i}`} />)}
                </tbody>
              </table>
            </div>

            {pending.openSlots > 0 && (
              <div className="grid gap-6 border-t border-gray-100 pt-6 md:grid-cols-2">
                <form onSubmit={onAddMember} className="space-y-3">
                  <p className="text-sm font-medium text-slate-900">Add placeholder</p>
                  <input
                    required
                    value={addName}
                    onChange={(e) => onAddNameChange(e.target.value)}
                    placeholder="Name"
                    className={ui.input}
                  />
                  <input
                    value={addContact}
                    onChange={(e) => onAddContactChange(e.target.value)}
                    placeholder="Contact (optional)"
                    className={ui.input}
                  />
                  <button type="submit" disabled={addMemberPending} className={ui.btnPrimarySm}>
                    {addMemberPending ? "Adding…" : "Add"}
                  </button>
                </form>
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-900">Invite link</p>
                  {inviteUrl ? (
                    <CopyableLink url={inviteUrl} label="Group invite" compact />
                  ) : (
                    <button
                      type="button"
                      onClick={onGroupInvite}
                      disabled={groupInvitePending}
                      className={ui.btnSecondary}
                    >
                      {groupInvitePending ? "Generating…" : "Generate invite link"}
                    </button>
                  )}
                </div>
              </div>
            )}

            {rosterDone && (
              <div className={ui.actionBar}>
                <button type="button" onClick={() => setTab("order")} className={ui.btnPrimary}>
                  Continue to payout order
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "order" && rosterDone && (
          <section className={`${ui.sectionCard} space-y-5`}>
            <div>
              <h2 className={ui.sectionHeader}>Payout order</h2>
              <p className={ui.sectionSubtitle}>
                Turn 1 gets the pot first. Drag rows to reorder, or randomize. Lock in when ready.
              </p>
            </div>

            {orderLocked ? (
              <p className={ui.success}>Payout order locked in.</p>
            ) : (
              <p className={ui.warning}>Draft — not saved until you lock in.</p>
            )}

            <ol className="overflow-hidden rounded-xl border border-gray-100">
              {orderedMembers.map((member, index) => (
                <OrderRow
                  key={member.id}
                  member={member}
                  position={index + 1}
                  draggable={canDragOrder}
                  isDragging={dragId === member.id}
                  isDragOver={dragOverId === member.id && dragId !== member.id}
                  onDragStart={() => setDragId(member.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setDragOverId(null);
                  }}
                  onDragOver={(e) => {
                    if (!canDragOrder || !dragId) return;
                    e.preventDefault();
                    setDragOverId(member.id);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    handleDropOnMember(member.id);
                  }}
                />
              ))}
            </ol>

            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onRandomize} className={ui.btnOutline}>
                Randomize
              </button>
              {!orderLocked && (
                <button type="button" onClick={onLockIn} disabled={lockingInPayout} className={ui.btnPrimary}>
                  {lockingInPayout ? "Locking in…" : "Lock in order"}
                </button>
              )}
              {orderLocked && (
                <button type="button" onClick={() => onBeginDraft()} className={ui.btnSecondary}>
                  Edit order
                </button>
              )}
            </div>

            {orderDone && (
              <div className={ui.actionBar}>
                <button type="button" onClick={() => setTab("start")} className={ui.btnPrimary}>
                  Continue to launch
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "start" && rosterDone && orderDone && (
          <section className={`${ui.sectionCard} space-y-6`}>
            <div>
              <h2 className={ui.sectionHeader}>Launch</h2>
              <p className={ui.sectionSubtitle}>Review the terms and open Round 1.</p>
            </div>

            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Contribution</dt>
                <dd className="font-medium text-slate-900">
                  ₱{Number(group.contributionAmount).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Schedule</dt>
                <dd className="font-medium text-slate-900">
                  {formatFrequency(group.frequency, group.frequencyDays)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Round pot</dt>
                <dd className="font-medium text-slate-900">{pot}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Shortfall interest</dt>
                <dd className="font-medium text-slate-900">
                  {formatShortfallInterestRate(
                    group.shortfallInterestRatePercent,
                    group.frequency,
                    group.frequencyDays,
                  )}
                </dd>
              </div>
            </dl>

            {pending.startDateMissing && (
              <div className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
                <div className="min-w-[12rem] flex-1">
                  <label htmlFor="formingStartDate" className={ui.label}>
                    First round due
                  </label>
                  <input
                    id="formingStartDate"
                    type="date"
                    value={displayStartDate}
                    onChange={(e) => onStartDateChange(e.target.value)}
                    className={ui.input}
                  />
                </div>
                <button
                  type="button"
                  onClick={onSaveStartDate}
                  disabled={saveStartDatePending || !displayStartDate}
                  className={ui.btnSecondary}
                >
                  {saveStartDatePending ? "Saving…" : "Save date"}
                </button>
              </div>
            )}

            {!pending.startDateMissing && displayStartDate && (
              <p className="text-sm text-slate-600">
                First round due{" "}
                <span className="font-medium text-slate-900">{formatGroupDate(displayStartDate)}</span>
              </p>
            )}

            {pending.unclaimedSeats > 0 && (
              <p className="text-xs text-slate-500">
                {pending.unclaimedSeats} unclaimed placeholder
                {pending.unclaimedSeats === 1 ? "" : "s"} on the roster.
              </p>
            )}

            <div className={ui.actionBar}>
              <button
                type="button"
                onClick={onActivate}
                disabled={!readyToActivate || activatePending}
                className={ui.btnPrimary}
              >
                {activatePending ? "Starting…" : "Start paluwagan"}
              </button>
            </div>
          </section>
        )}
      </GroupSectionLayout>

      <div className="flex justify-end">
        <button type="button" onClick={onDeleteGroup} disabled={deleteGroupPending} className={ui.btnDangerGhost}>
          {deleteGroupPending ? "Deleting…" : "Delete paluwagan"}
        </button>
      </div>
    </div>
  );
}

function memberStatusMessage(pending: FormingPending): string {
  if (pending.openSlots > 0) {
    return `Waiting for ${pending.openSlots} more member${pending.openSlots === 1 ? "" : "s"}.`;
  }
  if (pending.payoutOrder) return "Organizer is setting payout order.";
  if (pending.startDateMissing) return "Organizer is picking a start date.";
  return "Setup is complete — waiting for the organizer to start.";
}

export function FormingMemberPanel({
  group,
  members,
  sortedMembers,
  pending,
  rosterFilled,
  displayStartDate,
  onLeave,
  leavePending,
}: {
  group: FormingGroup;
  members: GroupMember[];
  sortedMembers: GroupMember[];
  pending: FormingPending;
  rosterFilled: number;
  rosterFillPercent: number;
  displayStartDate: string;
  onLeave: () => void;
  leavePending: boolean;
}) {
  const { user } = useAuth();
  const myMembership = members.find((m) => m.userId === user?.id);
  const manager = members.find((m) => m.isManager);
  const rosterDone = pending.openSlots === 0;
  const orderDone = !pending.payoutOrder;
  const startDone = !pending.startDateMissing;
  const [tab, setTab] = useState<MemberTab>("members");

  const displayMembers = useMemo(() => {
    if (!orderDone) return sortedMembers;
    return [...sortedMembers].sort((a, b) => {
      if (a.turnNumber != null && b.turnNumber != null) return a.turnNumber - b.turnNumber;
      if (a.turnNumber != null) return -1;
      if (b.turnNumber != null) return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [orderDone, sortedMembers]);

  const navItems: SectionNavItem[] = [
    { id: "members", label: "Members" },
    { id: "order", label: "Payout order" },
    { id: "terms", label: "Terms" },
  ];

  return (
    <div className="space-y-6">
      <div className={ui.callout}>
        <p className="text-sm font-medium text-emerald-900">Forming</p>
        <p className="mt-1 text-sm text-emerald-800/90">{memberStatusMessage(pending)}</p>
        <div className="mt-4">
          <SetupChecklist
            rosterDone={rosterDone}
            orderDone={orderDone}
            startDone={startDone}
            needsStartDate={pending.startDateMissing}
            ready={rosterDone && orderDone && startDone}
          />
        </div>
      </div>

      {myMembership && (
        <div className={ui.cardFlat}>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Your seat</p>
          <p className="mt-1 text-lg font-medium text-slate-900">{myMembership.displayName}</p>
          {myMembership.turnNumber != null ? (
            <p className="mt-1 text-sm text-slate-600">
              Payout turn #{myMembership.turnNumber} of {group.slotCount}
            </p>
          ) : (
            <p className="mt-1 text-sm text-slate-600">Turn assigned after payout order is set.</p>
          )}
        </div>
      )}

      <GroupSectionLayout items={navItems} active={tab} onSelect={(id) => setTab(id as MemberTab)}>
        {tab === "members" && (
          <section className={ui.sectionCard}>
            <h2 className={ui.sectionHeader}>
              Members ({rosterFilled}/{group.slotCount})
            </h2>
            <div className={`${ui.tableWrap} mt-4`}>
              <table className="w-full min-w-[24rem] text-left text-sm">
                <thead className={ui.tableHead}>
                  <tr>
                    <th className="px-4 py-2.5 font-normal">Turn</th>
                    <th className="px-4 py-2.5 font-normal">Name</th>
                    <th className="hidden px-4 py-2.5 font-normal sm:table-cell">Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {displayMembers.map((member) => (
                    <MemberTableRow
                      key={member.id}
                      member={member}
                      turn={orderDone ? member.turnNumber : null}
                      managerView={false}
                    />
                  ))}
                  {pending.openSlots > 0 &&
                    Array.from({ length: pending.openSlots }).map((_, i) => <OpenSlotRow key={`open-${i}`} />)}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {tab === "order" && (
          <section className={ui.sectionCard}>
            <h2 className={ui.sectionHeader}>Payout order</h2>
            {orderDone ? (
              <ol className="mt-4 overflow-hidden rounded-xl border border-gray-100">
                {displayMembers.map((member, index) => (
                  <OrderRow
                    key={member.id}
                    member={member}
                    position={member.turnNumber ?? index + 1}
                    draggable={false}
                    isDragging={false}
                    isDragOver={false}
                    onDragStart={() => {}}
                    onDragEnd={() => {}}
                    onDragOver={() => {}}
                    onDrop={() => {}}
                  />
                ))}
              </ol>
            ) : (
              <p className={`${ui.sectionSubtitle} mt-2`}>
                The organizer hasn&apos;t set the payout order yet. Turns appear here once it&apos;s locked in.
              </p>
            )}
          </section>
        )}

        {tab === "terms" && (
          <section className={ui.sectionCard}>
            <h2 className={ui.sectionHeader}>Terms</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Organizer</dt>
                <dd className="font-medium text-slate-900">{manager?.displayName ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Contribution</dt>
                <dd className="font-medium text-slate-900">
                  ₱{Number(group.contributionAmount).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Schedule</dt>
                <dd className="font-medium text-slate-900">
                  {formatFrequency(group.frequency, group.frequencyDays)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Round 1 due</dt>
                <dd className="font-medium text-slate-900">
                  {startDone ? formatGroupDate(displayStartDate || group.startDate) : "Not set yet"}
                </dd>
              </div>
            </dl>
          </section>
        )}
      </GroupSectionLayout>

      <div className="flex justify-end">
        <button type="button" onClick={onLeave} disabled={leavePending} className={ui.btnDangerGhost}>
          {leavePending ? "Leaving…" : "Leave group"}
        </button>
      </div>
    </div>
  );
}
