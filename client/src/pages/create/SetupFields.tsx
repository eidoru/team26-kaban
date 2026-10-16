import { CalendarDays, Info } from "lucide-react";
import { MAX_SLOTS, MIN_CUSTOM_INTERVAL_DAYS, MIN_SLOTS, MIN_START_LEAD_DAYS } from "@domain/constants";
import { interestOn, pesos, rateFromPercent } from "@domain/money";
import { frequencyLabel, type SetupErrors } from "@domain/setup";
import type { Frequency } from "@domain/schedule";
import { AmountField } from "../../components/flow/AmountField";
import { ChoiceCards } from "../../components/flow/ChoiceCards";
import { Field } from "../../components/flow/Field";
import { NumberStepper } from "../../components/flow/NumberStepper";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { formatDueDate } from "../../lib/dates";
import { formatPeso } from "../../lib/money";
import { previewAmounts, previewDates, type SetupDraft } from "./setupDraft";

type SectionProps = {
  draft: SetupDraft;
  set: (patch: Partial<SetupDraft>) => void;
  errors: SetupErrors;
};

/** The live pot: what each member pays and what each payout is. Shown on every money-related step. */
export function PotCard({ draft }: { draft: SetupDraft }) {
  const amounts = previewAmounts(draft);
  const often = frequencyLabel(draft.frequency, Number(draft.intervalText) || null).toLowerCase();
  return (
    <div className="rounded-3xl bg-brand-700 p-5 text-white shadow-card" aria-live="polite">
      <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Each payout</p>
      <p className="font-heading mt-1 text-4xl font-bold tabular-nums">{amounts ? formatPeso(amounts.pot) : "₱—"}</p>
      <p className="mt-2 text-sm text-brand-50">
        {amounts ? (
          <>
            Each of the {draft.slotCount} members pays <b className="tabular-nums">{formatPeso(amounts.contribution)}</b>{" "}
            {often}.
          </>
        ) : (
          "Enter an amount to see the pot."
        )}
      </p>
    </div>
  );
}

export function BasicsSection({ draft, set, errors }: SectionProps) {
  return (
    <div className="space-y-6">
      <Field label="Name" error={errors.name} hasValue={draft.name.trim() !== ""}>
        {(props) => (
          <input
            {...props}
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="e.g. Barkada Savings"
            autoComplete="off"
          />
        )}
      </Field>
      <div>
        <NumberStepper
          label="Number of slots"
          value={draft.slotCount}
          onChange={(slotCount) => set({ slotCount })}
          min={MIN_SLOTS}
          max={MAX_SLOTS}
          unit="slots"
        />
        {errors.slotCount ? (
          <p className="mt-1.5 text-xs font-semibold text-danger-700">{errors.slotCount}</p>
        ) : (
          <p className="mt-2 text-xs text-ink-500">
            One slot is yours. Each slot gets the pot once, so {Number.isFinite(draft.slotCount) ? draft.slotCount : "this many"}{" "}
            slots means {Number.isFinite(draft.slotCount) ? draft.slotCount : "as many"} rounds.
          </p>
        )}
      </div>
    </div>
  );
}

export function MoneySection({ draft, set, errors }: SectionProps) {
  const amounts = previewAmounts(draft);
  return (
    <div className="space-y-6">
      <ChoiceCards
        label="What do you want to set?"
        value={draft.amountMode}
        onChange={(amountMode) => set({ amountMode })}
        columns={2}
        options={[
          { value: "CONTRIBUTION", title: "Each member's contribution", detail: "The pot is that times the slots." },
          { value: "POT", title: "The total pot", detail: "Split evenly, rounded up to the peso." },
        ]}
      />
      <AmountField
        label={draft.amountMode === "POT" ? "Total pot" : "Contribution per member"}
        value={draft.amountText}
        onChange={(amountText) => set({ amountText })}
        error={errors.amount}
        placeholder={draft.amountMode === "POT" ? "10,000" : "2,000"}
        helper={draft.amountMode === "CONTRIBUTION" ? "Whole pesos, no centavos." : undefined}
      />
      {amounts?.potAdjustedFrom != null && (
        <p className="flex gap-2 rounded-2xl bg-sun-50 px-4 py-3 text-sm text-sun-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            {formatPeso(amounts.potAdjustedFrom)} doesn&apos;t split evenly into {draft.slotCount}, so each contribution
            rounds up to {formatPeso(amounts.contribution)} and the pot becomes {formatPeso(amounts.pot)}.
          </span>
        </p>
      )}
    </div>
  );
}

