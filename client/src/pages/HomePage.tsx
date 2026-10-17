import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  Banknote,
  BellRing,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  HandCoins,
  Plus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api, type HomeDashboard } from "../api/client";
import { KabanChest } from "../components/Illustration";
import { NotificationIcon } from "../components/NotificationIcon";
import { dueHint, formatShortDate } from "../lib/dates";
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
    if (w.placeholdersToRecord) {
      const n = w.placeholdersToRecord;
      items.push({ groupId: g.id, icon: HandCoins, text: `${n} placeholder payment${n === 1 ? "" : "s"} to record in ${g.name}` });
    }
    if (w.membersToRemind) {
      const n = w.membersToRemind;
      items.push({ groupId: g.id, icon: BellRing, text: `${n} member${n === 1 ? "" : "s"} to remind in ${g.name}` });
    }
  }
  return items;
}

interface Badge {
  icon: LucideIcon;
  text: string;
  tone: string;
}

const TONES = {
  good: "bg-brand-100 text-brand-800",
  due: "bg-sun-100 text-sun-900",
  bad: "bg-danger-50 text-danger-700",
  info: "bg-ink-100 text-ink-700",
};

/** Where a paluwagan stands for this viewer, as short badges: one fact each, no sentences. */
function badges(g: Group): Badge[] {
  const out: Badge[] = [];
  switch (g.state) {
    case "LOBBY":
      out.push(
        g.occupied < g.slotCount
          ? { icon: Users, text: `${g.occupied} of ${g.slotCount} joined`, tone: TONES.info }
          : { icon: Users, text: "Ready to launch", tone: TONES.info },
      );
      break;
    case "LAUNCHED":
      out.push({ icon: CalendarDays, text: `Starts ${formatShortDate(g.startDate)}`, tone: TONES.info });
      break;
    case "ACTIVE": {
      const s = g.myStanding;
      if (g.openRound && s) {
        out.push(
          s.approved >= s.due
            ? { icon: Check, text: "Paid up", tone: TONES.good }
            : { icon: HandCoins, text: `${formatPeso(s.approved)} of ${formatPeso(s.due)} paid`, tone: TONES.due },
        );
      }
      break;
    }
    case "COMPLETED_WITH_OUTSTANDING_DEBT":
      out.push(
        g.owed > 0
          ? { icon: HandCoins, text: `You owe ${formatPeso(g.owed)}`, tone: TONES.bad }
          : { icon: Check, text: "Complete, debts open", tone: TONES.info },
      );
      break;
    default:
      out.push({ icon: Check, text: "Complete", tone: TONES.info });
  }
  if (g.myTurn && g.state !== "LOBBY") {
    out.push(
      g.myTurn.paid
        ? { icon: Banknote, text: "Got your payout", tone: TONES.info }
        : { icon: Banknote, text: `Payout ${formatShortDate(g.myTurn.payoutDate, true)}`, tone: TONES.info },
    );
  }
  return out;
}

/**
 * §15.2 home: what's waiting on you, what's due soonest (each with Pay), your paluwagans, and
 * recent activity.
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
                    {/* What and where on one line; when on the next. The round is on the group page. */}
                    <span className="block truncate text-sm font-bold tabular-nums text-ink-900">
                      {formatPeso(item.amount)}
                      {item.kind === "DEBT" && <span className="font-semibold text-danger-700"> debt</span>}
                      <span className="font-semibold text-ink-600"> · {item.groupName}</span>
                    </span>
                    {hint && (
                      <span className={`block text-xs ${hint.overdue ? "font-semibold text-danger-700" : "text-ink-500"}`}>
                        {hint.overdue ? `${hint.label[0].toUpperCase()}${hint.label.slice(1)}` : `Due ${hint.label}`}
                      </span>
                    )}
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
                    {formatPeso(g.contribution)} {g.frequencyLabel.toLowerCase()}
                  </p>
                  <p className="font-heading mt-0.5 truncate text-lg font-bold text-ink-900">{g.name}</p>
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {badges(g).map((b) => (
                      <li key={b.text} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${b.tone}`}>
                        <b.icon className="h-3.5 w-3.5" aria-hidden />
                        {b.text}
                      </li>
                    ))}
                  </ul>
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
