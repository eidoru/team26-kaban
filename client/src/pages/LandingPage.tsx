import { Link } from "react-router-dom";
import {
  Bell,
  BookOpenCheck,
  CalendarRange,
  HandCoins,
  Link2,
  ListOrdered,
  ShieldAlert,
  UserRound,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { Avatar } from "../components/Avatar";
import { KabanLogo } from "../components/KabanLogo";
import { ui } from "../lib/ui";

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: BookOpenCheck,
    title: "Shared contribution ledger",
    description: "Members report payments and managers confirm them, so partial amounts and shortfalls stay visible to the whole group.",
  },
  {
    icon: CalendarRange,
    title: "Forming to finish",
    description: "Set the amount, schedule and roster size, then follow every round until the cycle completes.",
  },
  {
    icon: ListOrdered,
    title: "Payout order built in",
    description: "Randomize turns or set them by hand, so everyone knows who gets the pot and when.",
  },
  {
    icon: Link2,
    title: "Invite links & open seats",
    description: "Share a join link, or hold a seat for someone with a placeholder they can claim later.",
  },
  {
    icon: ShieldAlert,
    title: "Shortfall tracking",
    description: "Underpayments are recorded, and managers see what's still owed across all their groups.",
  },
  {
    icon: Bell,
    title: "Home dashboard & alerts",
    description: "Payments due, confirmations waiting and recent activity, all in one place.",
  },
];

const STEPS = [
  {
    title: "Create your paluwagan",
    description: "Name it, set the contribution and schedule, and choose how many seats.",
  },
  {
    title: "Fill the roster",
    description: "Send an invite link, or add placeholders for people not on Kaban yet.",
  },
  {
    title: "Lock the order & start",
    description: "Once every seat is taken, lock in the payout order and open Round 1.",
  },
  {
    title: "Run each round together",
    description: "Report and confirm contributions until every member has received the pot.",
  },
] as const;

const ROLES: { icon: LucideIcon; who: string; what: string }[] = [
  {
    icon: UserRound,
    who: "Managers",
    what: "create groups, invite members, set the payout order, confirm payments and track shortfalls.",
  },
  {
    icon: UsersRound,
    who: "Members",
    what: "see their turn, report contributions and follow progress through each round.",
  },
  {
    icon: Bell,
    who: "Everyone",
    what: "gets notifications and a home dashboard so nothing slips through the cracks.",
  },
];

const PREVIEW_MEMBERS = ["Maria Santos", "Jun dela Cruz", "Liza Reyes", "Carlo Tan", "Ana Bautista"];

function SectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-widest text-brand-700">{eyebrow}</p>
      <h2 className="font-heading mt-2 text-3xl font-bold tracking-tight text-ink-900 text-balance sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 text-base text-ink-600">{description}</p>
    </div>
  );
}

