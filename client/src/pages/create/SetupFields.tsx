import { CalendarDays, Info } from "lucide-react";
import { MAX_ORGANIZER_FEE_PERCENT, MAX_SLOTS, MIN_CUSTOM_INTERVAL_DAYS, MIN_SLOTS } from "@domain/constants";
import { addDebt, chargePeriodInterest, NO_DEBT, outstanding } from "@domain/debt";
import { feeOn } from "@domain/fees";
import { pesos, rateFromPercent } from "@domain/money";
import { frequencyLabel, type SetupErrors } from "@domain/setup";
import type { Frequency } from "@domain/schedule";
import { AmountField } from "../../components/flow/AmountField";
import { ChoiceCards } from "../../components/flow/ChoiceCards";
import { Field } from "../../components/flow/Field";
import { NumberStepper } from "../../components/flow/NumberStepper";
import { ToggleSwitch } from "../../components/ToggleSwitch";
import { formatDueDate } from "../../lib/dates";
import { formatPeso } from "../../lib/money";
import { previewAmounts, previewDates, previewFeeRate, type SetupDraft } from "./setupDraft";

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
        {errors.slotCount && <p className="mt-1.5 text-xs font-semibold text-danger-700">{errors.slotCount}</p>}
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
      >
        {(props) => (
          <input {...props} type="date" min={earliestStart} value={draft.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        )}
      </Field>
      {dates && (
        <dl className="flex items-start gap-3 rounded-2xl border border-ink-200 bg-white p-4">
          <CalendarDays className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" aria-hidden />
          <div className="min-w-0 flex-1">
            <dt className="text-xs text-ink-500">First payout</dt>
            <dd className="text-sm font-bold text-ink-900">{formatDueDate(dates.first)}</dd>
          </div>
          <div className="min-w-0 flex-1">
            <dt className="text-xs text-ink-500">Last payout</dt>
            <dd className="text-sm font-bold text-ink-900">{formatDueDate(dates.last)}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

/** How many payouts the interest example walks through. */
const EXAMPLE_ROUNDS = 3;

/**
 * A worked example for the interest step, from the draft's own numbers: a member pays half their
 * contribution at the first payout and repays nothing after. R-DBT-02 charges interest when the debt is
 * created, R-DBT-03 again at each later payout, on principal only.
 */
function interestExample(draft: SetupDraft, errors: SetupErrors) {
  const percent = Number(draft.interestText);
  if (!draft.interestOn || errors.interestPercent || !(percent > 0)) return null;
  const rate = rateFromPercent(percent);
  const contribution = previewAmounts(draft)?.contribution ?? null;
  const half = contribution != null ? pesos(Math.floor(contribution / pesos(1) / 2)) : 0;
  const shortfall = half > 0 ? half : (contribution ?? pesos(1_000));
  const dates = previewDates(draft, errors)?.all ?? null;
  const count = Math.min(EXAMPLE_ROUNDS, dates?.length ?? draft.slotCount);

  let { debt, interestCharged } = addDebt(NO_DEBT, shortfall, rate);
  const rounds = [{ date: dates?.[0] ?? null, interestCharged, owed: outstanding(debt) }];
  for (let k = 1; k < count; k++) {
    ({ debt, interestCharged } = chargePeriodInterest(debt, rate));
    rounds.push({ date: dates?.[k] ?? null, interestCharged, owed: outstanding(debt) });
  }
  return { contribution, shortfall, rounds };
}

export function InterestSection({ draft, set, errors }: SectionProps) {
  const example = interestExample(draft, errors);
  return (
    <div className="space-y-5">
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
      {example && (
        <div className="rounded-2xl bg-ink-50 p-4 text-sm text-ink-700" aria-live="polite">
          <p className="text-xs font-bold uppercase tracking-wide text-ink-500">Example</p>
          <p className="mt-1">
            A member pays only{" "}
            {example.contribution != null && example.contribution > example.shortfall ? (
              <>
                <b className="tabular-nums">{formatPeso(example.contribution - example.shortfall)}</b> of their{" "}
                <b className="tabular-nums">{formatPeso(example.contribution)}</b>
              </>
            ) : (
              <b>nothing</b>
            )}
            , so you cover <b className="tabular-nums">{formatPeso(example.shortfall)}</b> for them.
          </p>
          <ol className="mt-3 space-y-2">
            {example.rounds.map((round, i) => (
              <li key={i} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2">
                <span className="h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-ink-900">
                    {round.date ? formatDueDate(round.date) : `Round ${i + 1}`}
                  </span>
                  <span className="block text-xs text-ink-500">
                    {i === 0 ? "Debt starts" : "Still unpaid"} · +{formatPeso(round.interestCharged)} interest
                  </span>
                </span>
                <span className="text-right">
                  <span className="block text-xs text-ink-500">Owes</span>
                  <b className="tabular-nums text-ink-900">{formatPeso(round.owed)}</b>
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3">
            Interest is charged only on the {formatPeso(example.shortfall)} they&apos;re short, never on interest. It
            stops once they repay, or when the debt is taken from their payout.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * R-SET-08, R-DEC-39: the optional organizing fee. Members pay it on top of each payment, outside the
 * pot; the organizer pays none. The example uses the draft's own contribution.
 */
export function FeeSection({ draft, set, errors }: SectionProps) {
  const rate = previewFeeRate(draft, errors);
  const contribution = previewAmounts(draft)?.contribution ?? pesos(1_000);
  const fee = rate != null ? feeOn(contribution, rate) : null;
  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-ink-200 bg-white p-4">
        <ToggleSwitch
          id="feeOn"
          checked={draft.feeOn}
          onChange={(feeOn) => set({ feeOn })}
          label="Charge an organizing fee"
        />
        <p className="mt-1 text-xs text-ink-500">Members add this % to each payment, for you.</p>
      </div>
      {draft.feeOn && (
        <Field
          label={`Fee per payment (%, up to ${MAX_ORGANIZER_FEE_PERCENT})`}
          error={errors.organizerFeePercent}
          hasValue={draft.feeText.trim() !== ""}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              inputMode="decimal"
              value={draft.feeText}
              onChange={(e) => set({ feeText: e.target.value })}
              placeholder="2"
            />
          )}
        </Field>
      )}
      {fee != null && (
        <p className="rounded-2xl bg-ink-50 p-4 text-sm text-ink-700" aria-live="polite">
          A member paying <b className="tabular-nums">{formatPeso(contribution)}</b> sends{" "}
          <b className="tabular-nums">{formatPeso(contribution + fee)}</b>: {formatPeso(fee)} is your fee. It stays out
          of the pot.
        </p>
      )}
    </div>
  );
}
