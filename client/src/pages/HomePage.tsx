import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Banknote, ChevronRight, ClipboardCheck, HandCoins, Plus, type LucideIcon } from "lucide-react";
import { api, type HomeDashboard } from "../api/client";
import { KabanChest } from "../components/Illustration";
import { NotificationIcon } from "../components/NotificationIcon";
import { dueHint, formatDueDate } from "../lib/dates";
import { formatPeso } from "../lib/money";
import { homeKey } from "../lib/homeQueries";
import { ui } from "../lib/ui";

type Group = HomeDashboard["groups"][number];

/** Everything across the viewer's paluwagans that only they can move forward. */
function waitingItems(groups: Group[]) {
  const items: { groupId: string; icon: LucideIcon; text: string }[] = [];
  for (const g of groups) {
    const w = g.waiting;
    if (w.reviews) items.push({ groupId: g.id, icon: ClipboardCheck, text: `${w.reviews} to review in ${g.name}` });
    if (w.payoutsToHandOver) items.push({ groupId: g.id, icon: Banknote, text: `A payout to hand over in ${g.name}` });
    if (w.receiptsToConfirm) items.push({ groupId: g.id, icon: Banknote, text: `Confirm you got your payout from ${g.name}` });
    if (w.swapsToAnswer) items.push({ groupId: g.id, icon: ArrowLeftRight, text: `A turn swap to answer in ${g.name}` });
  }
  return items;
}

/** One line on where a paluwagan stands for this viewer. */
function standingLine(g: Group): string {
  switch (g.state) {
    case "LOBBY":
      return g.occupied < g.slotCount ? `${g.occupied} of ${g.slotCount} joined` : "Everyone's in. Waiting to launch.";
    case "LAUNCHED":
      return `Starts ${formatDueDate(g.startDate)}`;
    case "ACTIVE": {
      const s = g.myStanding;
      if (!g.openRound || !s) return "Running";
      return s.approved >= s.due
        ? `Round ${g.openRound.number}: you're paid up`
        : `Round ${g.openRound.number}: ${formatPeso(s.approved)} of ${formatPeso(s.due)} paid`;
    }
    case "COMPLETED_WITH_OUTSTANDING_DEBT":
      return g.owed > 0 ? `Complete. You still owe ${formatPeso(g.owed)}` : "Complete. Some debts are still open";
    default:
      return "Complete";
  }
}

function turnLine(g: Group): string | null {
  if (!g.myTurn || g.state === "LOBBY") return null;
  if (g.myTurn.paid) return `You got your payout in round ${g.myTurn.round}`;
  const hint = dueHint(g.myTurn.payoutDate);
  return `Your turn: round ${g.myTurn.round}, ${formatDueDate(g.myTurn.payoutDate)}${hint && !hint.overdue ? ` (${hint.label})` : ""}`;
}

/**
 * §15.2 home: what's waiting on you, what's due soonest (each with Pay), your paluwagans, and
 * recent activity. Totals and payouts live on the Money page.
 */
