export type GroupChangeScope = "contributions" | "rounds" | "memberships";

const BROADCAST_TIMEOUT_MS = 1500;

/**
 * Tell browsers subscribed to `group:<id>` that something changed, via Supabase Realtime's HTTP
 * broadcast endpoint: one request, no websocket handshake. Callers must await it (see
 * notifyGroupChangeSafe) — on Vercel, work left running after the response is usually dropped.
 */
export async function notifyGroupChange(groupId: string, scope: GroupChangeScope): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  const res = await fetch(`${url.replace(/\/$/, "")}/realtime/v1/api/broadcast`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
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

/** Broadcast without ever failing the caller's request; clients also have a polling fallback. */
export async function notifyGroupChangeSafe(groupId: string, scope: GroupChangeScope): Promise<void> {
  try {
    await notifyGroupChange(groupId, scope);
  } catch (err) {
    console.error(`Failed to broadcast ${scope} change for group ${groupId}`, err);
  }
}

export function isGroupBroadcastConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
