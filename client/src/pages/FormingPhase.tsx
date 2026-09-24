import { type DragEvent, type FormEvent, useEffect, useMemo, useState } from "react";
import { Check, GripVertical, Link2, UserPlus } from "lucide-react";
import { Avatar } from "../components/Avatar";
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
  const currentIndex = items.findIndex((item) => !item.done);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {items.map((item, index) => {
        const current = index === currentIndex;
        return (
          <li key={item.label} className="flex items-center gap-2" aria-current={current ? "step" : undefined}>
            <span
              className={`inline-flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold ${
                item.done
                  ? "bg-brand-100 text-brand-800"
                  : current
                    ? "bg-sun-100 text-ink-900"
                    : "bg-ink-100 text-ink-500"
              }`}
            >
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  item.done
                    ? "bg-brand-600 text-white"
                    : current
                      ? "bg-sun-300 text-ink-900"
                      : "border-2 border-ink-200 bg-white text-ink-500"
                }`}
              >
                {item.done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden /> : index + 1}
              </span>
              {item.label}
            </span>
            {index < items.length - 1 && (
              <span
                aria-hidden
                className={`hidden h-0.5 w-4 rounded-full sm:block ${item.done ? "bg-brand-300" : "bg-ink-200"}`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function TurnChip({ turn }: { turn: number | null }) {
  return (
    <span
      className={`flex h-8 min-w-8 shrink-0 items-center justify-center rounded-full px-2 text-xs font-bold tabular-nums ${
        turn != null ? "bg-ink-100 text-ink-700" : "text-ink-400"
      }`}
      title={turn != null ? `Payout turn ${turn}` : "Turn not set"}
    >
      {turn != null ? `#${turn}` : "—"}
    </span>
  );
}

function TermTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-ink-50 px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-ink-900 tabular-nums">{value}</dd>
    </div>
  );
}

const memberListClass = "divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white";

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
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
      <TurnChip turn={turn} />
      <Avatar name={member.displayName} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-bold text-ink-900">{member.displayName}</p>
        <p className="truncate text-xs text-ink-500">
          {member.isManager && "Organizer · "}
          {member.isPlaceholder ? "Placeholder" : "Member"}
          {member.contact && ` · ${member.contact}`}
        </p>
      </div>
      {managerView && member.isPlaceholder && (
        <div className="flex shrink-0 flex-wrap justify-end gap-1">
          <button type="button" onClick={onClaimInvite} disabled={claimPending} className={ui.btnSecondarySm}>
            Claim link
          </button>
          {!member.isManager && (
            <button type="button" onClick={onRemoveMember} disabled={removePending} className={ui.btnDangerGhost}>
              Remove
            </button>
          )}
        </div>
      )}
      {managerView && claimUrl && (
        <div className="w-full sm:pl-[5.25rem]">
          <CopyableLink url={claimUrl} label="Claim link" compact />
        </div>
      )}
    </li>
  );
}

