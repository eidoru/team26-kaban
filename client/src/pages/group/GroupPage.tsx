import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Ban,
  Banknote,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  CloudOff,
  HandCoins,
  Hourglass,
  Lock,
  Rocket,
  Shuffle,
  Users,
} from "lucide-react";
import {
  ApiError,
  api,
  type DisputeView,
  type GroupDetail,
  type SlotView,
  type SubmissionView,
  type SwapView,
} from "../../api/client";
import { ActionBar } from "../../components/flow/ActionBar";
import { NowPanel } from "../../components/flow/NowPanel";
import { useDialog } from "../../context/DialogContext";
import { dueHint, formatDueDate } from "../../lib/dates";
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
import { PaySheet, type PayMode } from "./active/PaySheet";
import { PayoutSheet } from "./active/PayoutSheet";
import { debtReportable, owedBy, payoutToActOn, reviewItems, standingOf, type ReviewItem } from "./active/period";
import { DebtsList, MyPayments, PeriodCard, PeriodStatusList, RefundsOwed } from "./active/PeriodSections";
import { DisputeSheet } from "./active/DisputeSheet";
import { SwapSheet, SwapsList } from "./swaps/SwapSections";
import { Recap, RecordsSection } from "./records/RecordsSections";
import { MoneyOverview, Trends, YourTurn } from "./dashboard/StatsSections";
import { swapToActOn } from "./swaps/swaps";
import { ReviewSheet } from "./active/ReviewSheet";
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
  const started = group.state === "ACTIVE" || group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT";
  // Under the group's key, so every group refresh (realtime included) refreshes it too.
  const { data: stats } = useQuery({
    queryKey: [...groupKey(group.id), "stats"],
    queryFn: () => api.stats(group.id),
    enabled: started,
  });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [orderDraft, setOrderDraft] = useState<string[] | null>(null);
  // Home's "Pay" links here with ?pay=contribution|debt to open the pay sheet straight away.
  const [searchParams, setSearchParams] = useSearchParams();
  const [payTarget, setPayTarget] = useState<{ slotId: string; mode: PayMode } | null>(() => {
    const pay = searchParams.get("pay");
    return pay === "debt" || pay === "contribution"
      ? { slotId: viewer.slotId, mode: pay === "debt" ? "DEBT_PAYMENT" : "CONTRIBUTION" }
      : null;
  });
  useEffect(() => {
    if (searchParams.has("pay")) setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);
  const [payoutRound, setPayoutRound] = useState<number | null>(null);
  const [disputeForId, setDisputeForId] = useState<string | null>(null);
  const [swapWithSlotId, setSwapWithSlotId] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
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

  async function closeRoundNow() {
    const confirmed = await dialog.confirm({
      title: "Close this round now? (demo)",
      description: "Skips to the payout date: shortfalls become debt, the payout is worked out, and the next round opens.",
      confirmLabel: "Close round",
    });
    if (!confirmed) return;
    await api.closeRoundNow(group.id);
    await queryClient.invalidateQueries({ queryKey: groupKey(group.id) });
  }

  const pay = (slotId: string, mode: PayMode) => setPayTarget({ slotId, mode });

  /** Raise a dispute from the sheet; failures surface in the sheet. */
  async function raiseDispute(input: { submissionId: string; proposedAmount: number; reason: string }) {
    let message = "";
    const saved = await run("dispute", () => api.raiseDispute(group.id, input), { onError: (e) => (message = e.message) });
    if (!saved) {
      clearError();
      throw new Error(message);
    }
    return true;
  }

  async function withdrawDispute(dispute: DisputeView) {
    const confirmed = await dialog.confirm({
      title: "Withdraw this dispute?",
      description: `The payment stays at ${formatPeso(dispute.previousAmount)}. You can dispute it again before the payout.`,
      confirmLabel: "Withdraw",
      variant: "danger",
    });
    if (confirmed) await run(`withdraw-dispute-${dispute.id}`, () => api.cancelDispute(group.id, dispute.id));
  }

  const approveItem = async (review: ReviewItem) =>
    !!(await run("approve", () =>
      review.kind === "dispute"
        ? api.approveDispute(group.id, review.item.id)
        : api.approveSubmission(group.id, review.item.id),
    ));
  const denyItem = async (review: ReviewItem, reason: string) =>
    !!(await run("deny", () =>
      review.kind === "dispute"
        ? api.denyDispute(group.id, review.item.id, reason)
        : api.denySubmission(group.id, review.item.id, reason),
    ));

  /** Submit from the pay sheet; failures surface in the sheet, not behind it. */
  async function submitPayment(input: {
    slotId: string;
    type: PayMode;
    amount: number;
    proofPath?: string;
    note?: string;
  }) {
    let message = "";
    const saved = await run("pay", () => api.submitPayment(group.id, input), { onError: (e) => (message = e.message) });
    if (!saved) {
      clearError();
      throw new Error(message);
    }
    return true;
  }

  async function withdraw(submission: SubmissionView) {
    const confirmed = await dialog.confirm({
      title: "Withdraw this payment report?",
      description: "The organizer won't review it. You can report the payment again later.",
      confirmLabel: "Withdraw",
      variant: "danger",
    });
    if (confirmed) await run(`withdraw-${submission.id}`, () => api.cancelSubmission(group.id, submission.id));
  }

  // While it runs, tapping someone's turn asks to swap (§9); otherwise organizers open slot actions.
  const selectSlot =
    group.state === "ACTIVE"
      ? (slot: SlotView) => setSwapWithSlotId(slot.id)
      : isOrganizer && group.state !== "CANCELLED"
        ? (slot: SlotView) => setSelectedSlotId(slot.id)
        : undefined;

  const swapAction = (swap: SwapView, call: () => Promise<GroupDetail>) => void run(`swap-${swap.id}`, call);
  async function denySwap(swap: SwapView) {
    const note = await dialog.prompt({
      title: "Deny this swap?",
      label: "Why not?",
      required: true,
      multiline: true,
      submitLabel: "Deny swap",
    });
    if (note?.trim()) await run(`swap-${swap.id}`, () => api.denySwap(group.id, swap.id, note.trim()));
  }

  // The swap the Now panel shows with its actions; the swaps list leaves it out.
  let nowSwapId: string | undefined;

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
  } else if (group.state === "ACTIVE" || group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT") {
    const period = detail.period;
    const mine = period ? standingOf(detail, viewer.slotId) : null;
    const queue = isOrganizer ? reviewItems(detail) : [];
    const payout = payoutToActOn(detail);
    const swapTask = swapToActOn(detail);
    /** "Your round 3 (Feb 1)" / "Mia's round 2 (Jan 1)", for the swap panel. */
    const turnLine = (slotId: string) => {
      const slot = detail.slots.find((x) => x.id === slotId);
      const round = detail.schedule.find((r) => r.recipientSlotId === slotId);
      return `${slot?.isViewer ? "Your" : `${slot?.name}'s`} round ${round?.number} (${round ? formatDueDate(round.payoutDate) : ""})`;
    };
    const payButton = (
      <button type="button" onClick={() => pay(viewer.slotId, "CONTRIBUTION")} className={ui.btnPrimary}>
        <HandCoins className="h-4 w-4" aria-hidden />
        {isOrganizer ? "Record your payment" : "Report a payment"}
      </button>
    );
    const owed = owedBy(detail, viewer.slotId);
    const debtLeft = debtReportable(detail, viewer.slotId);
    const hint = period ? dueHint(period.payoutDate) : null;
    // The date itself is on the round card; here, how long is left.
    const due = hint ? `Due ${hint.label}.` : "";
    const owingSlots = detail.slots.filter((s) => s.debt.principal + s.debt.interest > 0);

    if (queue.length > 0) {
      // Members are waiting on the organizer's reviews (R-SUB-03, R-DSP-02).
      const disputes = queue.filter((q) => q.kind === "dispute").length;
      const payments = queue.length - disputes;
      const parts = [
        disputes > 0 && `${disputes} dispute${disputes === 1 ? "" : "s"}`,
        payments > 0 && `${payments} payment${payments === 1 ? "" : "s"}`,
      ].filter(Boolean);
      now = (
        <NowPanel
          tone="sun"
          icon={ClipboardCheck}
          eyebrow="Needs you"
          title={`${parts.join(" and ")} to review`}
          body={
            disputes > 0
              ? "Disputes first: they expire at the payout if you don't decide."
              : "Oldest first. They count once you approve them."
          }
        />
      );
      primary = (
        <button type="button" onClick={() => setReviewOpen(true)} className={ui.btnPrimary}>
          Review payments
        </button>
      );
    } else if (payout) {
      const recipient = detail.slots.find((s) => s.id === payout.recipientSlotId);
      const confirming = payout.status === "HANDED_OVER";
      // The organizer already holds the pot they collected; taking their own payout is one step.
      const ownPayout = isOrganizer && !!recipient?.isViewer;
      now = (
        <NowPanel
          tone="sun"
          icon={Banknote}
          eyebrow={`Round ${payout.round} payout`}
          title={
            confirming
              ? `Did you get ${formatPeso(payout.net)}?`
              : ownPayout
                ? `Take your ${formatPeso(payout.net)} payout`
                : `Hand ${formatPeso(payout.net)} to ${recipient?.name}`
          }
          body={
            confirming
              ? "Confirm once it's in your hands, so everyone sees it was paid."
              : ownPayout
                ? "You're holding the collected pot. Mark it received so everyone sees the round is paid out."
                : payout.net < payout.gross
                  ? `The ${formatPeso(payout.gross)} pot, less what ${recipient?.name} owed.`
                  : `The full ${formatPeso(payout.gross)} pot.`
          }
        />
      );
      primary = (
        <button type="button" onClick={() => setPayoutRound(payout.round)} className={ui.btnPrimary}>
          {confirming ? "Confirm receipt" : ownPayout ? "Mark as received" : "Mark as handed over"}
        </button>
      );
    } else if (swapTask) {
      const { swap, as } = swapTask;
      nowSwapId = swap.id;
      const requester = detail.slots.find((x) => x.id === swap.requesterSlotId);
      const target = detail.slots.find((x) => x.id === swap.targetSlotId);
      now = (
        <NowPanel
          tone="sun"
          icon={ArrowLeftRight}
          eyebrow="Turn swap"
          title={
            as === "target"
              ? `${requester?.name} asks to swap turns${target?.isViewer ? "" : ` with ${target?.name}`}`
              : `Approve ${requester?.name} and ${target?.name} swapping turns`
          }
          body={
            as === "target"
              ? `${turnLine(swap.targetSlotId)} for ${turnLine(swap.requesterSlotId)}.`
              : "They both agreed. Approving changes the payout order."
          }
        >
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                as === "target"
                  ? swapAction(swap, () => api.declineSwap(group.id, swap.id))
                  : void denySwap(swap)
              }
              disabled={pending === `swap-${swap.id}`}
              className={`${ui.btnSecondary} min-h-11 flex-1`}
            >
              {as === "target" ? "Decline" : "Deny"}
            </button>
            <button
              type="button"
              onClick={() =>
                swapAction(swap, () =>
                  as === "target" ? api.acceptSwap(group.id, swap.id) : api.approveSwap(group.id, swap.id),
                )
              }
              disabled={pending === `swap-${swap.id}`}
              className={`${ui.btnPrimary} min-h-11 flex-1`}
            >
              {as === "target" ? "Accept" : "Approve"}
            </button>
          </div>
        </NowPanel>
      );
      // Paying stays the main action while a swap waits.
      if (mine && mine.reportable > 0) primary = payButton;
    } else if (mine && mine.reportable > 0) {
      now = (
        <NowPanel
          tone="brand"
          icon={HandCoins}
          eyebrow={`Round ${period!.number}`}
          title={mine.approved + mine.pending > 0 ? `Pay the remaining ${formatPeso(mine.reportable)}` : `Pay ${formatPeso(mine.due)}`}
          body={
            <>
              {due}
              {mine.pending > 0 && ` ${formatPeso(mine.pending)} is already waiting for review.`}
              {owed > 0 && ` You also owe ${formatPeso(owed)} from earlier rounds.`}
            </>
          }
        />
      );
      primary = payButton;
    } else if (debtLeft > 0) {
      now = (
        <NowPanel
          tone="danger"
          icon={HandCoins}
          eyebrow="You owe"
          title={`${formatPeso(owed)} to ${group.organizerName}`}
          body={
            group.interestRate > 0 && group.state === "ACTIVE"
              ? "Interest is added at every payout date until it's paid. Payments go to interest first."
              : "Shortfalls the organizer covered for you."
          }
        />
      );
      primary = (
        <button type="button" onClick={() => pay(viewer.slotId, "DEBT_PAYMENT")} className={ui.btnPrimary}>
          Pay toward your debt
        </button>
      );
    } else if (mine && mine.status !== "PAID") {
      now = (
        <NowPanel
          tone="calm"
          icon={Hourglass}
          eyebrow={`Round ${period!.number}`}
          title="Waiting for review"
          body={`Your ${formatPeso(mine.pending)} is with ${group.organizerName}. It counts once approved.`}
        />
      );
    } else if (group.state === "ACTIVE" && period) {
      const recipientIsMe = period.recipientSlotId === viewer.slotId;
      now = (
        <NowPanel
          tone="calm"
          icon={CircleCheck}
          eyebrow={`Round ${period.number}`}
          title="You're paid up for this round"
          body={
            recipientIsMe
              ? `This round's ${formatPeso(group.pot)} pot comes to you on ${formatDueDate(period.payoutDate)}.`
              : isOrganizer
                ? "Nothing to review. Record payments for placeholders from the list below."
                : `Next contributions open after the ${formatDueDate(period.payoutDate)} payout.`
          }
        />
      );
    } else if (group.state === "COMPLETED_WITH_OUTSTANDING_DEBT") {
      now = (
        <NowPanel
          tone="calm"
          icon={CircleCheck}
          eyebrow="Every payout is done"
          title={isOrganizer ? `${owingSlots.length} still owe you` : "You're all settled"}
          body={
            isOrganizer
              ? "Debt payments still come in for review. It's fully complete once they're paid."
              : "Some members still owe the organizer, so the paluwagan stays open for their payments."
          }
        />
      );
    } else {
      now = <NowPanel tone="calm" icon={CircleCheck} eyebrow="Complete" title="Every payout is done, and nobody owes anything" />;
    }
    if (group.state === "ACTIVE" && isOrganizer && demoTools) {
      now = (
        <>
          {now}
          <div className="-mt-4 text-right">
            <button type="button" onClick={() => void closeRoundNow()} className={ui.btnGhost}>
              Close this round now (demo)
            </button>
          </div>
        </>
      );
    }
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

      {detail.period && (
        <>
          <PeriodCard detail={detail} stats={stats} />
          <PeriodStatusList
            detail={detail}
            pending={pending}
            onRecord={(slot) => pay(slot.id, "CONTRIBUTION")}
            onRemind={(slot) => void run(`remind-${slot.id}`, () => api.remindSlot(group.id, slot.id))}
          />
        </>
      )}
      {stats && <YourTurn detail={detail} stats={stats} />}
      <DebtsList detail={detail} onPay={(slot) => pay(slot.id, "DEBT_PAYMENT")} />
      <RefundsOwed detail={detail} />
      <MyPayments
        detail={detail}
        pending={pending}
        onWithdraw={(s) => void withdraw(s)}
        onDispute={(s) => setDisputeForId(s.id)}
        onWithdrawDispute={(d) => void withdrawDispute(d)}
      />
      <SwapsList
        detail={detail}
        hideId={nowSwapId}
        pending={pending}
        onAccept={(sw) => swapAction(sw, () => api.acceptSwap(group.id, sw.id))}
        onDecline={(sw) => swapAction(sw, () => api.declineSwap(group.id, sw.id))}
        onApprove={(sw) => swapAction(sw, () => api.approveSwap(group.id, sw.id))}
        onDeny={(sw) => void denySwap(sw)}
        onCancel={(sw) => swapAction(sw, () => api.cancelSwap(group.id, sw.id))}
      />
      {(group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT") && <Recap detail={detail} />}
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
        onOpenPayout={setPayoutRound}
      />
      {isOrganizer && stats && (
        <>
          {/* Once it's finished the Recap carries these totals, so they show only while it runs. */}
          {group.state === "ACTIVE" && <MoneyOverview stats={stats} />}
          <Trends stats={stats} />
        </>
      )}
      {started && <RecordsSection detail={detail} />}
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
      <PaySheet
        detail={detail}
        target={
          payTarget
            ? { slot: detail.slots.find((s) => s.id === payTarget.slotId)!, mode: payTarget.mode }
            : null
        }
        onClose={() => setPayTarget(null)}
        onSubmit={submitPayment}
      />
      <SwapSheet
        detail={detail}
        slot={detail.slots.find((x) => x.id === swapWithSlotId) ?? null}
        pending={pending}
        onClose={() => setSwapWithSlotId(null)}
        onRequest={async (slot) => !!(await run("swap", () => api.requestSwap(group.id, { targetSlotId: slot.id })))}
        onManageSlot={(slot) => {
          setSwapWithSlotId(null);
          setSelectedSlotId(slot.id);
        }}
      />
      <DisputeSheet
        detail={detail}
        submission={detail.submissions.find((s) => s.id === disputeForId) ?? null}
        onClose={() => setDisputeForId(null)}
        onSubmit={raiseDispute}
      />
      <PayoutSheet
        detail={detail}
        payout={detail.payouts.find((p) => p.round === payoutRound) ?? null}
        pending={pending}
        onClose={() => setPayoutRound(null)}
        onHandOver={async (round, proofPath) => !!(await run("handover", () => api.markHandedOver(group.id, round, proofPath)))}
        onConfirm={async (round) => !!(await run("confirm", () => api.confirmReceipt(group.id, round)))}
        onManageSlot={(slotId) => {
          setPayoutRound(null);
          setSelectedSlotId(slotId);
        }}
      />
      {isOrganizer && (
        <ReviewSheet
          open={reviewOpen}
          detail={detail}
          pending={pending}
          onClose={() => setReviewOpen(false)}
          onApprove={approveItem}
          onDeny={denyItem}
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
