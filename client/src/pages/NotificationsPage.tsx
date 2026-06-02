import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NotificationItem } from "../api/client";
import { formatWhen } from "../lib/formatWhen";
import { ui } from "../lib/ui";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.markAllNotificationsRead(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const notifications = data?.notifications ?? [];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
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
            className={ui.btnGhost}
          >
            Mark all read
          </button>
        )}
      </div>

      {isLoading && <p className={`mt-8 ${ui.muted}`}>Loading…</p>}
      {error && <p className={`mt-8 ${ui.error}`}>Failed to load notifications.</p>}

      {!isLoading && !error && notifications.length === 0 && (
        <div className={`mt-10 ${ui.emptyState}`}>
          <p className="text-slate-600">No notifications yet.</p>
        </div>
      )}

      {notifications.length > 0 && (
        <ul className="mt-6 space-y-3">
          {notifications.map((n: NotificationItem) => (
            <li
              key={n.id}
              className={`rounded-2xl border px-4 py-3 ${
                n.isUnread
                  ? "border-emerald-100 bg-emerald-50/50"
                  : "border-gray-100 bg-white opacity-90"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium text-slate-900">{n.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {formatWhen(n.createdAt)}
                    {n.groupName && <> · {n.groupName}</>}
                  </p>
                </div>
                <div className="flex gap-2">
                  {n.link && (
                    <Link
                      to={n.link}
                      onClick={() => {
                        if (n.isUnread) void markRead.mutate(n.id);
                      }}
                      className={ui.link}
                    >
                      View
                    </Link>
                  )}
                  {n.isUnread && (
                    <button
                      type="button"
                      onClick={() => void markRead.mutateAsync(n.id)}
                      disabled={markRead.isPending}
                      className="text-sm font-normal text-slate-500 hover:text-slate-800"
                    >
                      Mark read
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
