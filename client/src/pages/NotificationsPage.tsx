import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NotificationItem } from "../api/client";
import { patchAllNotificationsRead, patchNotificationRead } from "../lib/homeQueries";
import { formatWhen } from "../lib/formatWhen";
import { ui } from "../lib/ui";
import { BellOff } from "lucide-react";
import { NotificationIcon } from "../components/NotificationIcon";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onMutate: (notificationId) => {
      patchNotificationRead(queryClient, notificationId);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onMutate: () => {
      patchAllNotificationsRead(queryClient);
    },
    onError: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
    },
  });

  const notifications = data?.notifications ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={ui.pageTitle}>Notifications</h1>
          <p className={ui.pageSubtitle}>
            {data?.unreadCount ? `${data.unreadCount} unread` : "You're all caught up"}
          </p>
        </div>
        {(data?.unreadCount ?? 0) > 0 && (
          <button
            type="button"
            onClick={() => void markAllRead.mutateAsync()}
            disabled={markAllRead.isPending}
            className={ui.btnSecondarySm}
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading && (
        <div className="mt-8 space-y-3" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${ui.skeleton} h-20`} />
          ))}
        </div>
      )}
      {error && <p className={`mt-8 ${ui.error}`}>Failed to load notifications.</p>}

      {!isLoading && !error && notifications.length === 0 && (
        <div className={`mt-10 ${ui.emptyState} flex flex-col items-center`}>
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white text-ink-500" aria-hidden>
            <BellOff className="h-7 w-7" />
          </span>
          <p className="font-heading mt-4 text-xl font-bold text-ink-900">Nothing new yet</p>
          <p className={`mt-1 max-w-sm text-sm ${ui.muted}`}>
            Payment confirmations, turn reminders and disputes from your groups will show up here.
          </p>
        </div>
      )}

      {notifications.length > 0 && (
        <ul className="mt-8 divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card">
          {notifications.map((n: NotificationItem) => (
            <li key={n.id} className={`flex gap-3 px-4 py-4 sm:px-5 ${n.isUnread ? "bg-brand-50/60" : ""}`}>
              <NotificationIcon type={n.type} />
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-ink-900 ${n.isUnread ? "font-bold" : "font-semibold"}`}>{n.title}</p>
                  {n.isUnread && (
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />
                  )}
                </div>
                <p className="mt-0.5 text-sm text-ink-600">{n.body}</p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                  <p className="text-xs text-ink-500">
                    {formatWhen(n.createdAt)}
                    {n.groupName && <> · {n.groupName}</>}
                  </p>
                  <div className="flex items-center gap-1">
                    {n.isUnread && (
                      <button
                        type="button"
                        onClick={() => void markRead.mutateAsync(n.id)}
                        disabled={markRead.isPending}
                        className={ui.btnGhost}
                      >
                        Mark read
                      </button>
                    )}
                    {n.link && (
                      <Link
                        to={n.link}
                        onClick={() => {
                          if (n.isUnread) void markRead.mutate(n.id);
                        }}
                        className={ui.btnSecondarySm}
                      >
                        View
                      </Link>
                    )}
                  </div>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