/** A static look at the in-app round view, built from real components so it matches the product. */
function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden>
      <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-sun-200" />
      <div className="absolute -bottom-8 -right-4 h-32 w-32 rounded-full bg-brand-100" />
      <div className="relative rounded-3xl border border-ink-200 bg-white p-5 shadow-lift">
        <div className="flex items-center gap-3">
          <Avatar name="Barkada Paluwagan" size="md" shape="tile" />
          <div className="min-w-0 flex-1">
            <p className="font-heading font-bold text-ink-900">Barkada Paluwagan</p>
            <p className="text-xs text-ink-500">₱2,000 weekly · 10 members</p>
          </div>
          <span className={ui.badgeActive}>Active</span>
        </div>
        <div className="mt-4 rounded-2xl border-2 border-sun-200 bg-sun-100 p-4">
          <span className={ui.badgeTurn}>Round 4 of 10</span>
          <p className="font-heading mt-2 text-lg font-bold text-ink-900">It&apos;s your turn!</p>
          <p className="font-heading mt-1 text-3xl font-bold tabular-nums text-ink-900">
            ₱16,000 <span className="text-base font-semibold text-ink-500">of ₱20,000</span>
          </p>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/70">
            <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-brand-500 to-brand-400" />
          </div>
          <p className="mt-2 text-xs font-semibold text-ink-700">8 of 10 paid</p>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="flex">
            {PREVIEW_MEMBERS.map((name, i) => (
              <Avatar key={name} name={name} className={`ring-2 ring-white ${i > 0 ? "-ml-2" : ""}`} />
            ))}
          </div>
          <span className="text-xs font-semibold text-ink-500">+5 more</span>
        </div>
      </div>
      <div className="absolute -right-3 top-24 hidden rotate-3 rounded-2xl border border-ink-200 bg-white px-3 py-2 text-xs font-bold text-brand-700 shadow-card sm:block">
        ✓ Jun paid ₱2,000
      </div>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-cream">
      <header className={`mx-auto flex ${ui.page} items-center justify-between gap-3 px-4 py-5 sm:px-6`}>
        <KabanLogo />
        <div className="flex items-center gap-2">
          <Link to="/login" className={ui.btnGhost}>
            Log in
          </Link>
          <Link to="/register" className={ui.btnPrimarySm}>
            Sign up
          </Link>
        </div>
      </header>

      <main>
        <section className={`mx-auto grid ${ui.page} items-center gap-14 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-14`}>
          <div className="text-center lg:text-left">
            <p className="inline-flex items-center gap-2 rounded-full bg-sun-100 px-3 py-1 text-xs font-bold text-sun-800">
              <HandCoins className="h-3.5 w-3.5" aria-hidden />
              For paluwagan organizers & members
            </p>
            <h1 className="font-heading mt-5 text-4xl font-bold leading-[1.05] tracking-tight text-ink-900 text-balance sm:text-5xl">
              Everyone paid, everyone&apos;s turn, <span className="text-brand-700">all on record.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-600 lg:mx-0">
              Kaban keeps your group aligned on contributions, payout turns and shortfalls, with a
              shared ledger everyone can trust. Money still moves the way you already handle it;
              Kaban keeps the record straight.
            </p>
          </div>
          <HeroPreview />
        </section>

        <section className={`mx-auto ${ui.page} px-4 pb-20 sm:px-6`}>
          <SectionHeader
            eyebrow="Features"
            title="What Kaban handles"
            description="Everything your group needs to run a paluwagan, without spreadsheets or group-chat confusion."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <article key={title} className={ui.cardCompact}>
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="font-heading mt-4 text-lg font-semibold text-ink-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="bg-brand-700 px-4 py-20 text-white sm:px-6">
          <div className={`mx-auto ${ui.page}`}>
            <div className="mx-auto max-w-2xl text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-sun-200">How it works</p>
              <h2 className="font-heading mt-2 text-3xl font-bold tracking-tight text-balance sm:text-4xl">
                From first invite to final payout
              </h2>
            </div>
            <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((item, index) => (
                <li key={item.title} className="rounded-3xl bg-white/10 p-6">
                  <span className="font-heading flex h-10 w-10 items-center justify-center rounded-full bg-sun-300 text-lg font-bold text-ink-900">
                    {index + 1}
                  </span>
                  <h3 className="font-heading mt-4 text-lg font-semibold">{item.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-brand-50">{item.description}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`mx-auto ${ui.page} px-4 py-20 sm:px-6`}>
          <SectionHeader
            eyebrow="What Kaban is"
            title="A record keeper, not a wallet"
            description="A coordination tool for paluwagan groups, not a payment processor."
          />
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border-2 border-sun-200 bg-sun-50 p-8">
              <h3 className="font-heading text-xl font-bold text-ink-900">Not a payment app</h3>
              <p className="mt-3 text-sm leading-relaxed text-ink-700">
                Kaban does not move money, hold balances or process transfers. Members pay each
                other the way they already do (cash, bank transfer or e-wallet) and use Kaban to
                report, confirm and reconcile what was paid.
              </p>
            </div>
            <div className={ui.card}>
              <h3 className="font-heading text-xl font-bold text-ink-900">Built for organizers & members</h3>
              <ul className="mt-5 space-y-4">
                {ROLES.map(({ icon: Icon, who, what }) => (
                  <li key={who} className="flex gap-3 text-sm text-ink-600">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <Icon className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="pt-1.5">
                      <strong className="font-bold text-ink-900">{who}</strong> {what}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-4 pb-24 text-center sm:px-6">
          <div className="rounded-3xl border border-ink-200 bg-white px-6 py-10 shadow-card">
            <h2 className="font-heading text-2xl font-bold tracking-tight text-ink-900 text-balance sm:text-3xl">
              Ready to organize your next paluwagan?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base text-ink-600">
              Create a free account, start a group, and invite your members in minutes.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-200 px-4 py-8 text-center text-xs text-ink-500">
        Kaban · Paluwagan records for groups who trust each other
      </footer>
    </div>
  );
}
