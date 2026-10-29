import { PENDING_INVITE_KEY } from "../api/client";

type PendingLink = { kind: "invite" | "claim"; token: string };

/** Remember an invite or claim link while the visitor logs in or registers (R-INV-02, R-CLM-04). */
export function stashPendingLink(link: PendingLink) {
  sessionStorage.setItem(PENDING_INVITE_KEY, JSON.stringify(link));
}

function readPendingLink(): PendingLink | null {
  try {
    const raw = sessionStorage.getItem(PENDING_INVITE_KEY);
    const link = raw ? (JSON.parse(raw) as PendingLink) : null;
    return link?.token && (link.kind === "invite" || link.kind === "claim") ? link : null;
  } catch {
    return null;
  }
}

/**
 * Where a visitor who just signed in should land: back on the link they came from. An invite joins
 * on arrival (R-INV-02); a claim waits for them to confirm, after seeing the slot's record (R-CLM-05).
 * Both the login pages and GuestRoute use this, so neither can send them home by mistake.
 */
export function pendingDestination(): string | null {
  const link = readPendingLink();
  if (!link) return null;
  return link.kind === "invite" ? `/invite/${link.token}?join=1` : `/claim/${link.token}`;
}

/** The landing page calls this once it has loaded, so the link isn't followed again later. */
export function clearPendingLink() {
  sessionStorage.removeItem(PENDING_INVITE_KEY);
}