function OpenSlotRow() {
  return (
    <li className="flex items-center gap-3 px-4 py-3 text-sm font-semibold text-ink-500">
      <span className="h-8 w-8 shrink-0" aria-hidden />
      <span
        aria-hidden
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink-300 text-xs"
      >
        ?
      </span>
      Open seat
    </li>
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
      className={`flex items-center gap-3 border-b border-ink-100 px-4 py-3 transition-colors last:border-0 ${
        draggable ? "cursor-grab bg-white hover:bg-ink-50 active:cursor-grabbing" : ""
      } ${isDragging ? "opacity-40" : ""} ${isDragOver ? "bg-brand-50 ring-2 ring-inset ring-brand-300" : ""}`}
    >
      {draggable && <GripVertical className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />}
      <TurnChip turn={position} />
      <Avatar name={member.displayName} />
      <span className="min-w-0 flex-1 truncate font-bold text-ink-900">{member.displayName}</span>
      {position === 1 && (
        <span className="shrink-0 rounded-full bg-sun-100 px-2.5 py-0.5 text-xs font-bold text-sun-800">
          First payout
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

  // Picks the sensible starting tab (e.g. landing on "order" if the roster was already
  // full last time you visited) but only once, on mount. It intentionally does NOT keep
  // re-syncing afterward — completing the roster used to force-switch the tab to "order"
  // mid-edit, which is exactly the bug the "Continue to payout order" button below exists
  // to avoid: the user decides when to move on, not a background effect.
  const initialTab: ManagerTab = !rosterDone ? "members" : !orderDone ? "order" : "start";
  const [tab, setTab] = useState<ManagerTab>(initialTab);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

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
    { id: "start", label: "Launch", disabled: !rosterDone || !orderLocked },
  ];

  return (
    <div className="space-y-6">
      <div className={`${ui.sectionCard} space-y-4`}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Each round&apos;s pot</p>
            <p className="font-heading text-3xl font-bold tabular-nums text-ink-900">{pot}</p>
          </div>
          <p className="text-sm font-semibold text-ink-600">Finish setup to open Round 1.</p>
        </div>
        <div>
          <SetupChecklist
            rosterDone={rosterDone}
            orderDone={orderLocked}
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

            <ul className={memberListClass}>
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
            </ul>

            {/* Stays mounted so it can animate closed when the last slot fills, instead of
                vanishing in a single frame. Collapses via the grid-rows 1fr → 0fr technique (no
                animation library needed); `mb-0` cancels the parent's space-y gap while collapsed,
                and `inert` keeps the hidden inputs out of tab order and the accessibility tree. */}
            <div
              className={`grid transition-all duration-300 ease-out ${
                pending.openSlots > 0 ? "grid-rows-[1fr] opacity-100" : "mb-0 grid-rows-[0fr] opacity-0"
              }`}
              inert={pending.openSlots === 0}
            >
              <div className="min-h-0 overflow-hidden">
                <div className="grid gap-6 border-t border-ink-100 pt-6 md:grid-cols-2">
                  <form onSubmit={onAddMember} className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-ink-900">
                      <UserPlus className="h-4 w-4 text-brand-700" aria-hidden />
                      Add placeholder
                    </p>
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
                    <p className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
                      <Link2 className="h-4 w-4 text-brand-700" aria-hidden />
                      Invite link
                    </p>
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
              </div>
            </div>

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

            <ol className="overflow-hidden rounded-3xl border border-ink-200 bg-white">
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
              {!orderLocked && (
                <button type="button" onClick={onRandomize} className={ui.btnOutline}>
                  Randomize
                </button>
              )}
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

            {/* orderLocked, not orderDone: randomize/drag write draft turn numbers into the
                cache before anything is saved, so only a locked-in order may move on. */}
            {orderLocked && (
              <div className={ui.actionBar}>
                <button type="button" onClick={() => setTab("start")} className={ui.btnPrimary}>
                  Continue to launch
                </button>
              </div>
            )}
          </section>
        )}

        {tab === "start" && rosterDone && orderLocked && (
          <section className={`${ui.sectionCard} space-y-6`}>
            <div>
              <h2 className={ui.sectionHeader}>Launch</h2>
              <p className={ui.sectionSubtitle}>Review the terms and open Round 1.</p>
            </div>

            <dl className="grid gap-2 sm:grid-cols-2">
              <TermTile label="Contribution" value={`₱${Number(group.contributionAmount).toLocaleString()}`} />
              <TermTile label="Schedule" value={formatFrequency(group.frequency, group.frequencyDays)} />
              <TermTile label="Round pot" value={pot} />
              <TermTile
                label="Shortfall interest"
                value={formatShortfallInterestRate(
                  group.shortfallInterestRatePercent,
                  group.frequency,
                  group.frequencyDays,
                )}
              />
            </dl>

            {pending.startDateMissing && (
              <div className="flex flex-wrap items-end gap-3 border-t border-ink-100 pt-4">
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
              <p className="text-sm text-ink-600">
                First round due{" "}
                <span className="font-bold text-ink-900">{formatGroupDate(displayStartDate)}</span>
              </p>
            )}

            {pending.unclaimedSeats > 0 && (
              <p className="text-xs text-ink-500">
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
      <div className={`${ui.sectionCard} space-y-4`}>
        <div>
          <span className={ui.badgeForming}>Forming</span>
          <p className="font-heading mt-2 text-lg font-bold text-ink-900">{memberStatusMessage(pending)}</p>
        </div>
        <div>
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
        <div className="flex items-center gap-4 rounded-3xl border-2 border-sun-200 bg-sun-100 p-5">
          <Avatar name={myMembership.displayName} size="md" className="ring-2 ring-white" />
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-wide text-sun-800">Your seat</p>
            <p className="font-heading truncate text-lg font-bold text-ink-900">{myMembership.displayName}</p>
            {myMembership.turnNumber != null ? (
              <p className="text-sm text-ink-700">
                Payout turn <span className="font-bold text-ink-900">#{myMembership.turnNumber}</span> of{" "}
                {group.slotCount}
              </p>
            ) : (
              <p className="text-sm text-ink-700">Turn assigned after payout order is set.</p>
            )}
          </div>
        </div>
      )}

      <GroupSectionLayout items={navItems} active={tab} onSelect={(id) => setTab(id as MemberTab)}>
        {tab === "members" && (
          <section className={ui.sectionCard}>
            <h2 className={ui.sectionHeader}>
              Members ({rosterFilled}/{group.slotCount})
            </h2>
            <ul className={`${memberListClass} mt-4`}>
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
            </ul>
          </section>
        )}

        {tab === "order" && (
          <section className={ui.sectionCard}>
            <h2 className={ui.sectionHeader}>Payout order</h2>
            {orderDone ? (
              <ol className="mt-4 overflow-hidden rounded-3xl border border-ink-200 bg-white">
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
            <dl className="mt-4 grid gap-2 sm:grid-cols-2">
              <TermTile label="Organizer" value={manager?.displayName ?? "—"} />
              <TermTile label="Contribution" value={`₱${Number(group.contributionAmount).toLocaleString()}`} />
              <TermTile label="Schedule" value={formatFrequency(group.frequency, group.frequencyDays)} />
              <TermTile
                label="Round 1 due"
                value={startDone ? formatGroupDate(displayStartDate || group.startDate) : "Not set yet"}
              />
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
