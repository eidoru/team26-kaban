import { useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, CircleX, ExternalLink, ImageOff, TriangleAlert } from "lucide-react";
import { NOTE_MAX_LENGTH } from "@domain/constants";
import { periodStatus, refundFor, roundsLabel } from "@domain/submissions";
import type { DisputeView, GroupDetail, SubmissionView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { Sheet } from "../../../components/flow/Sheet";
import { SheetDone } from "../../../components/flow/SheetDone";
import { formatPeso } from "../../../lib/money";
import { ui } from "../../../lib/ui";
import { isAhead, owedBy, reviewItems, stackOf, standingOf, type Payment, type ReviewItem } from "./period";

const sentAt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const keyOf = (review: ReviewItem) => `${review.kind}-${review.item.id}`;

/** A member whose stack was just worked through, shown before moving on to someone else. */
type Finished = { slotId: string; round: number | null; states: ("approved" | "denied")[] };

/** A decision made while the sheet is open: kept in its stack's numbering, and shown leaving. */
type Decision = {
  key: string;
  approved: boolean;
  amount: number;
  /** Read out to screen readers, which don't see the animation. */
  label: string;
  /** The payment's stack (R-SUB-05); null for a problem report. */
  stack: { slotId: string; round: number | null; type: SubmissionView["type"] } | null;
};

/**
 * The organizer's review queue: disputes (R-DSP-02) and payments (R-SUB-03/04). It opens on a list
 * of everything waiting; a row opens that item with its proof (or "No proof attached", R-SUB-08)
 * and what approving changes, and after a decision the list comes back, shorter. With a single
 * item it opens straight on it. One member's payments for a round go in the order they came in
 * (R-SUB-05), so the list shows only the next of each stack, numbered ("1 of 6"), and deciding one
 * moves straight on to the next (R-DEC-30): the decided card is stamped and slides out as the next
 * one slides in, carousel-style, and a bar shows the stack's progress. When a member's stack is done,
 * an "all reviewed" step comes before anyone else's, so moving on to another member is never silent. Numbers count what was decided while the sheet is
 * open, so they hold steady ("2 of 6" after "1 of 6"). The room rule (R-DEC-29) means anything waiting can be
 * approved in any order; if the server still refuses something, its message shows here, in the
 * sheet. `initialKey` opens it on one item instead, and it closes once that item is decided.
 */
export function ReviewSheet({
  open,
  initialKey = null,
  detail,
  pending,
  onClose,
  onApprove,
  onDeny,
  error,
  onClearError,
}: {
  open: boolean;
  initialKey?: string | null;
  detail: GroupDetail;
  pending: string | null;
  onClose: () => void;
  onApprove: (review: ReviewItem) => Promise<boolean>;
  onDeny: (review: ReviewItem, reason: string) => Promise<boolean>;
  /** The last approve or deny that failed; shown in the sheet, not on the page behind it. */
  error: string | null;
  onClearError: () => void;
}) {
  const queue = reviewItems(detail);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialKey);
  const [denying, setDenying] = useState(false);
  const [reason, setReason] = useState("");
  const [decided, setDecided] = useState<Decision[]>([]);
  // The card just decided, sliding out while the stack's next one slides in; `carousel` says how the
  // current card arrived, kept apart so removing the outgoing one doesn't restart the incoming one.
  const [outgoing, setOutgoing] = useState<Decision | null>(null);
  const [carousel, setCarousel] = useState(false);
  const [finished, setFinished] = useState<Finished | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const select = (key: string | null) => {
    setSelectedKey(key);
    setDenying(false);
    setReason("");
    setOutgoing(null);
    setCarousel(false);
    setFinished(null);
    onClearError();
  };
  const status = (
    <p role="status" className="sr-only">
      {announcement}
    </p>
  );
  const close = () => {
    select(null);
    onClose();
  };
  if (!open) return null;

  /**
   * R-SUB-05 / R-DEC-30: a payment's place in its stack, counting what was decided in this sheet
   * first (they came earlier), so the numbers don't shift as the stack is worked through.
   */
  const orderOf = (payment: SubmissionView) => {
    const run = [
      ...decided
        .filter((d) => d.stack?.slotId === payment.slotId && d.stack.round === payment.round && d.stack.type === payment.type)
        .map((d) => ({ key: d.key, state: d.approved ? "approved" : "denied" })),
      ...stackOf(detail, payment).map((s) => ({ key: `payment-${s.id}`, state: "pending" })),
    ];
    return { number: run.findIndex((r) => r.key === `payment-${payment.id}`) + 1, of: run.length, run };
  };
  // R-SUB-05: only the next payment of each member's stack can be decided, so only it is listed.
  const visible = queue.filter((q) => q.kind === "dispute" || stackOf(detail, q.item)[0]?.id === q.item.id);
  const nameOf = (slotId: string) => {
    const s = detail.slots.find((x) => x.id === slotId);
    return s?.isViewer ? "You" : (s?.name ?? "Member");
  };
  if (finished) {
    return (
      <FinishedStep
        detail={detail}
        finished={finished}
        onClose={close}
        // What's left: one item opens directly, several go back to the list, none closes.
        next={
          visible.length === 0
            ? null
            : visible.length === 1
              ? {
                  label: nameOf(visible[0].item.slotId) === "You" ? "Next: yours" : `Next: ${nameOf(visible[0].item.slotId)}`,
                  go: () => select(keyOf(visible[0])),
                }
              : { label: "Back to list", go: () => select(null) }
        }
      />
    );
  }
  if (queue.length === 0) {
    return (
      <SheetDone title="All caught up" onClose={close}>
        {decided.length > 0 ? "Nothing else is waiting for review." : "Nothing is waiting for review."}
      </SheetDone>
    );
  }

  // A decided item leaves the queue, which brings the list back (or the last item, if one is left).
  const current = queue.find((q) => keyOf(q) === selectedKey) ?? (visible.length === 1 ? visible[0] : null);

  if (!current) {
    return (
      <Sheet open onClose={close} title="Waiting for review" subtitle={`${queue.length} to decide`}>
        {status}
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
          {visible.map((q) => {
            const slot = detail.slots.find((s) => s.id === q.item.slotId);
            const order = q.kind === "payment" ? orderOf(q.item) : null;
            return (
              <li key={keyOf(q)}>
                <button
                  type="button"
                  onClick={() => select(keyOf(q))}
                  className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-ink-50"
                >
                  <Avatar name={slot?.name} size="md" placeholder={slot?.kind === "PLACEHOLDER"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-900">{nameOf(q.item.slotId)}</span>
                    <span className="flex items-center gap-1 text-xs text-ink-500">
                      {q.kind === "dispute" ? (
                        <>
                          <TriangleAlert className="h-3.5 w-3.5 text-sun-700" aria-hidden />
                          Problem report · {formatPeso(q.item.previousAmount)} → {formatPeso(q.item.proposedAmount)}
                        </>
                      ) : (
                        <>
                          {q.item.round ? roundsOf(q.item) : "Debt payment"}
                          {q.item.parts.length === 1 && isAhead(detail, q.item) && " (paid ahead)"}
                          {order && order.of > 1 && ` · ${order.number} of ${order.of}`} ·{" "}
                          {q.item.proofUrl ? "proof attached" : "no proof"}
                        </>
                      )}
                    </span>
                  </span>
                  {q.kind === "payment" && (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900">{formatPeso(q.item.amount)}</span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      </Sheet>
    );
  }

  const slot = detail.slots.find((s) => s.id === current.item.slotId);
  const name = slot?.isViewer ? "you" : (slot?.name ?? "this member");
  const reasonError = reason.trim().length > NOTE_MAX_LENGTH ? `Up to ${NOTE_MAX_LENGTH} characters.` : null;
  const busy = pending === "approve" || pending === "deny";
  const isDispute = current.kind === "dispute";
  // R-SUB-05: the first of the member's stack for this round comes first, then the next one.
  const stack = current.kind === "payment" ? stackOf(detail, current.item) : [];
  const order = current.kind === "payment" ? orderOf(current.item) : null;
  // Look these up by place among the pending ones: `order` also counts this session's decisions.
  const index = stack.findIndex((s) => s.id === current.item.id);
  const first = index > 0 ? stack[0] : undefined;
  const next = index >= 0 ? stack[index + 1] : undefined;

  // Opened on one item: back to where it was opened from. Otherwise the member's next payment, if
  // they stacked several, or the list, one shorter.
  const done = () => (initialKey ? close() : select(next ? `payment-${next.id}` : null));
  // After a decision: record it and move on. Within a stack, the decided card slides out as the next
  // one comes in (moving on clears the last one, so it's set after).
  function decidedOn(review: ReviewItem, approved: boolean) {
    const verb = approved ? "Approved" : "Denied";
    const whose = slot?.isViewer ? "your" : `${slot?.name ?? "this member"}'s`;
    const decision: Decision =
      review.kind === "payment"
        ? {
            key: keyOf(review),
            approved,
            amount: review.item.amount,
            label: `${verb} ${whose} ${formatPeso(review.item.amount)}${order && order.of > 1 ? ` (${order.number} of ${order.of})` : ""}`,
            stack: { slotId: review.item.slotId, round: review.item.round, type: review.item.type },
          }
        : {
            key: keyOf(review),
            approved,
            amount: review.item.proposedAmount,
            label: approved
              ? `Approved ${whose} change to ${formatPeso(review.item.proposedAmount)}`
              : `Denied ${whose} problem report`,
            stack: null,
          };
    setDecided((all) => [...all, decision]);
    done();
    setAnnouncement(decision.label);
    if (next && !initialKey) {
      setOutgoing(decision);
      setCarousel(true);
    } else if (review.kind === "payment" && !initialKey) {
      // The member's stack is done. Pause on it if it had several, or if the next item (someone
      // else's) would otherwise open by itself.
      const states = [
        ...(order?.run ?? []).filter((r) => r.state !== "pending").map((r) => r.state as "approved" | "denied"),
        approved ? ("approved" as const) : ("denied" as const),
      ];
      const left = visible.filter((q) => keyOf(q) !== keyOf(review));
      if (states.length > 1 || left.length === 1) {
        setFinished({ slotId: review.item.slotId, round: review.item.round, states });
      }
    }
  }
  async function deny() {
    if (!current || !reason.trim() || reasonError) return;
    if (await onDeny(current, reason.trim())) decidedOn(current, false);
  }
  async function approve() {
    if (current && (await onApprove(current))) decidedOn(current, true);
  }

  const title = isDispute
    ? `${slot?.name ?? "Member"} reports a problem with a ${formatPeso(current.item.previousAmount)} payment`
    : `${slot?.name ?? "Member"} paid ${formatPeso(current.item.amount)}`;
  const ahead = !isDispute && current.item.parts.length === 1 && isAhead(detail, current.item);
  const roundText = isDispute ? `Round ${current.item.round}` : roundsOf(current.item);
  const subtitle = `${current.item.round ? `${roundText}${ahead ? " (paid ahead)" : ""} · ` : ""}${
    order && order.of > 1 ? `Payment ${order.number} of ${order.of} · ` : ""
  }${sentAt(
    isDispute ? current.item.createdAt : current.item.submittedAt,
  )}`;

  return (
    <Sheet
      open
      onClose={close}
      title={title}
      subtitle={subtitle}
      footer={
        denying ? (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDenying(false)} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Back
            </button>
            <button
              type="button"
              onClick={() => void deny()}
              disabled={!reason.trim() || !!reasonError || busy}
              className="min-h-11 flex-1 rounded-full bg-danger-600 px-5 text-sm font-bold text-white hover:bg-danger-700 disabled:opacity-50"
            >
              {pending === "deny" ? "Denying…" : isDispute ? "Deny report" : "Deny payment"}
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button type="button" onClick={() => setDenying(true)} disabled={busy || !!first} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Deny
            </button>
            <button type="button" onClick={() => void approve()} disabled={busy || !!first} className={`${ui.btnPrimary} min-h-11 flex-1`}>
              {pending === "approve" ? "Approving…" : isDispute ? "Approve change" : "Approve"}
            </button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {status}
        {/* Only when the list has more than one row: with one, the list opens straight back on it. */}
        {visible.length > 1 && (
          <button type="button" onClick={() => select(null)} className={`${ui.btnGhost} -ml-3`}>
            <ChevronLeft className="h-4 w-4" aria-hidden />
            Back to list
          </button>
        )}
        {order && order.of > 1 && (
          // The stack at a glance: approved, denied, this one, still to come. The subtitle says it in words.
          <div className="flex gap-1" aria-hidden>
            {order.run.map((r) => (
              <span
                key={r.key}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  r.key === keyOf(current)
                    ? "bg-ink-900"
                    : r.state === "approved"
                      ? "bg-brand-500"
                      : r.state === "denied"
                        ? "bg-danger-400"
                        : "bg-ink-200"
                }`}
              />
            ))}
          </div>
        )}
        {/* A new item slides in, so moving on is visible; after a decision, as a carousel. */}
        {/* Clipped both ways (with room for focus rings), so the animation never adds a scrollbar. */}
        <div className="relative -m-1 overflow-clip p-1">
          {outgoing && <DecidedCard key={outgoing.key} decision={outgoing} onDone={() => setOutgoing(null)} />}
          <div key={keyOf(current)} className={`${carousel ? "animate-carousel-in" : "animate-slide-in"} space-y-4`}>
            {first && order && (
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-900">
                Review their earlier {formatPeso(first.amount)} ({orderOf(first).number} of {order.of}) first.
                <button type="button" onClick={() => select(`payment-${first.id}`)} className={`${ui.link} font-bold`}>
                  Go to it
                </button>
              </p>
            )}
            {error && (
              <p className={ui.error} role="alert">
                {error}
              </p>
            )}
            {current.kind === "dispute" ? (
              <DisputeBody detail={detail} dispute={current.item} name={name} />
            ) : (
              <PaymentBody detail={detail} payment={current.item} name={name} />
            )}
            {denying && (
              <div>
                <label htmlFor="deny-reason" className={ui.label}>
                  {isDispute ? "Why isn't the change right?" : "Why are you denying it?"}
                </label>
                <textarea
                  id="deny-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={3}
                  autoFocus
                  placeholder={isDispute ? "e.g. The ₱2,000 matches my GCash." : "e.g. I didn't receive this in GCash."}
                  className={ui.input}
                />
                <p className={reasonError ? "mt-1.5 text-xs font-semibold text-danger-700" : ui.helperText}>
                  {reasonError ?? `${slot?.isViewer ? "This" : `${slot?.name} sees this`} so they know why.`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Sheet>
  );
}

/**
 * The card just decided, stamped approved or denied, on its way out to the left while the next one
 * comes in. It covers the incoming card's box exactly, so it never makes the sheet taller, and goes
 * away when its slide ends.
 */
function DecidedCard({ decision, onDone }: { decision: Decision; onDone: () => void }) {
  const Icon = decision.approved ? CircleCheck : CircleX;
  return (
    <div
      aria-hidden
      // The stamp's own pop ends first and bubbles up; only this card's slide ends it.
      onAnimationEnd={(e) => e.target === e.currentTarget && onDone()}
      className="animate-carousel-out pointer-events-none absolute inset-1 z-10 flex items-center justify-center gap-3 rounded-3xl border border-ink-200 bg-white shadow-card"
    >
      <Icon className={`animate-pop h-10 w-10 shrink-0 ${decision.approved ? "text-brand-600" : "text-danger-600"}`} />
      <span className="flex flex-col">
        <span className="font-heading text-2xl font-bold tabular-nums text-ink-900">{formatPeso(decision.amount)}</span>
        <span className={`text-sm font-bold ${decision.approved ? "text-brand-700" : "text-danger-700"}`}>
          {decision.approved ? "Approved" : "Denied"}
        </span>
      </span>
    </div>
  );
}

/**
 * R-DEC-30: a member's stack is done. Shows how it went and where they stand, then says where the
 * organizer goes next, so moving on to another member is a deliberate step.
 */
function FinishedStep({
  detail,
  finished,
  next,
  onClose,
}: {
  detail: GroupDetail;
  finished: Finished;
  next: { label: string; go: () => void } | null;
  onClose: () => void;
}) {
  const slot = detail.slots.find((s) => s.id === finished.slotId);
  const approvedCount = finished.states.filter((x) => x === "approved").length;
  const deniedCount = finished.states.length - approvedCount;
  // The open round, or one paid ahead (R-DEC-31); a closed round's payments went to debt.
  const standing = finished.round !== null ? standingOf(detail, finished.slotId, finished.round) : null;
  const roundWord = finished.round === detail.period?.number ? "this round" : `for round ${finished.round}`;
  const title = slot?.isViewer ? "Your payments: all reviewed" : `${slot?.name ?? "Member"}: all reviewed`;
  const count = finished.states.length;

  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      subtitle={`${finished.round ? `Round ${finished.round} · ` : ""}${count} ${count === 1 ? "payment" : "payments"}`}
      footer={
        next ? (
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              Close
            </button>
            <button type="button" onClick={next.go} className={`${ui.btnPrimary} min-h-11 flex-1`}>
              {next.label}
              <ChevronRight className="h-4 w-4" aria-hidden />
            </button>
          </div>
        ) : (
          <button type="button" onClick={onClose} className={`${ui.btnPrimary} min-h-11 w-full`}>
            Done
          </button>
        )
      }
    >
      <div className="animate-slide-in space-y-4 py-2 text-center">
        <div className="relative mx-auto w-fit">
          <Avatar name={slot?.name} size="lg" placeholder={slot?.kind === "PLACEHOLDER"} />
          <CircleCheck
            className="animate-pop absolute -bottom-1 -right-1 h-7 w-7 rounded-full bg-white text-brand-600"
            aria-hidden
          />
        </div>
        {count > 1 && (
          <div className="mx-auto flex max-w-xs gap-1" aria-hidden>
            {finished.states.map((state, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${state === "approved" ? "bg-brand-500" : "bg-danger-400"}`} />
            ))}
          </div>
        )}
        <p className="text-sm text-ink-600" role="status">
          {approvedCount > 0 && <b className="text-brand-700">{approvedCount} approved</b>}
          {approvedCount > 0 && deniedCount > 0 && " · "}
          {deniedCount > 0 && <b className="text-danger-700">{deniedCount} denied</b>}
        </p>
        {standing && (
          <p className="text-sm text-ink-600">
            {standing.approved >= standing.due
              ? `Paid in full ${roundWord}.`
              : `${formatPeso(standing.approved)} of ${formatPeso(standing.due)} paid ${roundWord}.`}
          </p>
        )}
      </div>
    </Sheet>
  );
}

function DisputeBody({ detail, dispute, name }: { detail: GroupDetail; dispute: DisputeView; name: string }) {
  const refund = refundFor(dispute.previousAmount, dispute.proposedAmount);
  // R-DEC-32: a payment made ahead is short for its own round.
  const roundWord = dispute.round === detail.period?.number ? "this round" : `for round ${dispute.round}`;
  return (
    <>
      <p className="flex items-center justify-center gap-3 rounded-2xl bg-ink-50 px-4 py-4 font-heading text-2xl font-bold tabular-nums text-ink-900">
        <span className="text-ink-500 line-through decoration-2">{formatPeso(dispute.previousAmount)}</span>
        <ArrowRight className="h-5 w-5 text-ink-400" aria-label="to" />
        <span>{formatPeso(dispute.proposedAmount)}</span>
      </p>
      <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
        <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">Reason</span>
        {dispute.reason}
      </p>
      <p className="text-sm text-ink-600">
        After approval:{" "}
        <b>
          {refund > 0
            ? `you owe ${name} a ${formatPeso(refund)} refund, and they're ${formatPeso(refund)} short ${roundWord}`
            : `${formatPeso(dispute.proposedAmount - dispute.previousAmount)} more counts from ${name}`}
        </b>
      </p>
      <p className="text-xs text-ink-500">Undecided at the payout, it expires and {formatPeso(dispute.previousAmount)} stands.</p>
    </>
  );
}

/** "Round 3", or "Rounds 1–4" for a payment split across rounds (R-DEC-33). */
function roundsOf(payment: Payment) {
  const label = roundsLabel(payment.parts.map((p) => p.round ?? 0));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** R-DEC-33: where each round of a split payment stands once it's approved. */
function PartsAfter({ detail, payment }: { detail: GroupDetail; payment: Payment }) {
  return (
    <ul aria-label="After approval" className="divide-y divide-ink-100 rounded-2xl bg-ink-50 px-4 text-sm">
      {payment.parts.map((part) => {
        const standing = standingOf(detail, part.slotId, part.round ?? undefined);
        const total = standing ? standing.approved + part.amount : 0;
        return (
          <li key={part.id} className="flex justify-between gap-3 py-2">
            <span className="text-ink-700">
              Round {part.round} · <span className="tabular-nums">{formatPeso(part.amount)}</span>
            </span>
            <span className="text-right font-semibold text-ink-900 tabular-nums">
              {!standing
                ? "toward debt (closed)"
                : periodStatus(standing.due, total, 0).status === "PAID"
                  ? "paid up"
                  : `${formatPeso(total)} of ${formatPeso(standing.due)}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function PaymentBody({ detail, payment, name }: { detail: GroupDetail; payment: Payment; name: string }) {
  // The open round, or a later one it was paid ahead for (R-DEC-31); a closed round's goes to debt.
  const counted =
    payment.type === "CONTRIBUTION" && (payment.round === detail.period?.number || isAhead(detail, payment));
  const standing = counted ? standingOf(detail, payment.slotId, payment.round ?? undefined) : null;
  const after = standing ? periodStatus(standing.due, standing.approved + payment.amount, 0).status : null;
  const owed = owedBy(detail, payment.slotId);
  return (
    <>
      {payment.proofUrl ? (
        <a
          href={payment.proofUrl}
          target="_blank"
          rel="noreferrer"
          className="group relative block overflow-hidden rounded-2xl border border-ink-200 bg-ink-50"
        >
          <img src={payment.proofUrl} alt={`Proof from ${name}`} className="max-h-72 w-full object-contain sm:max-h-96" />
          <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-ink-700 shadow-card">
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            Full size
          </span>
        </a>
      ) : (
        <p className="flex items-center gap-2 rounded-2xl bg-sun-50 px-4 py-3 text-sm font-semibold text-sun-900">
          <ImageOff className="h-4 w-4 shrink-0" aria-hidden />
          No proof attached
        </p>
      )}
      {payment.note && (
        <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
          <span className="block text-xs font-bold uppercase tracking-wide text-ink-500">Note</span>
          {payment.note}
        </p>
      )}
      {payment.parts.length > 1 ? (
        <PartsAfter detail={detail} payment={payment} />
      ) : (
        <p className="text-sm text-ink-600">
          {standing && after ? (
            <>
              After approval:{" "}
              <b>
                {after === "PAID" ? "paid up" : `${formatPeso(standing.approved + payment.amount)} of ${formatPeso(standing.due)} paid`}
                {payment.round !== detail.period?.number && ` for round ${payment.round}`}
              </b>
            </>
          ) : payment.amount > owed ? (
            // R-DEC-19: the server refuses it; say so before the organizer tries.
            <>
              {owed > 0 ? `${name} only owes ${formatPeso(owed)} now` : `${name} doesn't owe anything now`}, so this can&apos;t be
              approved. Deny it instead.
            </>
          ) : (
            <>
              {payment.type === "CONTRIBUTION" ? `Round ${payment.round} has closed, so this` : "This"} goes toward {name}&apos;s{" "}
              {formatPeso(owed)} debt, interest first.
            </>
          )}
        </p>
      )}
    </>
  );
}
