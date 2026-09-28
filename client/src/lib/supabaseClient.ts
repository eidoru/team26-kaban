import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** One shared client for Realtime — avoids duplicate GoTrueClient warnings. */
let realtimeClient: SupabaseClient | null = null;

function getRealtimeClient(): SupabaseClient {
  if (!supabaseUrl || !supabasePublishableKey) {
    throw new Error("Supabase Realtime is not configured");
  }

  if (!realtimeClient) {
    realtimeClient = createClient(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
        storageKey: "kaban-realtime",
      },
    });
  }

  return realtimeClient;
}

export function isSupabaseRealtimeConfigured(): boolean {
  return Boolean(supabaseUrl && supabasePublishableKey);
}

export function getSupabaseRealtimeClient(accessToken: string): SupabaseClient {
  const client = getRealtimeClient();
  client.realtime.setAuth(accessToken);
  return client;
}
