import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { api, type GroupSummary, type HomeAttentionItem, type NotificationItem } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatWhen } from "../lib/formatWhen";
import { formatFrequency } from "../lib/frequency";
import { ArrowRight, BadgeCheck, CircleAlert, Clock, Users, Wallet, type LucideIcon } from "lucide-react";
import { Avatar } from "../components/Avatar";
import { KabanChest } from "../components/Illustration";
import { StatCard, type StatCardIconName, type StatCardTone } from "../components/StatCard";
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

function GroupTile({
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
      className={`group flex h-full flex-col gap-4 rounded-3xl border border-ink-200 bg-white p-5 shadow-card transition-all motion-safe:hover:-translate-y-0.5 hover:shadow-lift ${
        muted ? "opacity-80" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar name={group.name} size="md" shape="tile" className={muted ? "grayscale" : ""} />
        <div className="min-w-0 flex-1">
          <h3 className="font-heading truncate text-lg font-bold text-ink-900">{group.name}</h3>
          <p className="mt-0.5 truncate text-sm text-ink-500">
            {amount} · {freq}
          </p>
        </div>
        <span className={`${statusBadgeClass(group.status)} shrink-0`}>{statusLabel(group.status)}</span>
      </div>

      {group.status === "forming" && !muted && (
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-100" aria-hidden>
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
            style={{ width: `${fillPercent}%` }}
          />
        </div>
      )}

      <div className="mt-auto flex items-center justify-between gap-3 text-sm">
        <span className="min-w-0 truncate font-semibold text-ink-600">{groupStatusDetail(group)}</span>
        <span className="flex shrink-0 items-center gap-2">
          {group.role === "manager" && (
            <span className="rounded-full bg-sun-100 px-2.5 py-0.5 text-xs font-bold text-sun-800">
              Organizing
            </span>
          )}
          <ArrowRight
            className="h-4 w-4 text-ink-400 transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </span>
      </div>
    </Link>
  );
}

const ATTENTION_ICON: Record<HomeAttentionItem["kind"], LucideIcon> = {
  forming_ready: BadgeCheck,
  forming_slots: Users,
  confirm_payments: BadgeCheck,
  payment_due: Clock,
  owed_outstanding: Wallet,
};

function AttentionItem({ item }: { item: HomeAttentionItem }) {
  const Icon = ATTENTION_ICON[item.kind] ?? CircleAlert;
  const high = item.priority === "high";
  return (
    <Link
      to={item.link}
      className={`group flex h-full items-start gap-3 rounded-3xl border-2 p-4 transition-colors ${
        high
          ? "border-danger-200 bg-danger-50 hover:border-danger-300"
          : "border-sun-200 bg-sun-50 hover:border-sun-300"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
          high ? "bg-white text-danger-600" : "bg-white text-sun-700"
        }`}
        aria-hidden
      >
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">{item.title}</p>
        <p className="mt-0.5 text-sm text-ink-700">{item.body}</p>
      </div>
      <ArrowRight
        className="mt-1 h-4 w-4 shrink-0 text-ink-500 transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}

function GroupGridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2" aria-hidden>
      {[0, 1].map((i) => (
        <div key={i} className="rounded-3xl border border-ink-200 bg-white p-5">
          <div className="flex items-center gap-3">
            <div className={`${ui.skeleton} h-10 w-10`} />
            <div className="flex-1 space-y-2">
              <div className={`${ui.skeleton} h-4 w-2/3`} />
              <div className={`${ui.skeleton} h-3 w-1/3`} />
            </div>
          </div>
          <div className={`${ui.skeleton} mt-5 h-3 w-1/2`} />
        </div>
      ))}
    </div>
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
          item.isUnread ? "bg-brand-600" : "bg-transparent"
        }`}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink-900">{item.title}</p>
        <p className="mt-0.5 line-clamp-1 text-sm text-ink-600">{item.body}</p>
        <p className="mt-1 text-xs text-ink-500">
          {item.groupName && <span>{item.groupName} · </span>}
          <time>{formatWhen(item.createdAt)}</time>
        </p>
      </div>
    </div>
  );

  const className =
    "block w-full rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-ink-50";

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
      queryFn: ({ signal }) => api.getGroup(groupId, signal),
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
      ? { label: "Due now", value: String(stats.paymentsDue), hint: "payments this cycle", icon: "clock", tone: "warning" }
      : null,
    stats && stats.pendingConfirmations > 0
      ? {
          label: "To confirm",
          value: String(stats.pendingConfirmations),
          hint: "awaiting your review",
          icon: "check",
          tone: "success",
        }
      : null,
    stats && stats.totalOwed != null && Number(stats.totalOwed) > 0
      ? {
          label: "Owed to you",
          value: `₱${Number(stats.totalOwed).toLocaleString()}`,
          hint: "outstanding obligations",
          icon: "wallet",
          tone: "danger",
        }
      : null,
    stats && stats.unreadNotifications > 0
      ? { label: "Unread", value: String(stats.unreadNotifications), hint: "notifications", icon: "bell", tone: "neutral" }
      : null,
  ].filter(Boolean) as {
    label: string;
    value: string;
    hint: string;
    icon: StatCardIconName;
    tone: StatCardTone;
  }[];

  const subtitle =
    ongoing.length === 0
      ? "Create a paluwagan or join one with an invite link."
      : stats && metrics.length > 0
        ? `${ongoing.length} group${ongoing.length === 1 ? "" : "s"} · ${metrics.length} item${metrics.length === 1 ? "" : "s"} need attention`
        : `${ongoing.length} ongoing paluwagan${ongoing.length === 1 ? "" : "s"}`;

  return (
    <div className="space-y-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className={ui.pageTitle}>Kumusta, {firstName}!</h1>
          <p className={ui.pageSubtitle}>{subtitle}</p>
        </div>
        <Link to="/groups/new" className={`${ui.btnPrimary} shrink-0`}>
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

      {groupsLoading && groups.length === 0 && <GroupGridSkeleton />}

      {!groupsLoading && !groupsError && groups.length === 0 && (
        <div className={`${ui.emptyState} flex flex-col items-center`}>
          <KabanChest className="w-40" />
          <p className="font-heading mt-4 text-xl font-bold text-ink-900">Your kaban is empty</p>
          <p className={`mt-2 max-w-sm ${ui.muted}`}>
            Start a paluwagan with your group, or join one with an invite link from your organizer.
          </p>
          <Link to="/groups/new" className={`mt-6 ${ui.btnPrimary}`}>
            Create your first paluwagan
          </Link>
        </div>
      )}

      {groups.length > 0 && metrics.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((metric) => (
            <StatCard key={metric.label} {...metric} />
          ))}
        </div>
      )}

      {!groupsLoading && !groupsError && overviewData && overviewData.attention.length > 0 && (
        <section>
          <SectionHeader
            title="Needs action"
            subtitle={`${overviewData.attention.length} item${overviewData.attention.length === 1 ? "" : "s"}`}
          />
          <ul className="grid gap-3 md:grid-cols-2">
            {overviewData.attention.map((item) => (
              <li key={item.id}>
                <AttentionItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {ongoing.length > 0 && (
        <section>
          <SectionHeader title="Your groups" subtitle={`${ongoing.length} active or forming`} />
          <ul className="grid gap-4 sm:grid-cols-2">
            {ongoing.map((group) => (
              <li key={group.id}>
                <GroupTile group={group} onPrefetch={prefetchGroup} />
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
          <div className="space-y-3" aria-hidden>
            {[0, 1, 2].map((i) => (
              <div key={i} className={`${ui.skeleton} h-12`} />
            ))}
          </div>
        ) : recentActivity.length === 0 ? (
          <p className={`${ui.muted} text-sm`}>No updates yet.</p>
        ) : (
          <ul className="-mx-3 divide-y divide-ink-100">
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
        <section>
          <button
            type="button"
            onClick={() => setPastExpanded((v) => !v)}
            aria-expanded={past.length <= 2 || pastExpanded}
            className="mb-4 flex w-full items-center justify-between gap-3 text-left"
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
            <ul className="grid gap-4 sm:grid-cols-2">
              {past.map((group) => (
                <li key={group.id}>
                  <GroupTile group={group} onPrefetch={prefetchGroup} muted />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
