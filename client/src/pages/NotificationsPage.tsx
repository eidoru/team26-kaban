import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type NotificationItem } from "../api/client";
import { patchAllNotificationsRead, patchNotificationRead } from "../lib/homeQueries";
import { formatDayHeading } from "../lib/dates";
import { ui } from "../lib/ui";
import { BellOff, Check, ChevronRight } from "lucide-react";
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
  // Newest first from the API; bucket consecutive items by local day.
  const days: { key: string; label: string; items: NotificationItem[] }[] = [];
  for (const n of notifications) {
    const date = new Date(n.createdAt);
    const key = date.toDateString();
    const last = days.at(-1);
    if (last && last.key === key) last.items.push(n);
    else days.push({ key, label: formatDayHeading(date), items: [n] });
  }

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

      {days.length > 0 && (
        <div className="mt-8 space-y-6">
          {days.map((day) => (
            <section key={day.key}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{day.label}</h2>
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card">
                {day.items.map((n) => (
                  <NotificationRow
                    key={n.id}
                    n={n}
                    markReadPending={markRead.isPending}
                    onMarkRead={() => void markRead.mutate(n.id)}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** One tappable row: opens the link (and marks read), or just marks read; ✓ marks read in place. */
function NotificationRow({
  n,
  markReadPending,
  onMarkRead,
}: {
  n: NotificationItem;
  markReadPending: boolean;
  onMarkRead: () => void;
}) {
  const time = new Date(n.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const content = (
    <>
      <NotificationIcon type={n.type} size="responsive" />
      <span className="min-w-0 flex-1">
        <span className={`block text-ink-900 ${n.isUnread ? "font-bold" : "font-semibold"}`}>
          {n.isUnread && <span className="sr-only">Unread: </span>}
          {n.title}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-sm text-ink-600">{n.body}</span>
        <span className="mt-1 block text-xs text-ink-500">
          {time}
          {n.groupName && <> · {n.groupName}</>}
        </span>
      </span>
      {n.isUnread && <span aria-hidden className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand-600" />}
      {n.link && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-400" aria-hidden />}
    </>
  );
  const rowClass =
    "flex min-h-16 min-w-0 flex-1 items-start gap-3 py-3.5 pl-4 text-left transition-colors hover:bg-ink-50 sm:pl-5";

  return (
    <li className={`flex items-start ${n.isUnread ? "bg-brand-50/60" : ""}`}>
      {n.link ? (
        <Link
          to={n.link}
          onClick={() => {
            if (n.isUnread) onMarkRead();
          }}
          className={`${rowClass} ${n.isUnread ? "pr-1" : "pr-4 sm:pr-5"}`}
        >
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => {
            if (n.isUnread) onMarkRead();
          }}
          className={`${rowClass} ${n.isUnread ? "pr-1" : "pr-4 sm:pr-5"}`}
        >
          {content}
        </button>
      )}
      {n.isUnread && (
        <button
          type="button"
          onClick={onMarkRead}
          disabled={markReadPending}
          aria-label={`Mark "${n.title}" as read`}
          className="mr-2 mt-2.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-500 transition-colors hover:bg-white hover:text-brand-700 disabled:opacity-50 sm:mr-3"
        >
          <Check className="h-4 w-4" aria-hidden />
        </button>
      )}
    </li>
  );
}
