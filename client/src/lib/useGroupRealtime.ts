import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { getSupabaseRealtimeClient, isSupabaseRealtimeConfigured } from "./supabaseClient";


/**
 * Subscribe and report whether the channel is actually live. `onLive` only reflects this channel:
 * a replaced channel's late CLOSED must not mark its successor as down.
 */
function subscribeWithStatus(channel: RealtimeChannel, label: string, onLive: (live: boolean) => void) {
  let current = true;
  channel.subscribe((status, err) => {
    if (!current) return;
    if (status === "SUBSCRIBED") {
      onLive(true);
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
      onLive(false);
      if (import.meta.env.DEV && status !== "CLOSED") {
        console.warn(`[realtime] ${label} ${status}; falling back to polling`, err);
      }
    }
  });
  return () => {
    current = false;
  };
}

/**
 * Live updates for one group. The server broadcasts on `group:<id>` after every change; `onUpdate`
 * runs for each one. Reports whether the channel is live, so callers can poll when it isn't.
 */
export function useGroupRealtime(options: { groupId: string | undefined; enabled: boolean; onUpdate: () => void }) {
  const { groupId, enabled, onUpdate } = options;
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  const configured = isSupabaseRealtimeConfigured();
  const { data: tokenData } = useQuery({
    queryKey: ["realtime-token"],
    queryFn: () => api.getRealtimeToken(),
    enabled: configured && enabled && !!groupId,
    staleTime: 50 * 60 * 1000,
    retry: false,
  });
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!configured || !enabled || !groupId || !tokenData) return;
    const supabase = getSupabaseRealtimeClient(tokenData.accessToken);
    const channel = supabase.channel(`group:${groupId}`);
    channel.on("broadcast", { event: "group_update" }, () => onUpdateRef.current());
    const release = subscribeWithStatus(channel, `group:${groupId}`, setSubscribed);
    return () => {
      release();
      void supabase.removeChannel(channel);
    };
  }, [configured, enabled, groupId, tokenData]);

  return { realtimeActive: configured && !!tokenData && subscribed };
}

export function useNotificationsRealtime(options: {
  userId: string | undefined;
  enabled: boolean;
  onUpdate: () => void;
}) {
  const { userId, enabled, onUpdate } = options;
  const onUpdateRef = useRef(onUpdate);
  useEffect(() => {
    onUpdateRef.current = onUpdate;
  });

  const configured = isSupabaseRealtimeConfigured();

  const { data: tokenData } = useQuery({
    queryKey: ["realtime-token"],
    queryFn: () => api.getRealtimeToken(),
    enabled: configured && enabled && !!userId,
    staleTime: 50 * 60 * 1000,
    retry: false,
  });
  const [subscribed, setSubscribed] = useState(false);

  useEffect(() => {
    if (!configured || !enabled || !userId || !tokenData) return;

    const supabase = getSupabaseRealtimeClient(tokenData.accessToken);
    const channel = supabase.channel(`notifications:${userId}`);

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
      () => onUpdateRef.current(),
    );

    const release = subscribeWithStatus(channel, `notifications:${userId}`, setSubscribed);

    return () => {
      release();
      void supabase.removeChannel(channel);
    };
  }, [configured, enabled, userId, tokenData]);

  return { realtimeActive: configured && !!tokenData && subscribed };
}
