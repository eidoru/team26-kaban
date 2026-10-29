import type { ReactNode } from "react";
import { feeOn } from "@domain/fees";
import type { PublicGroup } from "../../api/client";
import { KabanLogo } from "../../components/KabanLogo";
import { formatDueDate } from "../../lib/dates";
import { formatPeso, formatRate } from "../../lib/money";

/** Page frame for link landing pages: open to guests, centered, phone-first. */
export function JoinShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-cream px-4 py-8 sm:py-14">
      <div className="mx-auto max-w-lg">
        <div className="mb-8 flex justify-center">
          <KabanLogo size="lg" />
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-ink-500">Kaban records payments. Money moves between members directly.</p>
      </div>
    </div>
  );
}

/**
 * A paluwagan's terms as a ticket (R-INV-01): what joining commits you to, before you decide.
 * `eyebrow` names who's inviting; `children` holds the actions under the tear line.
 */
export function Ticket({ group, eyebrow, children }: { group: PublicGroup; eyebrow: ReactNode; children: ReactNode }) {
  const facts = [
    { label: "Each payout", value: formatPeso(group.pot) },
    { label: "Members", value: `${group.occupied} of ${group.slotCount} joined` },
    { label: "Starts", value: formatDueDate(group.startDate) },
    {
      label: "If you pay short",
      value: group.interestRate > 0 ? `${formatRate(group.interestRate)} interest per period` : "No interest",
    },
  ];
  return (
    <article className="animate-pop overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-lift">
      <div className="bg-brand-700 px-6 pb-6 pt-5 text-white">
        <p className="text-sm text-brand-100">{eyebrow}</p>
        <h1 className="font-heading mt-1 text-2xl font-bold text-balance">{group.name}</h1>
        <p className="mt-4 text-xs font-bold uppercase tracking-wide text-brand-100">You pay</p>
        <p className="font-heading text-4xl font-bold tabular-nums">{formatPeso(group.contribution)}</p>
        <p className="text-sm text-brand-50">
          {group.frequencyLabel.toLowerCase()}
          {/* R-INV-01, R-DEC-39: the organizing fee is part of what joining commits you to. */}
          {group.organizerFeeRate > 0 &&
            `, plus ${formatPeso(feeOn(group.contribution, group.organizerFeeRate))} organizing fee (${formatRate(group.organizerFeeRate)})`}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-4 px-6 py-5">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt className="text-xs text-ink-500">{fact.label}</dt>
            <dd className="text-sm font-bold text-ink-900">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="relative border-t-2 border-dashed border-ink-200 px-6 py-5">
        <span aria-hidden className="absolute -left-3 -top-3 h-6 w-6 rounded-full bg-cream" />
        <span aria-hidden className="absolute -right-3 -top-3 h-6 w-6 rounded-full bg-cream" />
        {children}
      </div>
    </article>
  );
}

/** A dead or unusable link. */
export function LinkProblem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-3xl border-2 border-dashed border-ink-300 bg-white p-8 text-center">
      <h1 className="font-heading text-xl font-bold text-ink-900">{title}</h1>
      <p className="mt-2 text-sm text-ink-600">{body}</p>
    </div>
  );
}
