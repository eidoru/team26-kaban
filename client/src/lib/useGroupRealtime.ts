import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { getSupabaseRealtimeClient, isSupabaseRealtimeConfigured } from "./supabaseClient";

export type GroupRealtimeScope = "contributions" | "rounds" | "memberships";

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

export function useGroupRealtime(options: {
  groupId: string | undefined;
  enabled: boolean;
  currentRoundId: string | undefined;
  onUpdate: (scope: GroupRealtimeScope) => void;
}) {
  const { groupId, enabled, currentRoundId, onUpdate } = options;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  const configured = isSupabaseRealtimeConfigured();

  const {
    data: tokenData,
    isSuccess: tokenReady,
    isError: tokenFailed,
  } = useQuery({
    queryKey: ["realtime-token"],
    queryFn: () => api.getRealtimeToken(),
    enabled: configured && enabled && !!groupId,
    staleTime: 50 * 60 * 1000,
    retry: false,
  });

  const [subscribed, setSubscribed] = useState(false);
  // Only "active" once the channel reports SUBSCRIBED, so the polling fallback kicks in whenever
  // realtime silently fails (bad token, policy error, dropped connection).
  const realtimeActive = configured && tokenReady && !!tokenData && subscribed;

  useEffect(() => {
    if (!configured || !enabled || !groupId || !tokenData) return;

    const supabase = getSupabaseRealtimeClient(tokenData.accessToken);
    const channel = supabase.channel(`group:${groupId}`);

    channel.on("broadcast", { event: "group_update" }, ({ payload }) => {
      const scope = (payload as { scope?: GroupRealtimeScope })?.scope;
      if (scope) onUpdateRef.current(scope);
    });

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "memberships", filter: `group_id=eq.${groupId}` },
      () => onUpdateRef.current("memberships"),
    );

    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rounds", filter: `group_id=eq.${groupId}` },
      () => onUpdateRef.current("rounds"),
    );

    if (currentRoundId) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "contributions",
          filter: `round_id=eq.${currentRoundId}`,
        },
        () => onUpdateRef.current("contributions"),
      );
    }

    const release = subscribeWithStatus(channel, `group:${groupId}`, setSubscribed);

    return () => {
      release();
      void supabase.removeChannel(channel);
    };
  }, [configured, enabled, groupId, tokenData, currentRoundId]);

  return { realtimeActive, realtimeConfigured: configured, tokenFailed };
}

export function useNotificationsRealtime(options: {
  userId: string | undefined;
  enabled: boolean;
  onUpdate: () => void;
}) {
  const { userId, enabled, onUpdate } = options;
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

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

export function isRealtimeFallbackNeeded(
  configured: boolean,
  realtimeActive: boolean,
  tokenFailed: boolean,
): boolean {
  return !configured || tokenFailed || !realtimeActive;
}
