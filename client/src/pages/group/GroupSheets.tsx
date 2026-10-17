import { useState } from "react";
import { UserPlus } from "lucide-react";
import type { GroupDetail, SlotView } from "../../api/client";
import { Field } from "../../components/flow/Field";
import { ShareLink } from "../../components/flow/ShareLink";
import { Sheet } from "../../components/flow/Sheet";
import { ui } from "../../lib/ui";

const NAME_MAX = 100;
const CONTACT_MAX = 200;

/**
 * The invite link (R-LOB-01), shown in the lobby's next-step panel while slots are open. Once made,
 * it's permanent.
 */
export function InviteLinkPanel({
  detail,
  pending,
  onCreateLink,
}: {
  detail: GroupDetail;
  pending: string | null;
  onCreateLink: () => void;
}) {
  const { group, inviteLink } = detail;
  return inviteLink ? (
    <ShareLink url={inviteLink.url} shareText={`Join ${group.name} on Kaban`} />
  ) : (
    <button type="button" onClick={onCreateLink} disabled={pending === "invite"} className={ui.btnPrimaryFull}>
      {pending === "invite" ? "Creating…" : "Create invite link"}
    </button>
  );
}

/**
 * Holding a slot for someone without an account (R-LOB-02). `onAddPlaceholder` resolves true when
 * the placeholder was added, which closes the sheet so the new slot shows on the board.
 */
export function PlaceholderSheet({
  open,
  pending,
  onClose,
  onAddPlaceholder,
}: {
  open: boolean;
  pending: string | null;
  onClose: () => void;
  onAddPlaceholder: (input: { name: string; contact?: string }) => Promise<boolean>;
}) {
  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const nameError = !name.trim() ? "Enter a name." : name.trim().length > NAME_MAX ? `Up to ${NAME_MAX} characters.` : null;
  const contactError = contact.trim().length > CONTACT_MAX ? `Up to ${CONTACT_MAX} characters.` : null;

  async function add() {
    if (nameError || contactError) return;
    if (await onAddPlaceholder({ name: name.trim(), contact: contact.trim() || undefined })) {
      setName("");
      setContact("");
      onClose();
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add a placeholder">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <p className="text-sm text-ink-500">
          For someone without an account. You record their payments, and they can claim the slot later.
        </p>
        <Field label="Name" error={nameError} hasValue={name !== ""}>
          {(props) => <input {...props} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />}
        </Field>
        <Field label="Contact (optional)" error={contactError} hasValue={contact !== ""} helper="Phone or Messenger, for your reference.">
          {(props) => <input {...props} value={contact} onChange={(e) => setContact(e.target.value)} autoComplete="off" />}
        </Field>
        <button type="submit" disabled={!!nameError || !!contactError || pending === "placeholder"} className={ui.btnPrimaryFull}>
          <UserPlus className="h-4 w-4" aria-hidden />
          {pending === "placeholder" ? "Adding…" : "Add placeholder"}
        </button>
      </form>
    </Sheet>
  );
}

/**
 * One slot's organizer actions: a placeholder's claim link (R-LOB-03) and removal (R-LOB-04), or
 * removing a member (R-LOB-05). Claim links work after launch too (R-CLM-03); removal doesn't.
 */
export function SlotSheet({
  slot,
  detail,
  pending,
  onClose,
  onCreateClaimLink,
  onRemove,
}: {
  slot: SlotView | null;
  detail: GroupDetail;
  pending: string | null;
  onClose: () => void;
  onCreateClaimLink: (slot: SlotView) => void;
  onRemove: (slot: SlotView) => void;
}) {
  if (!slot) return null;
  const inLobby = detail.group.state === "LOBBY";
  const isPlaceholder = slot.kind === "PLACEHOLDER";
  return (
    <Sheet
      open
      onClose={onClose}
      title={slot.name}
      subtitle={isPlaceholder ? (slot.contact ?? "Placeholder") : "Member"}
    >
      <div className="space-y-6">
        {isPlaceholder && (
          <section aria-label="Claim link">
            <div className="space-y-2">
              {slot.claimLink ? (
                <ShareLink url={slot.claimLink.url} shareText={`Claim your slot in ${detail.group.name} on Kaban`} />
              ) : (
                <button
                  type="button"
                  onClick={() => onCreateClaimLink(slot)}
                  disabled={pending === "claim-link"}
                  className={ui.btnPrimaryFull}
                >
                  {pending === "claim-link" ? "Creating…" : "Create claim link"}
                </button>
              )}
            </div>
          </section>
        )}
        {inLobby && (
          <section className={isPlaceholder ? "border-t border-ink-100 pt-6" : ""}>
            <button
              type="button"
              onClick={() => onRemove(slot)}
              disabled={pending === "remove"}
              className="w-full rounded-full border-2 border-danger-200 px-5 py-2.5 text-sm font-bold text-danger-700 transition-colors hover:bg-danger-50 disabled:opacity-50"
            >
              {isPlaceholder ? "Remove placeholder" : `Remove ${slot.name}`}
            </button>
            <p className="mt-2 text-center text-xs text-ink-500">
              {isPlaceholder
                ? "The slot opens up again."
                : "Their slot opens up again. They can rejoin with the invite link."}
              {slot.position != null && " The payout order resets."}
            </p>
          </section>
        )}
      </div>
    </Sheet>
  );
}