const FREQUENCIES: { value: Frequency; title: string; detail: string }[] = [
  { value: "WEEKLY", title: "Weekly", detail: "Every 7 days" },
  { value: "BI_WEEKLY", title: "Every 2 weeks", detail: "Every 14 days" },
  { value: "TWICE_MONTHLY", title: "Kinsenas", detail: "The 15th and the last day of the month" },
  { value: "MONTHLY", title: "Monthly", detail: "Same day each month" },
  { value: "CUSTOM", title: "Custom", detail: `Every ${MIN_CUSTOM_INTERVAL_DAYS} days or more` },
];

export function ScheduleSection({ draft, set, errors, earliestStart }: SectionProps & { earliestStart: string }) {
  const dates = previewDates(draft, errors);
  return (
    <div className="space-y-6">
      <ChoiceCards
        label="How often is the pot paid out?"
        value={draft.frequency}
        onChange={(frequency) => set({ frequency })}
        columns={2}
        options={FREQUENCIES}
      />
      {draft.frequency === "CUSTOM" && (
        <Field label="Days between payouts" error={errors.intervalDays} hasValue={draft.intervalText.trim() !== ""}>
          {(props) => (
            <input
              {...props}
              type="number"
              inputMode="numeric"
              min={MIN_CUSTOM_INTERVAL_DAYS}
              value={draft.intervalText}
              onChange={(e) => set({ intervalText: e.target.value })}
              placeholder={String(MIN_CUSTOM_INTERVAL_DAYS)}
            />
          )}
        </Field>
      )}
      <Field
        label="Start date"
        error={errors.startDate}
        hasValue={draft.startDate !== ""}
        helper={`At least ${MIN_START_LEAD_DAYS} days from today. Contributions for the first payout are collected from this day.`}
      >
        {(props) => (
          <input {...props} type="date" min={earliestStart} value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        )}
      </Field>
      {dates && (
        <div className="flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-sm">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <p className="text-ink-700">
            First payout <b>{formatDueDate(dates.first)}</b>, last payout <b>{formatDueDate(dates.last)}</b>.{" "}
            {dates.count} rounds in all. No one is paid on the start date itself.
          </p>
        </div>
      )}
    </div>
  );
}

export function InterestSection({ draft, set, errors }: SectionProps) {
  const percent = Number(draft.interestText);
  const example =
    draft.interestOn && !errors.interestPercent && percent > 0 ? interestOn(pesos(1_000), rateFromPercent(percent)) : null;
  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-600">
        If someone pays less than their share, you cover the gap so the pot stays whole. The gap becomes a debt they owe you.
        You can charge simple interest on it.
      </p>
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <ToggleSwitch
          id="interestOn"
          checked={draft.interestOn}
          onChange={(interestOn) => set({ interestOn })}
          label="Charge interest on shortfalls"
        />
      </div>
      {draft.interestOn && (
        <Field
          label="Interest per period (%)"
          error={errors.interestPercent}
          hasValue={draft.interestText.trim() !== ""}
          helper="Up to 2 decimal places, e.g. 1.25."
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              value={draft.interestText}
              onChange={(e) => set({ interestText: e.target.value })}
              placeholder="1.25"
            />
          )}
        </Field>
      )}
      {example != null && (
        <p className="rounded-2xl bg-ink-50 px-4 py-3 text-sm text-ink-700">
          Someone ₱1,000 short would owe <b>{formatPeso(pesos(1_000) + example)}</b>, plus <b>{formatPeso(example)}</b> at
          every later payout until it&apos;s repaid. Interest is never charged on interest.
        </p>
      )}
    </div>
  );
}