export function HomePage() {
  const { data, isPending } = useQuery({ queryKey: homeKey, queryFn: () => api.home() });
  const { data: notes } = useQuery({ queryKey: ["notifications"], queryFn: () => api.getNotifications(), staleTime: 30_000 });

  if (isPending || !data) {
    return (
      <div className="space-y-3" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className={`${ui.skeleton} h-24`} />
        ))}
      </div>
    );
  }

  const waiting = waitingItems(data.groups);
  const recent = (notes?.notifications ?? []).slice(0, 5);
  const start = (
    <Link to="/groups/new" className={ui.btnSecondarySm}>
      <Plus className="h-4 w-4" aria-hidden />
      Start a paluwagan
    </Link>
  );

  if (data.groups.length === 0) {
    return (
      <div className={`${ui.emptyState} flex flex-col items-center`}>
        <KabanChest className="w-32" />
        <h1 className="font-heading mt-4 text-xl font-bold text-ink-900">No paluwagans yet</h1>
        <p className={`mt-1 max-w-sm text-sm ${ui.muted}`}>Start one and invite your group, or open an invite link someone sent you.</p>
        <Link to="/groups/new" className={`mt-6 ${ui.btnPrimary}`}>
          <Plus className="h-4 w-4" aria-hidden />
          Start a paluwagan
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <h1 className={ui.pageTitle}>Home</h1>

      {waiting.length > 0 && (
        <section aria-labelledby="waiting-heading" className="rounded-3xl border-2 border-sun-200 bg-sun-50 p-5">
          <h2 id="waiting-heading" className="text-xs font-bold uppercase tracking-wide text-sun-800">
            Waiting on you
          </h2>
          <ul className="mt-2 divide-y divide-sun-200">
            {waiting.map((w, i) => (
              <li key={i}>
                <Link to={`/groups/${w.groupId}`} className="flex min-h-12 items-center gap-3 py-2 text-sm font-semibold text-ink-900">
                  <w.icon className="h-4 w-4 shrink-0 text-sun-800" aria-hidden />
                  <span className="flex-1">{w.text}</span>
                  <ChevronRight className="h-4 w-4 text-ink-400" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data.due.length > 0 && (
        <section aria-labelledby="due-heading">
          <h2 id="due-heading" className={`${ui.sectionHeading} mb-3`}>
            Due soon
          </h2>
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
            {data.due.map((item) => {
              const hint = item.dueDate ? dueHint(item.dueDate) : null;
              return (
                <li key={`${item.groupId}-${item.kind}`} className="flex items-center gap-3 px-4 py-3">
                  <HandCoins className={`h-5 w-5 shrink-0 ${item.kind === "DEBT" ? "text-danger-700" : "text-brand-700"}`} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold tabular-nums text-ink-900">
                      {formatPeso(item.amount)}
                      {item.kind === "DEBT" && <span className="font-semibold text-danger-700"> debt</span>}
                    </span>
                    <span className="block text-xs text-ink-500">
                      {item.groupName}
                      {item.round != null && ` · round ${item.round}`}
                      {item.dueDate && ` · due ${formatDueDate(item.dueDate)}${hint ? ` (${hint.label})` : ""}`}
                    </span>
                  </span>
                  <Link
                    to={`/groups/${item.groupId}?pay=${item.kind === "DEBT" ? "debt" : "contribution"}`}
                    className={`${ui.btnPrimarySm} min-h-9`}
                  >
                    Pay
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="groups-heading">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="groups-heading" className={ui.sectionHeading}>
            Your paluwagans
          </h2>
          {start}
        </div>
        <ul className="space-y-3">
          {data.groups.map((g) => (
            <li key={g.id}>
              <Link
                to={`/groups/${g.id}`}
                className="flex items-center gap-4 rounded-3xl border border-ink-200 bg-white p-5 shadow-card transition-colors hover:border-brand-300"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-ink-500">
                    {g.isOrganizer ? "You organize" : "Member"} · {formatPeso(g.contribution)} {g.frequencyLabel.toLowerCase()}
                  </p>
                  <p className="font-heading mt-0.5 truncate text-lg font-bold text-ink-900">{g.name}</p>
                  <p className="mt-0.5 text-sm text-ink-700">{standingLine(g)}</p>
                  {turnLine(g) && <p className="text-xs text-ink-500">{turnLine(g)}</p>}
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading">
          <div className="mb-3 flex items-end justify-between">
            <h2 id="recent-heading" className={ui.sectionHeading}>
              Recent
            </h2>
            <Link to="/notifications" className={ui.link}>
              See all
            </Link>
          </div>
          <ul className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
            {recent.map((n) => (
              <li key={n.id}>
                <Link to={n.link ?? "/notifications"} className="flex items-start gap-3 px-4 py-3 hover:bg-ink-50">
                  <NotificationIcon kind={n.kind} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm text-ink-900 ${n.isUnread ? "font-bold" : "font-semibold"}`}>{n.title}</span>
                    <span className="block truncate text-xs text-ink-500">{n.groupName}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
