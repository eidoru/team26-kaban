import type { GroupDetail, SlotView } from "../../api/client";

/** The order as slot ids, first payout first, or null when it isn't set yet. */
export function currentOrder(detail: GroupDetail): string[] | null {
  return detail.schedule.every((r) => r.recipientSlotId) ? detail.schedule.map((r) => r.recipientSlotId!) : null;
}

/** How a slot came to be: organizer, placeholder (with or without a claim link) or joined member. */
export function slotTag(slot: SlotView): string {
  if (slot.isOrganizer) return "Organizer";
  if (slot.kind === "PLACEHOLDER") return slot.claimLink ? "Placeholder · claim link sent" : "Placeholder";
  return slot.claimedAt ? "Claimed a placeholder" : "Joined";
}

/**
 * Whether tapping this slot does anything for the viewer: ask to swap turns (running), a
 * placeholder's claim link (organizer, any time it can be claimed), or removing someone (lobby).
 */
export function slotHasActions(slot: SlotView, detail: GroupDetail): boolean {
  if (slot.isViewer) return false;
  // While it runs, anyone can ask to swap with an upcoming turn (§9).
  if (detail.group.state === "ACTIVE") {
    return slot.kind === "PLACEHOLDER" || detail.schedule.some((r) => r.recipientSlotId === slot.id && r.status !== "CLOSED");
  }
  return slot.kind === "PLACEHOLDER" || detail.group.state === "LOBBY";
}
