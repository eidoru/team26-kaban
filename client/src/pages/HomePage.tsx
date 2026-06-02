import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { api, type GroupSummary, type HomeAttentionItem, type NotificationItem } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatWhen } from "../lib/formatWhen";
import { formatFrequency } from "../lib/frequency";
import { displayInitials } from "../lib/initials";
import { patchNotificationRead } from "../lib/homeQueries";
import { statusBadgeClass, ui } from "../lib/ui";

function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className={ui.sectionHeader}>{title}</h2>
        {subtitle && <p className={ui.sectionSubtitle}>{subtitle}</p>}
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </div>
  );
}

function statusLabel(status: GroupSummary["status"]) {
  switch (status) {
    case "forming":
      return "Forming";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
  }
}

function groupStatusDetail(group: GroupSummary): string {
  const filled = group.filledCount ?? 0;

  if (group.status === "forming") {
    const open = group.openSlots ?? 0;
    if (open > 0) {
      return `${filled}/${group.slotCount} members · ${open} seat${open === 1 ? "" : "s"} open`;
    }
    return `${filled}/${group.slotCount} members · ready to start`;
  }
  if (group.status === "active") {
    return `${group.slotCount} members · cycle in progress`;
  }
  const collected = group.totalCollected != null ? Number(group.totalCollected) : null;
  const debt = group.outstandingDebt != null ? Number(group.outstandingDebt) : null;
  if (debt != null && debt > 0) {
    return `${group.slotCount} members · ₱${debt.toLocaleString()} still owed`;
  }
  if (collected != null && collected > 0) {
    return `${group.slotCount} members · ₱${collected.toLocaleString()} collected`;
  }
  return `${group.slotCount} members · finished`;
}

function formingFillPercent(group: GroupSummary): number {
  if (group.slotCount <= 0) return 0;
  return Math.min(100, Math.round(((group.filledCount ?? 0) / group.slotCount) * 100));
}

function HomeMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-medium tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

