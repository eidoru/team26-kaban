import { Link } from "react-router-dom";
import { ui } from "../lib/ui";

const FEATURES = [
  {
    title: "Shared contribution ledger",
    description:
      "Members report payments; managers confirm them. Partial amounts and shortfalls stay visible to everyone in the group.",
  },
  {
    title: "Cycle from forming to finish",
    description:
      "Set contribution amount, schedule, and roster size. Activate when ready and track each round until the paluwagan completes.",
  },
  {
    title: "Payout order built in",
    description:
      "Randomize turn order or set it manually once the roster is full — so everyone knows who receives the pot and when.",
  },
  {
    title: "Invite links & open slots",
    description:
      "Share invite links, add placeholder members, and fill seats before starting. Claim links let people join with one tap.",
  },
  {
    title: "Shortfall tracking",
    description:
      "When someone underpays, the gap is recorded. Managers can see outstanding obligations across their groups.",
  },
  {
    title: "Home dashboard & alerts",
    description:
      "See forming and active groups at a glance, payments due, pending confirmations, and recent activity in one place.",
  },
] as const;

const STEPS = [
  {
    step: "1",
    title: "Create your paluwagan",
    description:
      "Name the group, set the contribution amount, pick weekly to monthly (or custom) intervals, and choose how many members join.",
  },
  {
    step: "2",
    title: "Fill the roster",
    description:
      "Invite members with a link or add placeholders for people who have not signed up yet.",
  },
  {
    step: "3",
    title: "Set payout order & start",
    description:
      "Once every seat is taken, lock in turn order and activate the group to open Round 1.",
  },
  {
    step: "4",
    title: "Run each round together",
    description:
      "Report and confirm contributions each cycle, follow the schedule, and finish with a clear record for every member.",
  },
] as const;

function LandingSectionHeader({
  title,
  description,
  className = "",
}: {
  title: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={`mx-auto max-w-2xl text-center ${className}`}>
      <h2 className="font-heading text-3xl font-medium tracking-tight text-slate-900">{title}</h2>
      <p className="mt-3 text-base text-slate-600">{description}</p>
    </div>
  );
}

function LandingFeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <article className={ui.cardCompact}>
      <h3 className="font-heading text-base font-medium text-slate-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
    </article>
  );
}

function LandingTimelineStep({
  step,
  title,
  description,
  isLast,
}: {
  step: string;
  title: string;
  description: string;
  isLast: boolean;
}) {
  return (
    <li className="relative flex gap-6 pb-10 last:pb-0">
      {!isLast && (
        <span
          aria-hidden
          className="absolute left-[17px] top-9 h-[calc(100%-12px)] w-px bg-emerald-200"
        />
      )}
      <span className="relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-emerald-900 bg-white font-heading text-sm font-medium text-emerald-900">
        {step}
      </span>
      <div className="min-w-0 pt-0.5">
        <h3 className="font-heading text-base font-medium text-slate-900">{title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
      </div>
    </li>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-50 font-body">
      <header className={`mx-auto flex ${ui.page} items-center justify-between px-6 py-6`}>
        <span className="font-heading text-xl font-bold tracking-tight text-emerald-900">Kaban</span>
        <div className="flex items-center gap-3">
          <Link
            to="/login"
            className={`inline-flex h-10 items-center justify-center ${ui.btnSecondary} px-6 text-emerald-900`}
          >
            Log in
          </Link>
          <Link
            to="/register"
            className={`inline-flex h-10 items-center justify-center ${ui.btnPrimarySm} px-6`}
          >
            Sign up
          </Link>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 pb-16 pt-10 text-center sm:pt-16">
          <h1 className="font-heading text-4xl font-medium tracking-tight text-slate-900 sm:text-5xl">
            Coordination and transparency for your paluwagan
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
            Kaban helps organizers and members stay aligned on contributions, payout turns, and
            shortfalls — with a shared ledger everyone can trust. Money still moves the way you
            already handle it; Kaban keeps the record straight.
          </p>
          <div className="mt-10 flex justify-center">
            <Link to="/register" className={ui.btnPrimary}>
              Create account
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 pb-20">
          <LandingSectionHeader
            title="What Kaban handles"
            description="Everything your group needs to run a paluwagan without spreadsheets or group-chat confusion."
          />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <LandingFeatureCard
                key={feature.title}
                title={feature.title}
                description={feature.description}
              />
            ))}
          </div>
        </section>

        <section className="border-y border-emerald-100/80 bg-white/60 px-6 py-20">
          <div className="mx-auto max-w-3xl">
            <LandingSectionHeader
              title="How it works"
              description="From first invite to final payout — four steps to get your group running."
            />
            <ol className="mt-12">
              {STEPS.map((item, index) => (
                <LandingTimelineStep
                  key={item.step}
                  step={item.step}
                  title={item.title}
                  description={item.description}
                  isLast={index === STEPS.length - 1}
                />
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-6 py-20">
          <LandingSectionHeader
            title="What Kaban is"
            description="A coordination tool for paluwagan groups — not a wallet or payment processor."
            className="mb-10"
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <div className={ui.callout}>
              <h3 className="font-heading text-lg font-medium text-emerald-900">Not a payment app</h3>
              <p className="mt-3 text-sm leading-relaxed text-emerald-900/80">
                Kaban does not move money, hold balances, or process transfers. Members pay each
                other the way they already do — cash, bank transfer, or e-wallet — and use Kaban
                to report, confirm, and reconcile what was paid.
              </p>
            </div>
            <div className={ui.cardCompact}>
              <h3 className="font-heading text-lg font-medium text-slate-900">
                Built for organizers & members
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-600">
                <li className="flex gap-2">
                  <span className="text-emerald-700" aria-hidden>
                    ·
                  </span>
                  <span>
                    <strong className="font-medium text-slate-900">Managers</strong> create groups,
                    invite members, set payout order, confirm payments, and track shortfalls.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-700" aria-hidden>
                    ·
                  </span>
                  <span>
                    <strong className="font-medium text-slate-900">Members</strong> see their turn,
                    report contributions, and follow progress through each round.
                  </span>
                </li>
                <li className="flex gap-2">
                  <span className="text-emerald-700" aria-hidden>
                    ·
                  </span>
                  <span>
                    <strong className="font-medium text-slate-900">Everyone</strong> gets
                    notifications and a home dashboard so nothing slips through the cracks.
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-3xl px-6 pb-24 text-center">
          <div className={ui.card}>
            <h2 className="font-heading text-2xl font-medium tracking-tight text-slate-900">
              Ready to organize your next paluwagan?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-base text-slate-600">
              Create a free account, start a group, and invite your members in minutes.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
