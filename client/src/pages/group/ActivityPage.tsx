import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowLeftRight,
  Banknote,
  Bot,
  HandCoins,
  ImageOff,
  Lock,
  Scale,
  Settings2,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { api, type ActivityCategory, type ActivityEntry } from "../../api/client";
import { formatDayHeading } from "../../lib/dates";
import { groupKey, useGroup } from "../../lib/groupQueries";
import { ui } from "../../lib/ui";

const FILTERS: { value: ActivityCategory | null; label: string }[] = [
  { value: null, label: "All" },
  { value: "payments", label: "Payments" },
  { value: "payouts", label: "Payouts" },
  { value: "debts", label: "Debts" },
  { value: "disputes", label: "Disputes" },
  { value: "swaps", label: "Order and swaps" },
  { value: "members", label: "Members" },
  { value: "settings", label: "Settings" },
];

const ICONS: Record<ActivityCategory, { icon: LucideIcon; tone: string }> = {
  payments: { icon: HandCoins, tone: "bg-brand-100 text-brand-700" },
  payouts: { icon: Banknote, tone: "bg-sun-100 text-sun-800" },
  debts: { icon: Scale, tone: "bg-danger-50 text-danger-700" },
  disputes: { icon: ShieldCheck, tone: "bg-sky-100 text-sky-800" },
  swaps: { icon: ArrowLeftRight, tone: "bg-ink-100 text-ink-700" },
  members: { icon: Users, tone: "bg-ink-100 text-ink-700" },
  settings: { icon: Settings2, tone: "bg-ink-100 text-ink-700" },
};

/**
 * §13: everything that has happened in the paluwagan, for every member (R-AUD-03). Entries can't
 * be changed (R-AUD-02); each shows who acted and its flags (R-AUD-04).
 */
export function ActivityPage() {
  const { id = "" } = useParams<{ id: string }>();
  const { data: detail } = useGroup(id);
  const [category, setCategory] = useState<ActivityCategory | null>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isPending } = useInfiniteQuery({
    queryKey: [...groupKey(id), "activity", category],
    queryFn: ({ pageParam }) => api.activity(id, { before: pageParam, category: category ?? undefined }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => (last.hasMore ? last.entries.at(-1)?.id : undefined),
  });
  const entries = data?.pages.flatMap((p) => p.entries) ?? [];

  // Group by the viewer's local day, newest first.
  const days: { heading: string; items: ActivityEntry[] }[] = [];
  for (const entry of entries) {
    const heading = formatDayHeading(new Date(entry.at));
    const last = days.at(-1);
    if (last?.heading === heading) last.items.push(entry);
    else days.push({ heading, items: [entry] });
  }

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/groups/${id}`} className={`${ui.btnGhost} mb-4`}>
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {detail?.group.name ?? "Back"}
        </Link>
        <h1 className={ui.pageTitle}>Activity</h1>
        <p className={`${ui.pageSubtitle} flex items-start gap-2`}>
          <Lock className="mt-1 h-4 w-4 shrink-0" aria-hidden />
          Everything that happens here, visible to every member. Entries can&apos;t be changed or deleted.
        </p>
      </div>

      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Show">
        {FILTERS.map((f) => (
          <button
            key={f.label}
            type="button"
            onClick={() => setCategory(f.value)}
            aria-pressed={category === f.value}
            className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-bold transition-colors ${
              category === f.value ? "bg-brand-700 text-white" : "border-2 border-ink-200 bg-white text-ink-700 hover:border-brand-200"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isPending ? (
        <div className="space-y-3" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className={`${ui.skeleton} h-16`} />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className={ui.emptyState}>Nothing here yet.</p>
      ) : (
        days.map((day) => (
          <section key={day.heading} aria-label={day.heading}>
            <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-500">{day.heading}</h2>
            <ol className="divide-y divide-ink-100 overflow-hidden rounded-3xl border border-ink-200 bg-white">
              {day.items.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ol>
          </section>
        ))
      )}

      {hasNextPage && (
        <div className="text-center">
          <button type="button" onClick={() => void fetchNextPage()} disabled={isFetchingNextPage} className={ui.btnSecondary}>
            {isFetchingNextPage ? "Loading…" : "Show older"}
          </button>
        </div>
      )}
    </div>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }) {
  const { icon: Icon, tone } = ICONS[entry.category];
  const time = new Date(entry.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const flags = [
    entry.system && { icon: Bot, text: "Automatic" },
    entry.proofAttached === false && { icon: ImageOff, text: "No proof" },
    entry.selfApproved && { icon: ShieldCheck, text: "Self-approved" },
  ].filter(Boolean) as { icon: LucideIcon; text: string }[];
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${tone}`} aria-hidden>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-ink-900">{entry.title}</span>
        {entry.detail && <span className="mt-0.5 block text-sm text-ink-600">{entry.detail}</span>}
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
          <span>{time}</span>
          {flags.map(({ icon: FlagIcon, text }) => (
            <span key={text} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 font-semibold text-ink-600">
              <FlagIcon className="h-3 w-3" aria-hidden />
              {text}
            </span>
          ))}
        </span>
      </span>
    </li>
  );
}
