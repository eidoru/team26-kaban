import { type ReactNode, useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Ban,
  Banknote,
  BellRing,
  CalendarClock,
  CircleCheck,
  ClipboardCheck,
  HandCoins,
  Hourglass,
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
import { TodoBarButton, TodoPanel, type Todo } from "../../components/flow/TodoPanel";
import { REMINDER_DAYS_BEFORE } from "@domain/constants";
import { useDialog } from "../../context/useDialog";
import { daysUntil, dueHint, formatDueDate } from "../../lib/dates";
import { useDemoToolsSetting } from "../../lib/devTools";
import { groupKey, useGroupActions } from "../../lib/groupQueries";
import { invalidateHomeLists } from "../../lib/homeQueries";
import { formatPeso } from "../../lib/money";
import { ui } from "../../lib/ui";
import { GroupDetails } from "./GroupDetails";
import { InviteLinkPanel, PlaceholderSheet, SlotSheet } from "./GroupSheets";
import { PayoutSchedule } from "./PayoutSchedule";
import { currentOrder } from "./slots";
import { PaySheet, type PayMode } from "./active/PaySheet";
import { PayoutSheet } from "./active/PayoutSheet";
import { WhoPaidSheet } from "./active/WhoPaidSheet";
import { debtReportable, owedBy, payoutsToActOnFor, reviewItems, standingOf, type ReviewItem } from "./active/period";
import { MyPayments, PayoutStageCard, PeriodCard, PeriodStatusList } from "./active/PeriodSections";
import { DebtsView } from "./debts/DebtSections";
import { DisputeSheet } from "./active/DisputeSheet";
import { SwapSheet, SwapsList } from "./swaps/SwapSections";
import { Recap } from "./records/RecordsSections";
import { MyStanding, YourTurn } from "./dashboard/StatsSections";
import { swapToActOn } from "./swaps/swaps";
import { ReviewSheet } from "./active/ReviewSheet";
import { MembersList, SlotsList } from "./SlotsList";
import { STATE_LABELS, useGroupShell } from "./groupShell";

/** The views of a launched paluwagan, one per GroupShell tab that GroupPage renders. */
export type GroupViewName = "dashboard" | "schedule" | "members" | "debts";

/**
 * One paluwagan, inside GroupShell (which loads it). Before launch it's a single page; after,
 * `view` picks Dashboard, Schedule, Members or Debts, and the sheets are shared by all of them.
 */
export function GroupPage({ view = "dashboard" }: { view?: GroupViewName }) {
  const { detail, navMode } = useGroupShell();
  if (!navMode && view !== "dashboard") return <Navigate to={`/groups/${detail.group.id}`} replace />;
  return <GroupView detail={detail} navMode={navMode} view={view} />;
}

function GroupView({ detail, navMode, view }: { detail: GroupDetail; navMode: boolean; view: GroupViewName }) {
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
  // Open on the whole queue (true), or on one item from the Debts view (its review key).
  const [reviewOpen, setReviewOpen] = useState<boolean | string>(false);
  // The Dashboard's "Record payments" with more than one placeholder to record: who paid first.
  const [pickingRecord, setPickingRecord] = useState(false);
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

  /** R-LCH-01..03: the lobby page is the launch summary; one confirmation, then it's final. */
  async function launch() {
    const confirmed = await dialog.confirm({
      title: `Launch ${group.name}?`,
      description: "Settings, members and payout order become final. Everyone is notified.",
      confirmLabel: "Launch",
    });
    if (confirmed) await run("launch", () => api.launch(group.id));
  }

  /** Demo calls return a count, not the group, so refetch it; `run` shows a failure in the error banner. */
  const demo = (key: string, call: () => Promise<unknown>) =>
    run(key, async () => {
      await call();
      return api.getGroup(group.id);
    });

  async function startNow() {
    await demo("demo-start", () => api.activateNow(group.id));
  }

  async function closeRoundNow() {
    const confirmed = await dialog.confirm({
      title: "Close this round now? (demo)",
      description: "Skips to the payout date: shortfalls become debt, the payout is worked out, and the next round opens.",
      confirmLabel: "Close round",
    });
    if (!confirmed) return;
    await demo("demo-close", () => api.closeRoundNow(group.id));
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
      title: "Withdraw this report?",
      description: `The payment stays at ${formatPeso(dispute.previousAmount)}. You can report it again before the payout.`,
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
  /** Reminds each late payer in turn (the server allows one reminder a day per slot, §12). */
  async function remindAll(slotIds: string[]) {
    for (const slotId of slotIds) await run(`remind-${slotId}`, () => api.remindSlot(group.id, slotId));
  }
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
  /** Placeholders with this round's contribution still to record, for the Record task and its picker. */
  let toRecord: { slot: SlotView; owes: number }[] = [];
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
        >
          <InviteLinkPanel
            detail={detail}
            pending={pending}
            onCreateLink={() => void run("invite", () => api.createInviteLink(group.id))}
          />
        </NowPanel>
      );
      primary = (
        <button type="button" onClick={() => setInviteOpen(true)} className={ui.btnPrimary}>
          Add a placeholder
        </button>
      );
    } else if (!ordered) {
      now = (
        <NowPanel
          tone="brand"
          icon={Shuffle}
          eyebrow="Next step"
          title="Set the payout order"
          body="Everyone's in. Shuffle for a random order, or arrange it yourself."
        />
      );
      primary = (
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
          body="Check who gets paid when. You can shuffle or arrange it until you launch; launching makes the order and settings final."
        />
      );
      primary = (
        <button type="button" onClick={() => void launch()} disabled={pending === "launch"} className={ui.btnPrimary}>
          <Rocket className="h-4 w-4" aria-hidden />
          {pending === "launch" ? "Launching…" : "Launch paluwagan"}
        </button>
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
          <button type="button" onClick={() => void startNow()} disabled={pending !== null} className={ui.btnSecondarySm}>
            Start now
          </button>
        )}
      </NowPanel>
    );
  } else if (group.state === "ACTIVE" || group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT") {
    const period = detail.period;
    const mine = period ? standingOf(detail, viewer.slotId) : null;
    const queue = isOrganizer ? reviewItems(detail) : [];
    const payoutsToActOn = payoutsToActOnFor(detail);
    const swapTask = swapToActOn(detail);
    /** "Your round 3 (Feb 1)" / "Mia's round 2 (Jan 1)", for the swap panel. */
    const turnLine = (slotId: string) => {
      const slot = detail.slots.find((x) => x.id === slotId);
      const round = detail.schedule.find((r) => r.recipientSlotId === slotId);
      return `${slot?.isViewer ? "Your" : `${slot?.name}'s`} round ${round?.number} (${round ? formatDueDate(round.payoutDate) : ""})`;
    };
    const owed = owedBy(detail, viewer.slotId);
    const debtLeft = debtReportable(detail, viewer.slotId);
    const hint = period ? dueHint(period.payoutDate) : null;
    // The date itself is on the round card; here, how long is left.
    const due = hint ? `Due ${hint.label}.` : "";
    const owingSlots = detail.slots.filter((s) => s.debt.principal + s.debt.interest > 0);

    // --- Everything the viewer can do right now, most urgent first (one list, not one task at a time).
    const todos: Todo[] = [];
    if (queue.length > 0) {
      // Members are waiting on the organizer's reviews (R-SUB-03, R-DSP-02).
      const disputes = queue.filter((q) => q.kind === "dispute").length;
      const payments = queue.length - disputes;
      const parts = [
        disputes > 0 && `${disputes} problem report${disputes === 1 ? "" : "s"}`,
        payments > 0 && `${payments} payment${payments === 1 ? "" : "s"}`,
      ].filter(Boolean);
      todos.push({
        id: "review",
        icon: ClipboardCheck,
        title: `Review ${parts.join(" and ")}`,
        detail:
          disputes > 0
            ? "Problem reports first: they expire at the payout if you don't decide."
            : "Oldest first. They count once you approve them.",
        action: { label: "Review", onClick: () => setReviewOpen(true) },
      });
    }
    for (const payout of payoutsToActOn) {
      const recipient = detail.slots.find((s) => s.id === payout.recipientSlotId);
      const confirming = payout.status === "HANDED_OVER";
      // The organizer already holds the pot they collected; taking their own payout is one step.
      const ownPayout = isOrganizer && !!recipient?.isViewer;
      todos.push({
        id: `payout-${payout.round}`,
        icon: Banknote,
        title: confirming
          ? `Confirm you got ${formatPeso(payout.net)}`
          : ownPayout
            ? `Take your ${formatPeso(payout.net)} payout`
            : `Hand ${formatPeso(payout.net)} to ${recipient?.name}`,
        detail: `From round ${payout.round}. ${
          confirming
            ? "Confirm once it's in your hands, so everyone sees it was paid."
            : ownPayout
              ? "You're holding the collected pot; mark it received."
              : payout.net < payout.gross
                ? `The ${formatPeso(payout.gross)} pot, less what ${recipient?.name} owed.`
                : `The full ${formatPeso(payout.gross)} pot.`
        }`,
        action: {
          label: confirming ? "Confirm" : ownPayout ? "Mark received" : "Hand over",
          onClick: () => setPayoutRound(payout.round),
        },
      });
    }
    if (mine && mine.reportable > 0) {
      const amount = formatPeso(mine.reportable);
      todos.push({
        id: "pay",
        icon: HandCoins,
        title: mine.approved + mine.pending > 0 ? `Pay the remaining ${amount}` : `Pay your ${amount}`,
        // The one place a member sees their own money in review, beside what's still to pay.
        detail: [mine.pending > 0 && `${formatPeso(mine.pending)} in review`, due.replace(/\.$/, "")]
          .filter(Boolean)
          .join(" · "),
        action: { label: isOrganizer ? "Record" : "Report", onClick: () => pay(viewer.slotId, "CONTRIBUTION") },
      });
    }
    if (isOrganizer && period) {
      // Placeholders pay the organizer outside the app; the organizer records it for them (R-SUB-02).
      // One task for all of them; with more than one it asks who paid, and the list shrinks as they're recorded.
      toRecord = detail.slots
        .filter((s) => s.kind === "PLACEHOLDER")
        .map((slot) => ({ slot, owes: standingOf(detail, slot.id)?.reportable ?? 0 }))
        .filter((x) => x.owes > 0);
      if (toRecord.length > 0) {
        const [first] = toRecord;
        const names = toRecord.map((x) => x.slot.name);
        const listed = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
        todos.push({
          id: "record",
          icon: HandCoins,
          title:
            toRecord.length === 1
              ? `Record ${first.slot.name}'s ${formatPeso(first.owes)}`
              : `Record payments for ${listed}`,
          detail: `${toRecord.length === 1 ? "A placeholder" : "Placeholders"}: record once they've paid you.`,
          action: {
            label: "Record",
            onClick: () => (toRecord.length === 1 ? pay(first.slot.id, "CONTRIBUTION") : setPickingRecord(true)),
          },
        });
      }
      // Late payers, once the reminder window opens (§12): one button reminds everyone not reminded today.
      const daysLeft = daysUntil(period.payoutDate) ?? 0;
      const unpaid = period.slots.filter((s) => {
        const slot = detail.slots.find((x) => x.id === s.slotId);
        return slot?.kind === "MEMBER" && !slot.isViewer && s.status !== "PAID" && s.pending === 0;
      });
      const remindable = unpaid.filter((s) => !s.remindedRecently);
      if (daysLeft <= REMINDER_DAYS_BEFORE && remindable.length > 0) {
        const names = unpaid.map((s) => detail.slots.find((x) => x.id === s.slotId)?.name).join(", ");
        todos.push({
          id: "remind",
          icon: BellRing,
          title: `Remind ${remindable.length === 1 ? names : `${remindable.length} members`} to pay`,
          detail: `${due} Not paid yet: ${names}.`,
          action: { label: "Remind", onClick: () => void remindAll(remindable.map((s) => s.slotId)), disabled: pending?.startsWith("remind-") },
        });
      }
    }
    if (swapTask) {
      const { swap, as } = swapTask;
      nowSwapId = swap.id;
      const requester = detail.slots.find((x) => x.id === swap.requesterSlotId);
      const target = detail.slots.find((x) => x.id === swap.targetSlotId);
      const busy = pending === `swap-${swap.id}`;
      todos.push({
        id: `swap-${swap.id}`,
        icon: ArrowLeftRight,
        title:
          as === "target"
            ? `Answer ${requester?.name}'s swap request`
            : `Approve ${requester?.name} and ${target?.name} swapping turns`,
        detail:
          as === "target"
            ? `${turnLine(swap.targetSlotId)} for ${turnLine(swap.requesterSlotId)}.`
            : "They both agreed. Approving changes the payout order.",
        secondary: {
          label: as === "target" ? "Decline" : "Deny",
          onClick: () => (as === "target" ? swapAction(swap, () => api.declineSwap(group.id, swap.id)) : void denySwap(swap)),
          disabled: busy,
        },
        action: {
          label: as === "target" ? "Accept" : "Approve",
          onClick: () =>
            swapAction(swap, () => (as === "target" ? api.acceptSwap(group.id, swap.id) : api.approveSwap(group.id, swap.id))),
          disabled: busy,
        },
        inBar: false,
      });
    }
    if (debtLeft > 0) {
      todos.push({
        id: "debt",
        icon: HandCoins,
        title: `Pay toward your ${formatPeso(owed)} debt`,
        detail:
          group.interestRate > 0 && group.state === "ACTIVE"
            ? `Owed to ${group.organizerName}. Interest grows at each payout until it's paid.`
            : `Shortfalls ${group.organizerName} covered for you.`,
        action: { label: "Pay", onClick: () => pay(viewer.slotId, "DEBT_PAYMENT") },
      });
    }

    if (todos.length > 0) {
      now = <TodoPanel todos={todos} />;
      if (todos.some((todo) => todo.inBar !== false)) primary = <TodoBarButton todos={todos} />;
    } else if (mine && mine.status !== "PAID") {
      now = (
        <NowPanel
          tone="calm"
          icon={Hourglass}
          eyebrow="This round"
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
          eyebrow="This round"
          title="You're paid up for this round"
          body={
            recipientIsMe
              ? `This round's ${formatPeso(group.pot)} pot comes to you on ${formatDueDate(period.payoutDate)}.`
              : isOrganizer
                ? `Nothing needs you right now. Round ${period.number} closes on ${formatDueDate(period.payoutDate)}.`
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
  } else if (group.state === "CANCELLED") {
    now = <NowPanel tone="calm" icon={Ban} eyebrow="Cancelled" title="This paluwagan was cancelled" body="The organizer cancelled it before it launched." />;
  }

  const schedule = (
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
      onSelect={group.state === "ACTIVE" ? undefined : selectSlot}
      onOpenPayout={setPayoutRound}
      onSwap={group.state === "ACTIVE" ? (slot) => setSwapWithSlotId(slot.id) : undefined}
    />
  );

  return (
    <div className="min-w-0 space-y-8">
      {!navMode ? (
        // Before launch (and once cancelled): one page, top to bottom.
        <>
          <header>
            {STATE_LABELS[group.state] && (
              <p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-500">{STATE_LABELS[group.state]}</p>
            )}
            <h1 className={ui.pageTitle}>{group.name}</h1>
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
          {schedule}
          <GroupDetails detail={detail} onCancel={() => void cancelGroup()} />
          {inLobby && !isOrganizer && (
            <div className="text-center">
              <button type="button" onClick={() => void leave()} className={ui.btnDangerGhost}>
                Leave this paluwagan
              </button>
            </div>
          )}
        </>
      ) : view === "schedule" ? (
        // Schedule: the order and when, and the swaps that change it.
        <>
          {error && (
            <p className={ui.error} role="alert">
              {error.message}{" "}
              <button type="button" onClick={clearError} className="underline">
                Dismiss
              </button>
            </p>
          )}
          {schedule}
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
        </>
      ) : view === "members" ? (
        // Members: everyone once, by name; the organizer can invite a placeholder's person.
        <>
          {error && (
            <p className={ui.error} role="alert">
              {error.message}{" "}
              <button type="button" onClick={clearError} className="underline">
                Dismiss
              </button>
            </p>
          )}
          <MembersList detail={detail} onInvite={(slot) => setSelectedSlotId(slot.id)} />
        </>
      ) : view === "debts" ? (
        // Debts: who owes what, by round; paying, recording and reviewing are in its bottom bar.
        <>
          {error && (
            <p className={ui.error} role="alert">
              {error.message}{" "}
              <button type="button" onClick={clearError} className="underline">
                Dismiss
              </button>
            </p>
          )}
          <DebtsView
            detail={detail}
            onPay={(slot) => pay(slot.id, "DEBT_PAYMENT")}
            onReview={(submission) => setReviewOpen(`payment-${submission.id}`)}
          />
        </>
      ) : (
        // Dashboard: members see their own numbers first, then what to do; the organizer the round first.
        // The terms sit beside it on wide screens, and at the end on phones.
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start lg:gap-8">
          <div className="min-w-0 space-y-8">
            {started && !isOrganizer && <MyStanding detail={detail} stats={stats} />}
            {!isOrganizer && now}
            {detail.period && <PeriodCard detail={detail} stats={stats} />}
            {/* Any earlier payout still on its way, with where it stands. */}
            {[...detail.payouts]
              .reverse()
              .filter((p) => p.status !== "CONFIRMED")
              .map((p) => (
                <PayoutStageCard key={p.round} detail={detail} payout={p} onOpen={() => setPayoutRound(p.round)} />
              ))}
            {isOrganizer && now}
            {error && (
              <p className={ui.error} role="alert">
                {error.message}{" "}
                <button type="button" onClick={clearError} className="underline">
                  Dismiss
                </button>
              </p>
            )}
            {detail.period && (
              <PeriodStatusList
                detail={detail}
                pending={pending}
                onRecord={(slot) => pay(slot.id, "CONTRIBUTION")}
                onRemind={(slot) => void run(`remind-${slot.id}`, () => api.remindSlot(group.id, slot.id))}
              />
            )}
            {/* Members have their payout in "You"; the organizer's turn card stays unless it's this round. */}
            {isOrganizer && stats && stats.myTurn?.round !== detail.period?.number && <YourTurn detail={detail} stats={stats} />}
            <MyPayments
              detail={detail}
              pending={pending}
              onWithdraw={(s) => void withdraw(s)}
              onDispute={(s) => setDisputeForId(s.id)}
              onWithdrawDispute={(d) => void withdrawDispute(d)}
            />
            {(group.state === "COMPLETED" || group.state === "COMPLETED_WITH_OUTSTANDING_DEBT") && <Recap detail={detail} />}
          </div>
          <div className="mt-8 min-w-0 space-y-8 lg:mt-0">
            <aside aria-label="Details">
              <GroupDetails detail={detail} links={false} heading={false} />
            </aside>
            {/* Testing aids stay out of the real flow: after the details, and marked as demo. */}
            {group.state === "ACTIVE" && isOrganizer && demoTools && detail.period && (
              <section aria-labelledby="demo-heading" className="rounded-3xl border-2 border-dashed border-ink-300 p-5">
                <h2 id="demo-heading" className="text-xs font-bold uppercase tracking-wide text-ink-500">
                  Demo tools
                </h2>
                <p className="mt-1 text-sm text-ink-600">Skip ahead without waiting for the calendar. Only you see this.</p>
                <button
                  type="button"
                  onClick={() => void closeRoundNow()}
                  disabled={pending !== null}
                  className={`${ui.btnSecondaryFull} mt-3`}
                >
                  Close round {detail.period.number} now
                </button>
              </section>
            )}
          </div>
        </div>
      )}

      {/* While the order is being arranged, Save and Cancel are the only actions. */}
      {primary && !orderDraft && (!navMode || view === "dashboard") && <ActionBar>{primary}</ActionBar>}

      {isOrganizer && inLobby && (
        <PlaceholderSheet
          open={inviteOpen}
          full={full}
          pending={pending}
          onClose={() => setInviteOpen(false)}
          onAddPlaceholder={async (input) => !!(await run("placeholder", () => api.addPlaceholder(group.id, input)))}
        />
      )}
      <WhoPaidSheet
        open={pickingRecord}
        rows={toRecord}
        onClose={() => setPickingRecord(false)}
        onPick={(slot) => {
          setPickingRecord(false);
          pay(slot.id, "CONTRIBUTION");
        }}
      />
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
      />
      {isOrganizer && (
        <ReviewSheet
          // A new key per entry point, so a focused open starts on its item, and per opening, so what was
          // decided last time doesn't count toward a stack now: a denied payment's round still has room,
          // and the member's next payment for it would otherwise read "2 of 2" and get a finished step.
          key={typeof reviewOpen === "string" ? reviewOpen : reviewOpen ? "queue" : "closed"}
          open={reviewOpen !== false}
          initialKey={typeof reviewOpen === "string" ? reviewOpen : null}
          detail={detail}
          pending={pending}
          onClose={() => {
            setReviewOpen(false);
            clearError();
          }}
          onApprove={approveItem}
          onDeny={denyItem}
          error={error?.message ?? null}
          onClearError={clearError}
        />
      )}
      <SlotSheet
        slot={selectedSlot}
        detail={detail}
        pending={pending}
        onClose={() => setSelectedSlotId(null)}
        onCreateClaimLink={(slot) => void run("claim-link", () => api.createClaimLink(group.id, slot.id))}
        onRemove={(slot) => void removeSlot(slot)}
      />
    </div>
  );
}
