import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { api, type GroupSummary, type HomeAttentionItem, type NotificationItem } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { formatWhen } from "../lib/formatWhen";
import { formatFrequency } from "../lib/frequency";
import { displayInitials } from "../lib/initials";
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
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-base font-medium text-slate-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
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
  return `${group.slotCount} members · finished`;
}

function formingFillPercent(group: GroupSummary): number {
  if (group.slotCount <= 0) return 0;
  return Math.min(100, Math.round(((group.filledCount ?? 0) / group.slotCount) * 100));
}

function GroupCard({
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

  return (
    <Link
      to={`/groups/${group.id}`}
      onMouseEnter={() => onPrefetch(group.id)}
      onFocus={() => onPrefetch(group.id)}
      className={muted ? ui.listItemMuted : ui.listItem}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-sm font-medium text-white ${
            muted ? "bg-slate-400" : "bg-emerald-900"
          }`}
          aria-hidden
        >
          {displayInitials(group.name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <h3 className="truncate font-medium text-slate-900">{group.name}</h3>
            <span className={`${statusBadgeClass(group.status)} shrink-0`}>
              {statusLabel(group.status)}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-600">
            {group.role === "manager" && (
              <>
                <span className="font-medium text-emerald-800">Organizing</span>
                <span className="text-slate-300"> · </span>
              </>
            )}
            <span className="font-medium text-slate-800">{amount}</span>
            <span className="text-slate-300"> · </span>
            <span>{freq}</span>
          </p>
          <p className="mt-0.5 text-sm text-slate-500">{groupStatusDetail(group)}</p>
          {group.status === "forming" && !muted && (
            <div className="mt-3">
              <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all"
                  style={{ width: `${formingFillPercent(group)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
      <span className="font-medium text-slate-900">{value}</span>
      <span className="text-slate-500">{label}</span>
    </span>
  );
}

function AttentionItem({ item }: { item: HomeAttentionItem }) {
  return (
    <Link
      to={item.link}
      className="flex items-start justify-between gap-3 rounded-xl border border-amber-100 bg-white px-4 py-3 transition-colors hover:border-amber-200"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-900">{item.title}</p>
        <p className="mt-0.5 text-sm text-slate-600">{item.body}</p>
      </div>
      <span className="shrink-0 text-slate-400" aria-hidden>
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
  const inner = (
    <>
      <p className="text-sm font-medium text-slate-900">{item.title}</p>
      <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{item.body}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-400">
        {item.groupName && <span>{item.groupName}</span>}
        <time>{formatWhen(item.createdAt)}</time>
      </div>
    </>
  );

  const className = `block w-full rounded-xl px-3 py-2.5 text-left transition-colors ${
    item.isUnread ? "bg-emerald-50/70 hover:bg-emerald-50" : "hover:bg-slate-50"
  }`;

  if (item.link) {
    return (
      <button type="button" onClick={() => onNavigate(item.link!)} className={className}>
        {inner}
      </button>
    );
  }

  return <div className={className}>{inner}</div>;
}

export function HomePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [pastExpanded, setPastExpanded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["home-overview"],
    queryFn: () => api.getHomeOverview(),
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.markNotificationRead(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  function prefetchGroup(groupId: string) {
    void queryClient.prefetchQuery({
      queryKey: ["group", groupId],
      queryFn: () => api.getGroup(groupId),
    });
  }

  function handleActivityNavigate(link: string, notificationId: string, isUnread: boolean) {
    if (isUnread) void markRead.mutate(notificationId);
    navigate(link);
  }

  const groups = data?.groups ?? [];
  const ongoing = groups.filter((g) => g.status !== "completed");
  const past = groups.filter((g) => g.status === "completed");
  const stats = data?.stats;
  const firstName = user?.displayName?.split(/\s+/)[0] ?? "there";

  const actionCount =
    (stats?.pendingConfirmations ?? 0) + (stats?.paymentsDue ?? 0) + (data?.attention.length ?? 0);

  return (
    <div className="space-y-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className={ui.pageTitle}>Hello, {firstName}</h1>
          <p className={ui.pageSubtitle}>
            {ongoing.length === 0
              ? "Create a paluwagan or join one with an invite link."
              : `${ongoing.length} group${ongoing.length === 1 ? "" : "s"} need your attention.`}
          </p>
          {stats && groups.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {stats.activeGroups > 0 && (
                <StatChip label="in cycle" value={String(stats.activeGroups)} />
              )}
              {stats.formingGroups > 0 && (
                <StatChip label="forming" value={String(stats.formingGroups)} />
              )}
              {stats.unreadNotifications > 0 && (
                <StatChip label="unread" value={String(stats.unreadNotifications)} />
              )}
              {stats.pendingConfirmations > 0 && (
                <StatChip label="to confirm" value={String(stats.pendingConfirmations)} />
              )}
              {stats.paymentsDue > 0 && (
                <StatChip label="due now" value={String(stats.paymentsDue)} />
              )}
              {stats.totalOwed != null && Number(stats.totalOwed) > 0 && (
                <StatChip label="owed to you" value={`₱${Number(stats.totalOwed).toLocaleString()}`} />
              )}
            </div>
          )}
        </div>
        <Link to="/groups/new" className={`${ui.btnPrimarySm} shrink-0 self-start`}>
          New paluwagan
        </Link>
      </header>

      {isLoading && <p className={ui.muted}>Loading…</p>}
      {error && (
        <p className={ui.error}>
          Failed to load dashboard. Check that the API and database are running.
        </p>
      )}

      {!isLoading && !error && data && data.attention.length > 0 && (
        <section className="rounded-2xl border border-amber-100 bg-amber-50/40 p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-medium text-slate-900">Needs action</h2>
              <p className="text-sm text-slate-600">
                {actionCount} item{actionCount === 1 ? "" : "s"} across your groups
              </p>
            </div>
          </div>
          <ul className="space-y-2">
            {data.attention.map((item) => (
              <li key={item.id}>
                <AttentionItem item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {!isLoading && !error && groups.length === 0 && (
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

      {groups.length > 0 && (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_17rem] lg:items-start">
          <div className="space-y-8">
            {ongoing.length > 0 && (
              <section>
                <SectionHeader title="Your groups" />
                <div className="grid gap-3 sm:grid-cols-2">
                  {ongoing.map((group) => (
                    <GroupCard key={group.id} group={group} onPrefetch={prefetchGroup} />
                  ))}
                </div>
              </section>
            )}

            {past.length > 0 && (
              <section>
                <button
                  type="button"
                  onClick={() => setPastExpanded((v) => !v)}
                  className="mb-3 flex w-full items-center justify-between text-left"
                >
                  <div>
                    <h2 className="text-base font-medium text-slate-900">
                      Completed{past.length > 1 ? ` (${past.length})` : ""}
                    </h2>
                    <p className="text-sm text-slate-500">Past paluwagans</p>
                  </div>
                  {past.length > 2 && (
                    <span className={`${ui.link} shrink-0`}>{pastExpanded ? "Hide" : "Show all"}</span>
                  )}
                </button>
                {(past.length <= 2 || pastExpanded) && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {past.map((group) => (
                      <GroupCard key={group.id} group={group} onPrefetch={prefetchGroup} muted />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>

          <aside className="space-y-6">
            <section>
              <SectionHeader
                title="Recent activity"
                action={
                  <Link to="/notifications" className={ui.link}>
                    All
                  </Link>
                }
              />
              <div className={ui.cardCompact}>
                {!data || data.recentActivity.length === 0 ? (
                  <p className={`${ui.muted} text-sm`}>No updates yet.</p>
                ) : (
                  <ul className="-mx-2 space-y-0.5">
                    {data.recentActivity.map((item) => (
                      <li key={item.id}>
                        <ActivityRow
                          item={item}
                          onNavigate={(link) => handleActivityNavigate(link, item.id, item.isUnread)}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {(stats?.totalOwed != null && Number(stats.totalOwed) > 0) ||
            (stats?.pendingConfirmations ?? 0) > 0 ? (
              <section className={ui.cardCompact}>
                <h2 className="text-sm font-medium text-slate-900">Manager shortcuts</h2>
                <ul className="mt-3 space-y-2 text-sm">
                  {(stats?.pendingConfirmations ?? 0) > 0 && (
                    <li>
                      <span className="text-slate-600">
                        {stats!.pendingConfirmations} payment
                        {stats!.pendingConfirmations === 1 ? "" : "s"} waiting for confirmation
                      </span>
                    </li>
                  )}
                  {stats?.totalOwed != null && Number(stats.totalOwed) > 0 && (
                    <li>
                      <Link to="/manager/obligations" className={ui.link}>
                        ₱{Number(stats.totalOwed).toLocaleString()} outstanding →
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            ) : null}
          </aside>
        </div>
      )}
    </div>
  );
}
