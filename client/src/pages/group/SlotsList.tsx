import { ChevronRight, Link2, Plus } from "lucide-react";
import type { GroupDetail, SlotView } from "../../api/client";
import { Avatar } from "../../components/Avatar";
import { can } from "@domain/lifecycle";
import { ui } from "../../lib/ui";
import { slotHasActions, slotTag } from "./slots";

/**
 * Every slot, filled or open. Organizers tap a row for its actions; members see a read-only list.
 * `onOpenSlot` is for open slots (invite or add a placeholder).
 */
export function SlotsList({
  detail,
  onSelect,
  onOpenSlot,
}: {
  detail: GroupDetail;
  onSelect?: (slot: SlotView) => void;
  onOpenSlot?: () => void;
}) {
  const { slots, openSlots } = detail;
  // The li holds the height, divider included, so rows are 72px like the Payout schedule's.
  const rowBase = "flex h-full w-full items-center gap-3 px-5 text-left";
  return (
    <section aria-labelledby="slots-heading">
      <h2 id="slots-heading" className={`${ui.sectionHeading} mb-3`}>
        Members
      </h2>
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {slots.map((slot) => {
          const body = (
            <>
              <Avatar name={slot.name} size="md" placeholder={slot.kind === "PLACEHOLDER"} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-ink-900">
                  {slot.name}
                </span>
                <span className="flex items-center gap-1 text-sm text-ink-500">
                  {slot.claimLink && <Link2 className="h-3.5 w-3.5" aria-hidden />}
                  {slotTag(slot)}
                </span>
              </span>
            </>
          );
          const actionable = onSelect && slotHasActions(slot, detail);
          return (
            <li key={slot.id} className={`h-18 ${slot.isViewer ? "bg-brand-50" : ""}`}>
              {actionable ? (
                <button type="button" onClick={() => onSelect(slot)} className={`${rowBase} transition-colors hover:bg-ink-50`}>
                  {body}
                  <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
                </button>
              ) : (
                <div className={rowBase}>{body}</div>
              )}
            </li>
          );
        })}
        {Array.from({ length: openSlots }, (_, i) => (
          <li key={`open-${i}`} className="h-18">
            {onOpenSlot ? (
              <button type="button" onClick={onOpenSlot} className={`${rowBase} text-ink-500 transition-colors hover:bg-brand-50`}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink-300" aria-hidden>
                  <Plus className="h-4 w-4" />
                </span>
                <span className="flex-1 text-base font-semibold">Open slot</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-ink-400" aria-hidden />
              </button>
            ) : (
              <div className={`${rowBase} text-ink-500`}>
                <span className="h-10 w-10 shrink-0 rounded-full border-2 border-dashed border-ink-300" aria-hidden />
                <span className="text-base font-semibold">Open slot</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The Members view of a running paluwagan: everyone once, by name. Debts are in the Debts view.
 * For the organizer, "Invite" on a placeholder: its claim link is how someone joins after launch
 * (R-CLM-03), since the invite link closes at launch (R-INV-06).
 */
export function MembersList({ detail, onInvite }: { detail: GroupDetail; onInvite: (slot: SlotView) => void }) {
  const { viewer, group } = detail;
  // By name: turns and roles are in Schedule; this is the list of people.
  const slots = [...detail.slots].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  return (
    <section aria-label="Members">
      <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
        {slots.map((slot) => {
          const canInvite = viewer.isOrganizer && slot.kind === "PLACEHOLDER" && can.claimPlaceholder(group.state);
          // 72px with the divider inside, like the Schedule rows, so the two views read alike.
          return (
            <li key={slot.id} className={`flex h-18 items-center gap-3 px-5 ${slot.isViewer ? "bg-brand-50" : ""}`}>
              <Avatar name={slot.name} size="md" placeholder={slot.kind === "PLACEHOLDER"} />
              <span className="min-w-0 flex-1 truncate text-base font-bold text-ink-900">{slot.name}</span>
              {canInvite && (
                <button type="button" onClick={() => onInvite(slot)} className={`shrink-0 ${ui.btnSecondarySm}`}>
                  Invite
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
