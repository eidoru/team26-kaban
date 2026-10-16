import { type ReactNode, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Ban, CalendarClock, CircleCheck, CloudOff, Hourglass, Lock, Rocket, Shuffle, Users } from "lucide-react";
import { ApiError, api, type GroupDetail, type SlotView } from "../../api/client";
import { ActionBar } from "../../components/flow/ActionBar";
import { NowPanel } from "../../components/flow/NowPanel";
import { useDialog } from "../../context/DialogContext";
import { formatDueDate } from "../../lib/dates";
import { useDemoToolsSetting } from "../../lib/devTools";
import { groupKey, useGroup, useGroupActions } from "../../lib/groupQueries";
import { invalidateHomeLists } from "../../lib/homeQueries";
import { formatPeso } from "../../lib/money";
import { ui } from "../../lib/ui";
import { useGroupRealtime } from "../../lib/useGroupRealtime";
import { GroupDetails } from "./GroupDetails";
import { InviteSheet, SlotSheet } from "./GroupSheets";
import { PayoutSchedule } from "./PayoutSchedule";
import { currentOrder } from "./slots";
import { SlotsList } from "./SlotsList";

const STATE_LABELS: Record<GroupDetail["group"]["state"], string> = {
  LOBBY: "In the lobby",
  LAUNCHED: "Launched",
  ACTIVE: "Running",
  COMPLETED: "Completed",
  COMPLETED_WITH_OUTSTANDING_DEBT: "Completed, debts open",
  CANCELLED: "Cancelled",
};

export function GroupPage() {
  const { id = "" } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { realtimeActive } = useGroupRealtime({
    groupId: id,
    enabled: !!id,
    onUpdate: () => void queryClient.invalidateQueries({ queryKey: groupKey(id) }),
  });
  // Poll only while the live channel isn't up.
  const { data: detail, error, refetch, isFetching } = useGroup(id, realtimeActive ? false : 15_000);

  if (error instanceof ApiError && error.status === 404) {
    return (
      <div className={ui.emptyState}>
        <p className="font-heading text-lg font-bold text-ink-900">This paluwagan isn&apos;t available</p>
        <p className={`mt-1 text-sm ${ui.muted}`}>It may have been cancelled, or you&apos;re no longer a member.</p>
        <Link to="/home" className={`mt-5 ${ui.btnPrimarySm}`}>
          Go home
        </Link>
      </div>
    );
  }
  if (error && !detail) {
    return (
      <div className={`${ui.emptyState} flex flex-col items-center`} role="alert">
        <CloudOff className="h-8 w-8 text-danger-600" aria-hidden />
        <p className="font-heading mt-3 text-lg font-bold text-ink-900">Couldn&apos;t load this paluwagan</p>
        <button type="button" onClick={() => void refetch()} disabled={isFetching} className={`mt-5 ${ui.btnPrimarySm}`}>
          {isFetching ? "Retrying…" : "Try again"}
        </button>
      </div>
    );
  }
  if (!detail) return <GroupSkeleton />;
  return <GroupView detail={detail} />;
}

function GroupSkeleton() {
  return (
    <div className="space-y-6" aria-busy>
      <div className={`${ui.skeleton} h-16 w-2/3`} />
      <div className={`${ui.skeleton} h-36`} />
      <div className={`${ui.skeleton} h-64`} />
    </div>
  );
}