function GroupRow({
  group,
  onPrefetch,
  muted = false,
}: {
  group: GroupSummary;
  onPrefetch: (id: string) => void;
  muted?: boolean;
}) {
  const amount = `₱${Number(group.contributionAmount).toLocaleString()}`;
  const freq = formatFrequency(group.frequency, group.frequencyDays);
  const fillPercent = formingFillPercent(group);

  return (
    <Link
      to={`/groups/${group.id}`}
      onMouseEnter={() => onPrefetch(group.id)}
      onFocus={() => onPrefetch(group.id)}
      className={`flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-slate-50 ${
        muted ? "opacity-75" : ""
      }`}
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-medium text-white ${
          muted ? "bg-slate-400" : "bg-emerald-900"
        }`}
        aria-hidden
      >
        {displayInitials(group.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <h3 className="truncate font-medium text-slate-900">{group.name}</h3>
          {group.role === "manager" && (
            <span className="text-xs font-medium text-emerald-700">Organizing</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-sm text-slate-500">
          {amount} · {freq} · {groupStatusDetail(group)}
        </p>
        {group.status === "forming" && !muted && (
          <div className="mt-2 max-w-xs">
            <div className="h-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-emerald-600 transition-all"
                style={{ width: `${fillPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
      <span className={`${statusBadgeClass(group.status)} shrink-0`}>{statusLabel(group.status)}</span>
      <span className="shrink-0 text-slate-300" aria-hidden>
        →
      </span>
    </Link>
  );
}

function AttentionItem({ item }: { item: HomeAttentionItem }) {
  return (
    <Link
      to={item.link}
      className="flex items-start justify-between gap-3 border-l-2 border-amber-400 py-2 pl-4 pr-1 transition-colors hover:bg-amber-50/40"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{item.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{item.body}</p>
      </div>
      <span className="shrink-0 pt-0.5 text-slate-400" aria-hidden>
        →
      </span>
    </Link>
  );
}

function ActivityRow({
  item,
  onNavigate,
}: {
  item: NotificationItem;
  onNavigate: (link: string) => void;
}) {
  const content = (
    <div className="flex gap-3">
      <span
        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
          item.isUnread ? "bg-emerald-600" : "bg-transparent"
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-900">{item.title}</p>
        <p className="mt-0.5 line-clamp-1 text-sm text-slate-600">{item.body}</p>
        <p className="mt-1 text-xs text-slate-400">
          {item.groupName && <span>{item.groupName} · </span>}
          <time>{formatWhen(item.createdAt)}</time>
        </p>
      </div>
    </div>
  );

  const className =
    "block w-full rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-slate-50";

  if (item.link) {
    return (
      <button type="button" onClick={() => onNavigate(item.link!)} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [pastExpanded, setPastExpanded] = useState(false);

  const {
    data: groupsData,
    isLoading: groupsLoading,
    error: groupsError,
  } = useQuery({
    queryKey: ["groups"],
    queryFn: () => api.groups(),
    staleTime: 60_000,
  });

  const { data: overviewData, error: overviewError } = useQuery({
    queryKey: ["home-overview"],
    queryFn: () => api.getHomeOverview(),
    staleTime: 30_000,
  });

  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.getNotifications(),
    staleTime: 30_000,
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

  function prefetchGroup(groupId: string) {
    void queryClient.prefetchQuery({
      queryKey: ["group", groupId],
      queryFn: () => api.getGroup(groupId),
      staleTime: 60_000,
    });
  }

  const recentActivity = (notificationsData?.notifications ?? []).slice(0, 6);

  function handleActivityNavigate(link: string, notificationId: string, isUnread: boolean) {
    if (isUnread) void markRead.mutate(notificationId);
    navigate(link);
  }

  const groups = groupsData?.groups ?? [];
  const ongoing = groups.filter((g) => g.status !== "completed");
  const past = groups.filter((g) => g.status === "completed");
  const stats = overviewData?.stats;
  const firstName = user?.displayName?.split(/\s+/)[0] ?? "there";

  const metrics = [
    stats && stats.paymentsDue > 0
      ? { label: "Due now", value: String(stats.paymentsDue), hint: "payments this cycle" }
      : null,
    stats && stats.pendingConfirmations > 0
      ? {
          label: "To confirm",
          value: String(stats.pendingConfirmations),
          hint: "awaiting your review",
        }
      : null,
    stats && stats.totalOwed != null && Number(stats.totalOwed) > 0
      ? {
          label: "Owed to you",
          value: `₱${Number(stats.totalOwed).toLocaleString()}`,
          hint: "outstanding obligations",
        }
      : null,
    stats && stats.unreadNotifications > 0
      ? { label: "Unread", value: String(stats.unreadNotifications), hint: "notifications" }
      : null,
  ].filter(Boolean) as { label: string; value: string; hint: string }[];

  const subtitle =
    ongoing.length === 0
      ? "Create a paluwagan or join one with an invite link."
      : stats && metrics.length > 0
        ? `${ongoing.length} group${ongoing.length === 1 ? "" : "s"} · ${metrics.length} item${metrics.length === 1 ? "" : "s"} need attention`
        : `${ongoing.length} ongoing paluwagan${ongoing.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className={ui.pageTitle}>Hello, {firstName}</h1>
          <p className={ui.pageSubtitle}>{subtitle}</p>
        </div>
        <Link to="/groups/new" className={`${ui.btnPrimarySm} shrink-0`}>
          New paluwagan
        </Link>
      </header>

      {groupsError && (
        <p className={ui.error}>
          Failed to load your groups. Check that the API and database are running.
        </p>
      )}
      {overviewError && !groupsError && (
        <p className={ui.error}>Some dashboard details could not be loaded.</p>
      )}

      {groupsLoading && groups.length === 0 && <p className={ui.muted}>Loading your groups…</p>}

      {!groupsLoading && !groupsError && groups.length === 0 && (
        <div className={ui.emptyState}>
          <p className="text-lg font-medium text-slate-900">No paluwagans yet</p>
          <p className={`mt-2 ${ui.muted}`}>
            Start one for your group or join with an invite link from your organizer.
          </p>
          <Link to="/groups/new" className={`mt-5 inline-block ${ui.btnPrimarySm}`}>
            Create your first paluwagan
          </Link>
        </div>
      )}

      {groups.length > 0 && metrics.length > 0 && (
        <div className={`${ui.metricGrid2} sm:grid-cols-2 lg:grid-cols-4`}>
          {metrics.map((metric) => (
            <HomeMetric key={metric.label} {...metric} />
          ))}
        </div>
      )}

      {!groupsLoading && !groupsError && overviewData && overviewData.attention.length > 0 && (
        <section className={ui.sectionCard}>
          <SectionHeader
            title="Needs action"
            subtitle={`${overviewData.attention.length} item${overviewData.attention.length === 1 ? "" : "s"}`}
          />
          <ul className="divide-y divide-gray-100">
            {overviewData.attention.map((item) => (
              <li key={item.id} className="first:pt-0 last:pb-0">
                <AttentionItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ongoing.length > 0 && (
        <section className={`${ui.sectionCard} p-0`}>
          <div className="border-b border-gray-100 px-6 py-4">
            <SectionHeader title="Your groups" subtitle={`${ongoing.length} active or forming`} />
          </div>
          <ul className="divide-y divide-gray-100">
            {ongoing.map((group) => (
              <li key={group.id}>
                <GroupRow group={group} onPrefetch={prefetchGroup} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className={ui.sectionCard}>
        <SectionHeader
          title="Recent activity"
          subtitle={
            notificationsData?.unreadCount
              ? `${notificationsData.unreadCount} unread`
              : "Latest updates across your groups"
          }
          action={
            <Link to="/notifications" className={ui.link}>
              View all
            </Link>
          }
        />
        {notificationsLoading ? (
          <p className={`${ui.muted} text-sm`}>Loading activity…</p>
        ) : recentActivity.length === 0 ? (
          <p className={`${ui.muted} text-sm`}>No updates yet.</p>
        ) : (
          <ul className="max-h-64 divide-y divide-gray-50 overflow-y-auto">
            {recentActivity.map((item) => (
              <li key={item.id}>
                <ActivityRow
                  item={item}
                  onNavigate={(link) => handleActivityNavigate(link, item.id, item.isUnread)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {past.length > 0 && (
        <section className={`${ui.sectionCard} p-0`}>
          <button
            type="button"
            onClick={() => setPastExpanded((v) => !v)}
            className="flex w-full items-center justify-between px-6 py-4 text-left"
          >
            <div>
              <h2 className={ui.sectionHeader}>
                Completed{past.length > 1 ? ` (${past.length})` : ""}
              </h2>
              <p className={ui.sectionSubtitle}>Past paluwagans</p>
            </div>
            {past.length > 2 && (
              <span className={`${ui.link} shrink-0`}>{pastExpanded ? "Hide" : "Show all"}</span>
            )}
          </button>
          {(past.length <= 2 || pastExpanded) && (
            <ul className="divide-y divide-gray-100 border-t border-gray-100">
              {past.map((group) => (
                <li key={group.id}>
                  <GroupRow group={group} onPrefetch={prefetchGroup} muted />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
