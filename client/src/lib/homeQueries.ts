import type { QueryClient } from "@tanstack/react-query";
import type { HomeOverview, NotificationItem } from "../api/client";
import { api } from "../api/client";
import { isSupabaseRealtimeConfigured } from "./supabaseClient";
import { queryClient } from "./queryClient";

export function prefetchHomeData() {
  void queryClient.prefetchQuery({
    queryKey: ["groups"],
    queryFn: () => api.groups(),
  });
  void queryClient.prefetchQuery({
    queryKey: ["home-overview"],
    queryFn: () => api.getHomeOverview(),
  });
  void queryClient.prefetchQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });
  if (isSupabaseRealtimeConfigured()) {
    void queryClient.prefetchQuery({
      queryKey: ["realtime-token"],
      queryFn: () => api.getRealtimeToken(),
      staleTime: 50 * 60 * 1000,
    });
  }
}

export function invalidateHomeLists(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["groups"] });
  void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
}

export function patchNotificationRead(queryClient: QueryClient, notificationId: string) {
  queryClient.setQueryData<{ notifications: NotificationItem[]; unreadCount: number }>(
    ["notifications"],
    (current) => {
      if (!current) return current;
      let wasUnread = false;
      const notifications = current.notifications.map((item) => {
        if (item.id !== notificationId) return item;
        if (item.isUnread) wasUnread = true;
        return { ...item, isUnread: false };
      });
      return {
        notifications,
        unreadCount: wasUnread ? Math.max(0, current.unreadCount - 1) : current.unreadCount,
      };
    },
  );

  queryClient.setQueryData<HomeOverview>(["home-overview"], (current) => {
    if (!current?.stats?.unreadNotifications) return current;
    return {
      ...current,
      stats: {
        ...current.stats,
        unreadNotifications: Math.max(0, current.stats.unreadNotifications - 1),
      },
    };
  });
}

export function patchAllNotificationsRead(queryClient: QueryClient) {
  queryClient.setQueryData<{ notifications: NotificationItem[]; unreadCount: number }>(
    ["notifications"],
    (current) => {
      if (!current) return current;
      return {
        notifications: current.notifications.map((item) => ({ ...item, isUnread: false })),
        unreadCount: 0,
      };
    },
  );

  queryClient.setQueryData<HomeOverview>(["home-overview"], (current) => {
    if (!current) return current;
    return {
      ...current,
      stats: { ...current.stats, unreadNotifications: 0 },
    };
  });
}

export function prefetchRealtimeToken() {
  if (!isSupabaseRealtimeConfigured()) return;
  void queryClient.prefetchQuery({
    queryKey: ["realtime-token"],
    queryFn: () => api.getRealtimeToken(),
    staleTime: 50 * 60 * 1000,
  });
}
