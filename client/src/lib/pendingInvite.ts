import { api, getStoredTokens, PENDING_INVITE_KEY } from "../api/client";

/**
 * After login/register, resolve an invite token stashed in sessionStorage before the
 * user was redirected to auth. Lives outside InvitePages.tsx (a components-only file)
 * so Vite's Fast Refresh can hot-reload that page without a full reload.
 */
export async function resolvePendingInvite(navigate: (path: string) => void): Promise<boolean> {
  const token = sessionStorage.getItem(PENDING_INVITE_KEY);
  if (!token || !getStoredTokens()) return false;

  try {
    const preview = await api.previewInvite(token);
    if (preview.invite.alreadyMember) {
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      navigate(`/groups/${preview.group.id}`);
      return true;
    }
    if (!preview.invite.canJoin) {
      const path = preview.invite.type === "membership_claim" ? `/claim/${token}` : `/invite/${token}`;
      navigate(path);
      return true;
    }
    const result = await api.resolveInvite(token);
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    navigate(`/groups/${result.groupId}`);
    return true;
  } catch {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    return false;
  }
}
