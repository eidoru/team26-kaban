import type { QueryClient } from "@tanstack/react-query";
import { api, type NotificationItem } from "../api/client";
import { isSupabaseRealtimeConfigured } from "./supabaseClient";
import { queryClient } from "./queryClient";

type NotificationsData = { notifications: NotificationItem[]; unreadCount: number };

export const myGroupsKey = ["groups"] as const;
/** The home dashboard (§15.2), shared by Home and Money. */
export const homeKey = ["home"] as const;

export function prefetchRealtimeToken() {
  if (!isSupabaseRealtimeConfigured()) return;
  void queryClient.prefetchQuery({
    queryKey: ["realtime-token"],
    queryFn: () => api.getRealtimeToken(),
    staleTime: 50 * 60 * 1000,
  });
}

/** Warm the first screens right after signing in. */
export function prefetchHomeData() {
  void queryClient.prefetchQuery({ queryKey: homeKey, queryFn: () => api.home() });
  void queryClient.prefetchQuery({ queryKey: ["notifications"], queryFn: () => api.getNotifications() });
  prefetchRealtimeToken();
}

export function invalidateHomeLists(client: QueryClient) {
  void client.invalidateQueries({ queryKey: myGroupsKey });
  void client.invalidateQueries({ queryKey: homeKey });
}

export function patchNotificationRead(client: QueryClient, notificationId: string) {
  client.setQueryData<NotificationsData>(["notifications"], (current) => {
    if (!current) return current;
    let wasUnread = false;
    const notifications = current.notifications.map((item) => {
      if (item.id !== notificationId) return item;
      if (item.isUnread) wasUnread = true;
      return { ...item, isUnread: false };
    });
    return { notifications, unreadCount: wasUnread ? Math.max(0, current.unreadCount - 1) : current.unreadCount };
  });
}

export function patchAllNotificationsRead(client: QueryClient) {
  client.setQueryData<NotificationsData>(["notifications"], (current) =>
    current
      ? { notifications: current.notifications.map((item) => ({ ...item, isUnread: false })), unreadCount: 0 }
      : current,
  );
}
