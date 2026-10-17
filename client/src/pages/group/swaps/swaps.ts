import { swapBlocker, type SwapTurn } from "@domain/swaps";
import type { GroupDetail, SwapView } from "../../../api/client";
import { todayInManila } from "../../../lib/dates";

export const OPEN_SWAP: SwapView["status"][] = ["AWAITING_TARGET", "AWAITING_ORGANIZER"];

/** A slot's payout turn, in the shape the shared swap rules take. */
export function turnOf(detail: GroupDetail, slotId: string): SwapTurn | null {
  const round = detail.schedule.find((r) => r.recipientSlotId === slotId);
  if (!round) return null;
  return {
    slotId,
    roundNumber: round.number,
    paidOut: round.status === "CLOSED",
    isOpenRound: round.status === "OPEN",
    payoutDate: round.payoutDate,
  };
}

/** Why the viewer can't ask to swap with `slotId` right now, or null (R-SWP-01/03, R-DEC-23). */
export function swapRequestBlocker(detail: GroupDetail, slotId: string): string | null {
  const mine = turnOf(detail, detail.viewer.slotId);
  const theirs = turnOf(detail, slotId);
  if (!mine || !theirs) return "Turns aren't set yet.";
  const rule = swapBlocker(mine, theirs, todayInManila());
  if (rule) return rule;
  const busy = detail.swaps.some(
    (s) => OPEN_SWAP.includes(s.status) && [s.requesterSlotId, s.targetSlotId].some((id) => id === slotId || id === mine.slotId),
  );
  return busy ? "One of you already has a swap in progress. Settle that one first." : null;
}

/** Whether the viewer answers for this slot: it's theirs, or a placeholder and they organize (R-DEC-22). */
export function speaksFor(detail: GroupDetail, slotId: string): boolean {
  const slot = detail.slots.find((s) => s.id === slotId);
  return !!slot && (slot.isViewer || (detail.viewer.isOrganizer && slot.kind === "PLACEHOLDER"));
}

/** The swap the viewer has to act on next: answer a request, or (organizer) approve one. */
export function swapToActOn(detail: GroupDetail): { swap: SwapView; as: "target" | "organizer" } | null {
  const answer = detail.swaps.find((s) => s.status === "AWAITING_TARGET" && speaksFor(detail, s.targetSlotId));
  if (answer) return { swap: answer, as: "target" };
  const approve = detail.viewer.isOrganizer && detail.swaps.find((s) => s.status === "AWAITING_ORGANIZER");
  return approve ? { swap: approve, as: "organizer" } : null;
}
