import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type GroupChangeScope = "contributions" | "rounds" | "memberships";

let serviceClient: SupabaseClient | null = null;

function getServiceClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  if (!serviceClient) {
    serviceClient = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

/** Push a group change to browsers subscribed on the group channel (e.g. after cron advance-round). */
export async function notifyGroupChange(
  groupId: string,
  scope: GroupChangeScope,
): Promise<void> {
  const supabase = getServiceClient();
  if (!supabase) return;

  await new Promise<void>((resolve, reject) => {
    const channel = supabase.channel(`group:${groupId}`);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        void channel
          .send({
            type: "broadcast",
            event: "group_update",
            payload: { scope },
          })
          .then(() => {
            void supabase.removeChannel(channel);
            resolve();
          })
          .catch(reject);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        void supabase.removeChannel(channel);
        reject(new Error(`Realtime broadcast failed: ${status}`));
      }
    });
  });
}

export function isGroupBroadcastConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
