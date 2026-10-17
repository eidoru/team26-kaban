import { Check, ChevronRight, Clock, ImageOff, Paperclip } from "lucide-react";
import type { DisputeView, GroupDetail, GroupStats, PayoutView, PeriodSlot, SlotView, SubmissionView } from "../../../api/client";
import { roundsLabel } from "@domain/submissions";
import { Avatar } from "../../../components/Avatar";
import { daysUntil, formatMonthDay } from "../../../lib/dates";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { asPayments, isAhead, latestDispute, payRooms } from "./period";
import { HealthChip } from "../dashboard/StatsSections";

type StageState = "done" | "active" | "todo";
interface Stage {
  label: string;
  note?: string;
  state: StageState;
}

/**
 * Where money is in a round's life, as connected steps with the current one lit: collected, then the
 * payout, then the recipient confirming it.
 */
const STAGE_DOT = {
  done: "bg-brand-600 text-white",
  active: "bg-white ring-2 ring-sun-400",
  todo: "bg-white ring-2 ring-ink-200",
};
const STAGE_LABEL = { done: "text-ink-700", active: "text-ink-900", todo: "text-ink-400" };

function StageTrack({ stages }: { stages: Stage[] }) {
  return (
    <ol className="isolate flex" aria-label="Stage">
      {stages.map((stage, i) => (
        <li
          key={stage.label}
          aria-current={stage.state === "active" ? "step" : undefined}
          className="relative min-w-0 flex-1 px-2 text-center"
        >
          {/* The line from the previous step, drawn under the dots: green once this step is reached. */}
          {i > 0 && (
            <span
              aria-hidden
              className={`absolute top-3 right-1/2 left-[-50%] h-0.5 -translate-y-1/2 ${
                stage.state === "todo" ? "bg-ink-200" : "bg-brand-600"
              }`}
            />
          )}
          <span
            className={`relative z-10 mx-auto flex h-6 w-6 items-center justify-center rounded-full ${STAGE_DOT[stage.state]}`}
          >
            {stage.state === "done" && <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />}
            {stage.state === "active" && <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-sun-500" aria-hidden />}
          </span>
          <span className={`mt-2 block text-xs font-bold ${STAGE_LABEL[stage.state]}`}>{stage.label}</span>
          {stage.note && <span className="block text-xs text-ink-500">{stage.note}</span>}
        </li>
      ))}
    </ol>
  );
}

/** A timestamp as the viewer's local "Nov 1", to match the other step notes. */
function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * A payout still on its way (§7): handed over by the organizer, then confirmed by the recipient.
 * Shown to everyone (R-DEC-06) while the next round collects, so both stages are visible at once.
 * The whole header opens the payout's details; from `sm` the steps sit beside it, so the card stays one band.
 */
export function PayoutStageCard({ detail, payout, onOpen }: { detail: GroupDetail; payout: PayoutView; onOpen: () => void }) {
  const recipient = detail.slots.find((s) => s.id === payout.recipientSlotId);
  const handedOver = payout.status !== "AWAITING_HANDOVER";
  // A placeholder can't confirm, and the organizer already holds their own pot: one step, no "Received".
  const oneStep = recipient?.kind === "PLACEHOLDER" || recipient?.isOrganizer;
  const collected: Stage = { label: "Collected", note: formatMonthDay(payout.payoutDate), state: "done" };
  return (
    <section
      aria-label={`Round ${payout.round} payout`}
      className={`${ui.cardCompact} sm:flex sm:items-center sm:gap-8`}
    >
      <button
        type="button"
        onClick={onOpen}
        className="-m-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-2xl p-2 text-left transition-colors hover:bg-ink-50 sm:w-auto sm:min-w-0 sm:flex-1"
      >
        {recipient && <Avatar name={recipient.name} size="md" placeholder={recipient.kind === "PLACEHOLDER"} />}
        <span className="min-w-0 flex-1">
          <span className="font-heading block truncate text-lg font-bold text-ink-900">
            <span className="tabular-nums">{formatPeso(payout.net)}</span> to{" "}
            {recipient?.isViewer ? "you" : recipient?.name}
          </span>
          <span className="block text-sm text-ink-500">The pot from round {payout.round}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
        <span className="sr-only">Details</span>
      </button>
      <div className="mt-5 sm:mt-0 sm:w-96 sm:shrink-0">
        <StageTrack
          stages={
            oneStep
              ? [collected, { label: "Paid out", note: `By ${detail.group.organizerName}`, state: "active" }]
              : [
                  collected,
                  {
                    label: "Handed over",
                    note: payout.handedOverAt ? shortDay(payout.handedOverAt) : `By ${detail.group.organizerName}`,
                    state: handedOver ? "done" : "active",
                  },
                  {
                    label: "Received",
                    note: recipient?.isViewer ? "Yours to confirm" : `${recipient?.name} confirms`,
                    state: handedOver ? "active" : "todo",
                  },
                ]
          }
        />
      </div>
    </section>
  );
}

/**
 * The open round: whose pot it is, when, how much is collected (approved money only, R-SUB-07),
 * and (from the stats) the period's dates, its health and what the recipient would get now.
 */
/**
 * The round card's look for each stage: green while it collects, amber on the payout date itself
 * (the round closes the day after, so the payout date is a stage everyone can see).
 */
const CARD_THEMES = {
  collecting: {
    card: "bg-brand-700 text-white",
    muted: "text-brand-100",
    track: "bg-brand-900/50",
    fill: "bg-sun-300",
    fillPending: "bg-sun-300/40",
  },
  payoutDay: {
    card: "bg-sun-400 text-sun-950",
    muted: "text-sun-900",
    track: "bg-sun-950/15",
    fill: "bg-sun-950",
    fillPending: "bg-sun-950/40",
  },
} as const;

export function PeriodCard({ detail, stats }: { detail: GroupDetail; stats?: GroupStats }) {
  const open = stats?.openRound;
  const period = detail.period!;
  const recipient = detail.slots.find((s) => s.id === period.recipientSlotId);
  const percent = Math.min(100, Math.round((period.approvedTotal / period.expected) * 100));
  const pendingPercent = Math.min(100 - percent, Math.round((period.pendingTotal / period.expected) * 100));
  const payoutDay = (daysUntil(period.payoutDate) ?? 1) <= 0;
  const theme = CARD_THEMES[payoutDay ? "payoutDay" : "collecting"];
  const who = recipient?.isViewer ? "you" : (recipient?.name ?? "—");
  return (
    <section
      aria-labelledby="current-round"
      className={`rounded-3xl p-5 shadow-card transition-colors sm:p-6 ${theme.card}`}
    >
      {/* Two facts: the money so far, and where it goes. The color is the stage (green collecting,
          amber on payout day). The organizer sees the round's health only when it needs attention. */}
      <h2 id="current-round" className="sr-only">
        Round {period.number} of {detail.group.slotCount}
      </h2>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-heading text-3xl font-bold tabular-nums">
          {formatPeso(period.approvedTotal)}
          <span className={`text-base font-semibold ${theme.muted}`}> of {formatPeso(period.expected)} collected</span>
        </p>
        {open && detail.viewer.isOrganizer && open.health !== "ON_TRACK" && <HealthChip health={open.health} />}
      </div>
      <div
        className={`mt-3 flex h-2.5 overflow-hidden rounded-full ${theme.track}`}
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Collected so far"
      >
        <div className={`h-full ${theme.fill}`} style={{ width: `${percent}%` }} />
        <div className={`h-full ${theme.fillPending}`} style={{ width: `${pendingPercent}%` }} />
      </div>
      <div className="mt-5 flex items-center gap-3">
        {recipient && <Avatar name={recipient.name} size="md" placeholder={recipient.kind === "PLACEHOLDER"} />}
        <p className="min-w-0 text-base font-semibold">
          Goes to <span className="font-heading font-bold">{who}</span>{" "}
          {payoutDay ? "today" : `on ${formatMonthDay(period.payoutDate)}`}
        </p>
      </div>
      {payoutDay && (
        <p className={`mt-2 text-xs ${theme.muted}`}>Payments approved before midnight still count; then the round closes.</p>
      )}
    </section>
  );
}

/** One size for whatever ends a row in "This round", a button or a status badge, so rows line up. */
const TRAILING = "h-9 min-w-24 shrink-0 items-center justify-center px-3";

/** A row's standing as one badge. Money waiting for review shows as "In review" (the amount is in the row's sheet). */
function StatusChip({ standing }: { standing: PeriodSlot }) {
  const kind = standing.status !== "PAID" && standing.pending > 0 ? "REVIEW" : standing.status;
  const styles = {
    PAID: "bg-brand-100 text-brand-800",
    PARTIAL: "bg-sun-100 text-sun-800",
    UNPAID: "bg-ink-100 text-ink-600",
    REVIEW: "bg-sky-50 text-sky-900",
  } as const;
  const label = { PAID: "Paid", PARTIAL: "Partly paid", UNPAID: "Not paid", REVIEW: "In review" }[kind];
  return <span className={`inline-flex rounded-full text-sm font-bold ${TRAILING} ${styles[kind]}`}>{label}</span>;
}

/**
 * Everyone's standing this round, in payout order (R-SUB-07, R-DEC-06). The viewer's own row is
 * always tappable to pay, whatever the Now panel is showing; the organizer's placeholder rows too,
 * to record their payments (R-SUB-02). Once that slot has paid this round in full (approved), the
 * same row pays ahead (R-DEC-31); every row says what its slot has paid ahead (R-DEC-06).
 */
export function PeriodStatusList({
  detail,
  pending,
  onRecord,
  onRemind,
}: {
  detail: GroupDetail;
  pending?: string | null;
  onRecord?: (slot: SlotView) => void;
  /** Organizer: nudge a member who hasn't fully paid (§15.1). */
  onRemind?: (slot: SlotView) => void;
}) {
  const period = detail.period!;
  const order = new Map(detail.schedule.map((r) => [r.recipientSlotId, r.number]));
  const slots = [...detail.slots].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return (
    <section aria-labelledby="round-heading">
      <h2 id="round-heading" className={`${ui.sectionHeading} mb-3`}>
        This round
      </h2>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {slots.map((slot) => {
          const standing = period.slots.find((s) => s.slotId === slot.id)!;
          const recordable =
            onRecord &&
            (slot.isViewer || (detail.viewer.isOrganizer && slot.kind === "PLACEHOLDER")) &&
            standing.status !== "PAID";
          // R-DEC-31: only once this round is approved in full, and paying ahead is open to the slot.
          const payableAhead =
            onRecord &&
            (slot.isViewer || (detail.viewer.isOrganizer && slot.kind === "PLACEHOLDER")) &&
            standing.status === "PAID" &&
            payRooms(detail, slot.id).ahead > 0;
          const paidAhead = detail.ahead.filter((a) => a.slotId === slot.id && a.approved + a.pending > 0);
          const aheadTotal = paidAhead.reduce((total, a) => total + a.approved + a.pending, 0);
          const body = (
            <>
              <Avatar name={slot.name} size="md" placeholder={slot.kind === "PLACEHOLDER"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-ink-900">
                  {slot.name}
                </span>
                <span className="block text-xs text-ink-500 tabular-nums">
                  {standing.status === "PAID"
                    ? // The button takes the place of the Paid chip, so the line says it.
                      `${payableAhead ? "Paid " : ""}${formatPeso(standing.approved)}`
                    : `${formatPeso(standing.approved)} of ${formatPeso(standing.due)}`}
                </span>
                {aheadTotal > 0 && (
                  <span className="block text-xs text-brand-700 tabular-nums">
                    {formatPeso(aheadTotal)} paid ahead for {roundsLabel(paidAhead.map((a) => a.round))}
                    {paidAhead.some((a) => a.pending > 0) && ", some in review"}
                  </span>
                )}
              </span>
            </>
          );
          const remindable =
            onRemind &&
            detail.viewer.isOrganizer &&
            slot.kind === "MEMBER" &&
            !slot.isViewer &&
            standing.status !== "PAID" &&
            standing.pending === 0;
          const remindedRecently = standing.remindedRecently;
          // Each row's one action is a labelled button, not a tappable row with a bare chevron.
          return (
            <li key={slot.id} className={`flex min-h-16 items-center gap-3 px-4 py-3 ${slot.isViewer ? "bg-brand-50" : ""}`}>
              {body}
              {recordable ? (
                <button type="button" onClick={() => onRecord(slot)} className={`${ui.btnSecondarySm} ${TRAILING}`}>
                  {slot.isViewer && !detail.viewer.isOrganizer ? "Report" : "Record"}
                </button>
              ) : payableAhead ? (
                <button type="button" onClick={() => onRecord(slot)} className={`${ui.btnSecondarySm} ${TRAILING}`}>
                  {slot.isViewer && !detail.viewer.isOrganizer ? "Pay ahead" : "Record ahead"}
                </button>
              ) : remindable ? (
                <button
                  type="button"
                  onClick={() => onRemind(slot)}
                  disabled={remindedRecently || pending === `remind-${slot.id}`}
                  className={`${ui.btnSecondarySm} ${TRAILING}`}
                >
                  {remindedRecently ? "Reminded" : pending === `remind-${slot.id}` ? "Reminding…" : "Remind"}
                </button>
              ) : (
                // With a button, the amount line already says what's missing; the chip would crowd the name.
                <StatusChip standing={standing} />
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const SUBMISSION_LABELS: Record<SubmissionView["status"], { text: string; tone: string }> = {
  PENDING: { text: "Waiting for review", tone: "text-sun-800" },
  APPROVED: { text: "Approved", tone: "text-brand-700" },
  DENIED: { text: "Not approved", tone: "text-danger-700" },
  CANCELLED: { text: "Withdrawn", tone: "text-ink-500" },
};

/**
 * What the viewer reported, newest first: Withdraw on pending ones (R-SUB-04), Dispute on approved
 * contributions while their period is open or still to come (§6.2, R-DEC-32), and each dispute's outcome.
 */
export function MyPayments({
  detail,
  pending,
  onWithdraw,
  onDispute,
  onWithdrawDispute,
}: {
  detail: GroupDetail;
  pending: string | null;
  onWithdraw: (submission: SubmissionView) => void;
  onDispute: (submission: SubmissionView) => void;
  onWithdrawDispute: (dispute: DisputeView) => void;
}) {
  // A split payment is one row until approved; then each round's part stands alone, so each can be
  // corrected on its own (R-DEC-33, R-DEC-32).
  const rows = detail.submissions.filter((s) => s.mine).sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
  const mine = [
    ...asPayments(detail, rows.filter((s) => s.status !== "APPROVED")),
    ...rows.filter((s) => s.status === "APPROVED").map((s) => ({ ...s, parts: [s] })),
  ].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || (b.round ?? 0) - (a.round ?? 0));
  if (mine.length === 0) return null;
  const nameOf = (slotId: string) => detail.slots.find((s) => s.id === slotId);
  return (
    <section aria-labelledby="my-payments-heading">
      <h2 id="my-payments-heading" className={`${ui.sectionHeading} mb-3`}>
        {detail.viewer.isOrganizer ? "Payments you recorded" : "Your payments"}
      </h2>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {mine.map((s) => {
          const label = SUBMISSION_LABELS[s.status];
          const slot = nameOf(s.slotId);
          const dispute = latestDispute(detail, s.id);
          const changed = s.effectiveAmount != null && s.effectiveAmount !== s.amount;
          const disputable =
            s.status === "APPROVED" &&
            s.appliedAs === "CONTRIBUTION" &&
            (s.round === detail.period?.number || isAhead(detail, s)) &&
            dispute?.status !== "PENDING";
          return (
            <li key={s.id} className="px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-ink-900 tabular-nums">
                    {formatPeso(s.effectiveAmount ?? s.amount)}
                    {changed && <span className="font-semibold text-ink-500"> (was {formatPeso(s.amount)})</span>}
                    {!slot?.isViewer && <span className="font-semibold text-ink-600"> for {slot?.name}</span>}
                    {(s.type === "DEBT_PAYMENT" || s.appliedAs === "DEBT_PAYMENT") && (
                      <span className="font-semibold text-ink-600"> toward debt</span>
                    )}
                    {(s.parts.length > 1 || isAhead(detail, s)) && (
                      <span className="font-semibold text-ink-600">
                        {s.parts.length > 1
                          ? ` for ${roundsLabel(s.parts.map((p) => p.round ?? 0))}`
                          : ` ahead for round ${s.round}`}
                      </span>
                    )}
                  </span>
                  <span className={`flex items-center gap-1 text-xs font-semibold ${label.tone}`}>
                    {s.status === "PENDING" && <Clock className="h-3 w-3" aria-hidden />}
                    {label.text}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
                    {s.proofAttached ? <Paperclip className="h-3 w-3" aria-hidden /> : <ImageOff className="h-3 w-3" aria-hidden />}
                    {s.proofAttached ? "Proof attached" : "No proof"}
                    {s.note && ` · ${s.note}`}
                  </span>
                </span>
                {s.status === "PENDING" && (
                  <button
                    type="button"
                    onClick={() => onWithdraw(s)}
                    disabled={pending === `withdraw-${s.id}`}
                    className={ui.btnGhost}
                  >
                    Withdraw
                  </button>
                )}
                {disputable && (
                  <button type="button" onClick={() => onDispute(s)} className={ui.btnGhost}>
                    Report a problem
                  </button>
                )}
              </div>
              {dispute && <DisputeLine dispute={dispute} pending={pending} onWithdraw={onWithdrawDispute} />}
              {s.status === "DENIED" && s.denialReason && (
                <p className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-xs text-danger-800">Reason: {s.denialReason}</p>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}


/** A dispute's outcome under its payment. */
function DisputeLine({
  dispute,
  pending,
  onWithdraw,
}: {
  dispute: DisputeView;
  pending: string | null;
  onWithdraw: (dispute: DisputeView) => void;
}) {
  const to = formatPeso(dispute.proposedAmount);
  const lines: Record<DisputeView["status"], { text: string; tone: string }> = {
    PENDING: { text: `You asked to change it to ${to}. Waiting for review.`, tone: "bg-sun-50 text-sun-900" },
    APPROVED: {
      text: `Changed to ${to}.${dispute.refund ? ` The organizer owes you a ${formatPeso(dispute.refund)} refund.` : ""}`,
      tone: "bg-brand-50 text-brand-900",
    },
    DENIED: { text: `Change to ${to} not accepted: ${dispute.reviewNote}`, tone: "bg-danger-50 text-danger-800" },
    CANCELLED: { text: `You withdrew the change to ${to}.`, tone: "bg-ink-50 text-ink-600" },
    EXPIRED: {
      text: `The change to ${to} wasn't settled before the payout, so ${formatPeso(dispute.previousAmount)} stands.`,
      tone: "bg-ink-50 text-ink-600",
    },
  };
  const line = lines[dispute.status];
  return (
    <div className={`mt-2 flex items-start gap-2 rounded-xl px-3 py-2 text-xs ${line.tone}`}>
      <span className="flex-1">{line.text}</span>
      {dispute.status === "PENDING" && dispute.mine && (
        <button
          type="button"
          onClick={() => onWithdraw(dispute)}
          disabled={pending === `withdraw-dispute-${dispute.id}`}
          className="shrink-0 font-bold underline"
        >
          Withdraw
        </button>
      )}
    </div>
  );
}
