import { runAfterResponse } from "./background.js";

export type GroupChangeScope = "contributions" | "rounds" | "memberships";

const BROADCAST_TIMEOUT_MS = 1500;

/**
 * Tell browsers subscribed to `group:<id>` that something changed, via Supabase Realtime's HTTP
 * broadcast endpoint: one request, no websocket handshake. Use notifyGroupChangeSafe from request
 * handlers, which keeps it alive past the response on Vercel.
 */
export async function notifyGroupChange(groupId: string, scope: GroupChangeScope): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secretKey) return;

  const res = await fetch(`${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // New-style secret keys (sb_secret_…) aren't JWTs: they go only in the apikey header.
      apikey: secretKey,
    },
    body: JSON.stringify({
      messages: [{ topic: `group:${groupId}`, event: "group_update", payload: { scope } }],
    }),
    signal: AbortSignal.timeout(BROADCAST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Realtime broadcast failed: ${res.status} ${await res.text().catch(() => "")}`);
  }
}

/**
 * Broadcast after the response is sent (reliably, via waitUntil) so it never adds latency or fails
 * the caller's request; clients also have a polling fallback.
 */
export function notifyGroupChangeSafe(groupId: string, scope: GroupChangeScope): void {
  runAfterResponse(`broadcast ${scope} for group ${groupId}`, notifyGroupChange(groupId, scope));
}

export function isGroupBroadcastConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}
