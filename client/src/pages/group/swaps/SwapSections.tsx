import { ArrowLeftRight } from "lucide-react";
import type { GroupDetail, SlotView, SwapView } from "../../../api/client";
import { Avatar } from "../../../components/Avatar";
import { Sheet } from "../../../components/flow/Sheet";
import { formatDueDate } from "../../../lib/dates";
import { ui } from "../../../lib/ui";
import { OPEN_SWAP, speaksFor, swapRequestBlocker, turnOf } from "./swaps";

/** Two turns side by side: who, which round, which date, and the trade between them. */
function TurnPair({ detail, left, right }: { detail: GroupDetail; left: string; right: string }) {
  const side = (slotId: string) => {
    const slot = detail.slots.find((s) => s.id === slotId);
    const turn = turnOf(detail, slotId);
    return (
      <div className="flex min-w-0 flex-1 flex-col items-center gap-1 text-center">
        <Avatar name={slot?.name} size="md" placeholder={slot?.kind === "PLACEHOLDER"} />
        <span className="w-full truncate text-sm font-bold text-ink-900">{slot?.isViewer ? "You" : slot?.name}</span>
        <span className="text-xs text-ink-500">
          Round {turn?.roundNumber} · {turn ? formatDueDate(turn.payoutDate) : ""}
        </span>
      </div>
    );
  };
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-ink-50 px-3 py-4">
      {side(left)}
      <ArrowLeftRight className="h-5 w-5 shrink-0 text-ink-400" aria-label="swaps with" />
      {side(right)}
    </div>
  );
}

/**
 * R-SWP-01: ask to trade turns with `slot`. Says why not when the rules block it, and what happens
 * next (the other side answers, then the organizer approves unless already a party, R-DEC-22).
 */
export function SwapSheet({
  detail,
  slot,
  pending,
  onClose,
  onRequest,
  onManageSlot,
}: {
  detail: GroupDetail;
  slot: SlotView | null;
  pending: string | null;
  onClose: () => void;
  onRequest: (slot: SlotView) => Promise<boolean>;
  /** Organizer, placeholder rows: open the slot's own actions (claim link). */
  onManageSlot?: (slot: SlotView) => void;
}) {
  if (!slot) return null;
  const blocker = swapRequestBlocker(detail, slot.id);
  const organizerDecides = !detail.viewer.isOrganizer && !slot.isOrganizer && slot.kind !== "PLACEHOLDER";
  const answerer = slot.kind === "PLACEHOLDER" ? detail.group.organizerName : slot.name;
  return (
    <Sheet
      open
      onClose={onClose}
      title={`Swap turns with ${slot.name}?`}
      footer={
        <button
          type="button"
          onClick={() => void onRequest(slot).then((done) => done && onClose())}
          disabled={!!blocker || pending === "swap"}
          className={`${ui.btnPrimaryFull} min-h-11`}
        >
          {pending === "swap" ? "Sending…" : `Ask ${answerer}`}
        </button>
      }
    >
      <div className="space-y-4">
        <TurnPair detail={detail} left={detail.viewer.slotId} right={slot.id} />
        {blocker ? (
          <p className={ui.warning}>{blocker}</p>
        ) : (
          <p className="text-sm text-ink-600">
            {answerer} gets to say yes or no first.
            {organizerDecides ? ` Then ${detail.group.organizerName} approves it. ` : " "}
            Each round keeps its date, so your payout dates trade too.
          </p>
        )}
        {onManageSlot && detail.viewer.isOrganizer && slot.kind === "PLACEHOLDER" && (
          <button type="button" onClick={() => onManageSlot(slot)} className={`${ui.link} block`}>
            Claim link for {slot.name}
          </button>
        )}
      </div>
    </Sheet>
  );
}

const STATUS_TEXT: Record<SwapView["status"], string> = {
  AWAITING_TARGET: "Waiting for an answer",
  AWAITING_ORGANIZER: "Agreed · waiting for the organizer",
  APPROVED: "Swapped",
  DECLINED: "Declined",
  DENIED: "Not approved",
  EXPIRED: "Expired",
  CANCELLED: "Withdrawn",
};

/**
 * Swaps in progress, with the viewer's actions (R-SWP-02): answer (the side asked), approve or deny
 * (organizer), withdraw (the side asking). The latest few settled ones show their outcome.
 */
export function SwapsList({
  detail,
  hideId,
  pending,
  onAccept,
  onDecline,
  onApprove,
  onDeny,
  onCancel,
}: {
  detail: GroupDetail;
  /** The swap already shown (with its actions) in the Now panel. */
  hideId?: string;
  pending: string | null;
  onAccept: (swap: SwapView) => void;
  onDecline: (swap: SwapView) => void;
  onApprove: (swap: SwapView) => void;
  onDeny: (swap: SwapView) => void;
  onCancel: (swap: SwapView) => void;
}) {
  const open = detail.swaps.filter((s) => OPEN_SWAP.includes(s.status) && s.id !== hideId);
  const settled = detail.swaps.filter((s) => !OPEN_SWAP.includes(s.status)).slice(0, 3);
  const shown = [...open, ...settled];
  if (shown.length === 0) return null;
  const busy = (swap: SwapView) => pending === `swap-${swap.id}`;
  return (
    <section aria-labelledby="swaps-heading">
      <h2 id="swaps-heading" className={`${ui.sectionHeading} mb-3`}>
        Turn swaps
      </h2>
      <ul className="space-y-3">
        {shown.map((swap) => {
          const answers = swap.status === "AWAITING_TARGET" && speaksFor(detail, swap.targetSlotId);
          const approves = swap.status === "AWAITING_ORGANIZER" && detail.viewer.isOrganizer;
          const withdraws = OPEN_SWAP.includes(swap.status) && speaksFor(detail, swap.requesterSlotId);
          return (
            <li key={swap.id} className="space-y-3 rounded-3xl border border-ink-200 bg-white p-4">
              <TurnPair detail={detail} left={swap.requesterSlotId} right={swap.targetSlotId} />
              <p className="text-sm font-semibold text-ink-700">
                {STATUS_TEXT[swap.status]}
                {swap.status === "DENIED" && swap.reviewNote && <span className="font-normal text-ink-600">: {swap.reviewNote}</span>}
              </p>
              {(answers || approves || withdraws) && (
                <div className="flex gap-2">
                  {answers && (
                    <>
                      <button type="button" onClick={() => onDecline(swap)} disabled={busy(swap)} className={`${ui.btnSecondary} min-h-11 flex-1`}>
                        Decline
                      </button>
                      <button type="button" onClick={() => onAccept(swap)} disabled={busy(swap)} className={`${ui.btnPrimary} min-h-11 flex-1`}>
                        Accept
                      </button>
                    </>
                  )}
                  {approves && (
                    <>
                      <button type="button" onClick={() => onDeny(swap)} disabled={busy(swap)} className={`${ui.btnSecondary} min-h-11 flex-1`}>
                        Deny
                      </button>
                      <button type="button" onClick={() => onApprove(swap)} disabled={busy(swap)} className={`${ui.btnPrimary} min-h-11 flex-1`}>
                        Approve
                      </button>
                    </>
                  )}
                  {withdraws && !answers && !approves && (
                    <button type="button" onClick={() => onCancel(swap)} disabled={busy(swap)} className={ui.btnGhost}>
                      Withdraw
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