function GroupView({ detail }: { detail: GroupDetail }) {
  const { group, viewer } = detail;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const dialog = useDialog();
  const { run, pending, error, clearError } = useGroupActions(group.id);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<string[] | null>(null);
  const [demoTools] = useDemoToolsSetting();
  const selectedSlot = detail.slots.find((s) => s.id === selectedSlotId) ?? null;

  const isOrganizer = viewer.isOrganizer;
  const inLobby = group.state === "LOBBY";
  const full = detail.openSlots === 0;
  const ordered = currentOrder(detail) !== null;
  const mySpot = detail.schedule.find((r) => r.recipientSlotId === viewer.slotId);

  async function removeSlot(slot: SlotView) {
    const confirmed = await dialog.confirm({
      title: slot.kind === "PLACEHOLDER" ? `Remove ${slot.name}?` : `Remove ${slot.name} from ${group.name}?`,
      description:
        slot.kind === "PLACEHOLDER"
          ? "Their slot opens up again, and any claim link stops working."
          : "They lose access, and their slot opens up again. They can rejoin with the invite link.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (confirmed && (await run("remove", () => api.removeSlot(group.id, slot.id)))) setSelectedSlotId(null);
  }

  async function cancelGroup() {
    const confirmed = await dialog.confirm({
      title: `Cancel ${group.name}?`,
      description: "Everyone is told it was cancelled, and the invite and claim links stop working. This can't be undone.",
      confirmLabel: "Cancel paluwagan",
      cancelLabel: "Keep it",
      variant: "danger",
    });
    if (confirmed) await run("cancel", () => api.cancelGroup(group.id));
  }

  async function leave() {
    const confirmed = await dialog.confirm({
      title: `Leave ${group.name}?`,
      description: "Your slot opens up for someone else. You can rejoin with the invite link while there's room.",
      confirmLabel: "Leave",
      variant: "danger",
    });
    if (!confirmed) return;
    try {
      await api.leaveGroup(group.id);
      queryClient.removeQueries({ queryKey: groupKey(group.id) });
      invalidateHomeLists(queryClient);
      navigate("/home", { replace: true });
    } catch (err) {
      await dialog.alert({ title: "Couldn't leave", description: err instanceof ApiError ? err.message : "Try again." });
    }
  }

  async function startNow() {
    await api.activateNow(group.id);
    await queryClient.invalidateQueries({ queryKey: groupKey(group.id) });
  }

  const selectSlot = isOrganizer && group.state !== "CANCELLED" ? (slot: SlotView) => setSelectedSlotId(slot.id) : undefined;

  // --- The viewer's next step (design rule: it comes first), and the one main action.
  let now: ReactNode;
  let primary: ReactNode = null;
  if (group.state === "LOBBY" && isOrganizer) {
    const blockers = detail.launch?.blockers ?? [];
    if (!full) {
      now = (
        <NowPanel
          tone="brand"
          icon={Users}
          eyebrow="Next step"
          title={`Fill ${detail.openSlots} open slot${detail.openSlots === 1 ? "" : "s"}`}
          body="Share the invite link, or add a placeholder for someone without an account."
        />
      );
      primary = (
        <button type="button" onClick={() => setInviteOpen(true)} className={ui.btnPrimary}>
          Invite members
        </button>
      );
    } else if (!group.orderLocked) {
      now = (
        <NowPanel
          tone="brand"
          icon={Shuffle}
          eyebrow="Next step"
          title={ordered ? "Lock the payout order" : "Set the payout order"}
          body={
            ordered
              ? "Check who gets paid when. Shuffle again or arrange it yourself, then lock it."
              : "Everyone's in. Shuffle for a random order, or arrange it yourself."
          }
        />
      );
      primary = ordered ? (
        <button type="button" onClick={() => void run("lock", () => api.lockOrder(group.id))} disabled={pending === "lock"} className={ui.btnPrimary}>
          <Lock className="h-4 w-4" aria-hidden />
          {pending === "lock" ? "Locking…" : "Lock payout order"}
        </button>
      ) : (
        <button type="button" onClick={() => void run("shuffle", () => api.shuffleOrder(group.id))} disabled={pending === "shuffle"} className={ui.btnPrimary}>
          <Shuffle className="h-4 w-4" aria-hidden />
          {pending === "shuffle" ? "Shuffling…" : "Shuffle order"}
        </button>
      );
    } else if (blockers.length > 0) {
      now = <NowPanel tone="danger" icon={CalendarClock} eyebrow="Before you launch" title="Move the start date" body={blockers.join(" ")} />;
      primary = (
        <Link to={`/groups/${group.id}/edit`} className={ui.btnPrimary}>
          Edit details
        </Link>
      );
    } else {
      now = (
        <NowPanel
          tone="brand"
          icon={Rocket}
          eyebrow="Next step"
          title="Ready to launch"
          body="Review everything once more. Launching locks the settings and the payout order."
        />
      );
      primary = (
        <Link to={`/groups/${group.id}/launch`} className={ui.btnPrimary}>
          Review and launch
        </Link>
      );
    }
  } else if (group.state === "LOBBY") {
    now = (
      <NowPanel
        tone="calm"
        icon={Hourglass}
        eyebrow="Waiting"
        title={full ? "Waiting for the organizer to launch" : "Waiting for everyone to join"}
        body={
          full
            ? "Every slot is filled. You'll get a notification when it launches."
            : `${detail.slots.length} of ${group.slotCount} slots are filled. You'll get a notification when it launches.`
        }
      />
    );
  } else if (group.state === "LAUNCHED") {
    now = (
      <NowPanel
        tone="sun"
        icon={CalendarClock}
        eyebrow="Launched"
        title={`Starts ${formatDueDate(group.startDate)}`}
        body={
          <>
            Contributions of {formatPeso(group.contribution)} open on that day.
            {mySpot && (
              <>
                {" "}
                You get the {formatPeso(group.pot)} pot in round {mySpot.number}, on {formatDueDate(mySpot.payoutDate)}.
              </>
            )}
          </>
        }
      >
        {isOrganizer && demoTools && (
          <button type="button" onClick={() => void startNow()} className={ui.btnSecondarySm}>
            Start now (demo)
          </button>
        )}
      </NowPanel>
    );
  } else if (group.state === "ACTIVE") {
    const open = detail.schedule.find((r) => r.status === "OPEN");
    now = (
      <NowPanel
        tone="brand"
        icon={CircleCheck}
        eyebrow={open ? `Round ${open.number} of ${group.slotCount}` : "Running"}
        title={open ? `Collecting for the ${formatDueDate(open.payoutDate)} payout` : "This paluwagan is running"}
        body="Recording payments isn't built yet. It comes with the next part of the rewrite."
      />
    );
  } else if (group.state === "CANCELLED") {
    now = <NowPanel tone="calm" icon={Ban} eyebrow="Cancelled" title="This paluwagan was cancelled" body="The organizer cancelled it before it launched." />;
  }

  return (
    <div className="min-w-0 space-y-8">
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{STATE_LABELS[group.state]}</p>
        <h1 className={`${ui.pageTitle} mt-1`}>{group.name}</h1>
        <p className="mt-1 text-sm text-ink-600">
          {formatPeso(group.contribution)} {group.frequencyLabel.toLowerCase()} · {group.slotCount} slots · pot{" "}
          {formatPeso(group.pot)}
        </p>
      </header>

      {now}
      {error && (
        <p className={ui.error} role="alert">
          {error.message}{" "}
          <button type="button" onClick={clearError} className="underline">
            Dismiss
          </button>
        </p>
      )}

      {/* Once everyone has a turn, the schedule lists every member too, so it replaces the member list. */}
      {!ordered && (
        <SlotsList
          detail={detail}
          onSelect={selectSlot}
          onOpenSlot={isOrganizer && inLobby ? () => setInviteOpen(true) : undefined}
        />
      )}
      <PayoutSchedule
        detail={detail}
        canArrange={isOrganizer && inLobby && full}
        draft={orderDraft}
        pending={pending}
        onDraftChange={setOrderDraft}
        onShuffle={() => void run("shuffle", () => api.shuffleOrder(group.id))}
        onSaveOrder={(slotIds) =>
          void run("order", () => api.setOrder(group.id, slotIds)).then((saved) => saved && setOrderDraft(null))
        }
        onSelect={selectSlot}
      />
      <GroupDetails detail={detail} onCancel={() => void cancelGroup()} />

      {inLobby && !isOrganizer && (
        <div className="text-center">
          <button type="button" onClick={() => void leave()} className={ui.btnDangerGhost}>
            Leave this paluwagan
          </button>
        </div>
      )}

      {/* While the order is being arranged, Save and Cancel are the only actions. */}
      {primary && !orderDraft && <ActionBar>{primary}</ActionBar>}

      {isOrganizer && inLobby && (
        <InviteSheet
          open={inviteOpen}
          detail={detail}
          pending={pending}
          onClose={() => setInviteOpen(false)}
          onCreateLink={() => void run("invite", () => api.createInviteLink(group.id))}
          onAddPlaceholder={async (input) => !!(await run("placeholder", () => api.addPlaceholder(group.id, input)))}
        />
      )}
      <SlotSheet
        slot={selectedSlot}
        detail={detail}
        pending={pending}
        onClose={() => setSelectedSlotId(null)}
        onCreateClaimLink={(slot) => void run("claim-link", () => api.createClaimLink(group.id, slot.id))}
        onRevokeClaimLink={(slot) => void run("claim-link", () => api.revokeClaimLink(group.id, slot.id))}
        onRemove={(slot) => void removeSlot(slot)}
      />
    </div>
  );
}
