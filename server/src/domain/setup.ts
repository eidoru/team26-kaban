import { computeAmounts, type AmountMode, type GroupAmounts } from "./amounts.js";
import {
  INTEREST_DECIMAL_PLACES,
  MAX_INTEREST_PERCENT,
  MAX_NAME_LENGTH,
  MAX_SLOTS,
  MIN_CUSTOM_INTERVAL_DAYS,
  MIN_SLOTS,
  MIN_START_LEAD_DAYS,
} from "./constants.js";
import { formatPeso, isWholePeso, rateFromPercent, type Centavos, type RateBasisPoints } from "./money.js";
import { addDays, type CalendarDate, type Frequency } from "./schedule.js";

/** The setup form (§4.1), also used for lobby edits (R-LOB-09). Amounts in centavos. */
export interface SetupInput {
  name: string;
  slotCount: number;
  amountMode: AmountMode;
  /** The contribution (contribution mode) or the pot (pot mode). */
  amount: Centavos;
  frequency: Frequency;
  /** CUSTOM only. */
  intervalDays?: number | null;
  startDate: CalendarDate;
  /** Percent per period, e.g. 1.25; null or 0 for none. */
  interestPercent?: number | null;
}

export type SetupField = keyof SetupInput;
export type SetupErrors = Partial<Record<SetupField, string>>;

/** The canonical settings a group stores, derived from valid input. */
export interface GroupSettings extends GroupAmounts {
  name: string;
  slotCount: number;
  amountMode: AmountMode;
  enteredPot: Centavos | null;
  frequency: Frequency;
  intervalDays: number | null;
  startDate: CalendarDate;
  interestRate: RateBasisPoints;
}

/** R-SET-05: the earliest start date allowed today. */
export function earliestStartDate(today: CalendarDate): CalendarDate {
  return addDays(today, MIN_START_LEAD_DAYS);
}

function decimalPlaces(value: number): number {
  const text = String(value);
  return text.includes(".") ? text.split(".")[1].length : 0;
}

/**
 * Field-level problems with a setup or edit (R-SET-01…06, R-FRQ-05). Name uniqueness needs the
 * database and is checked by the service. `minSlots` is the occupied-slot floor for edits (R-LOB-10).
 */
export function setupErrors(input: SetupInput, today: CalendarDate, minSlots = MIN_SLOTS): SetupErrors {
  const errors: SetupErrors = {};
  const name = input.name.trim();
  if (!name) errors.name = "Give your paluwagan a name.";
  else if (MAX_NAME_LENGTH !== null && name.length > MAX_NAME_LENGTH) {
    errors.name = `Names can be up to ${MAX_NAME_LENGTH} characters.`;
  }

  const floor = Math.max(MIN_SLOTS, minSlots);
  if (!Number.isInteger(input.slotCount)) errors.slotCount = "Enter a whole number of slots.";
  else if (input.slotCount < floor) {
    errors.slotCount =
      floor > MIN_SLOTS
        ? `${floor} slots are already taken, so you need at least ${floor}.`
        : `A paluwagan needs at least ${MIN_SLOTS} slots.`;
  } else if (MAX_SLOTS !== null && input.slotCount > MAX_SLOTS) {
    errors.slotCount = `A paluwagan can have up to ${MAX_SLOTS} slots.`;
  }

  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) errors.amount = "Enter an amount greater than zero.";
  else if (input.amountMode === "CONTRIBUTION" && !isWholePeso(input.amount)) {
    errors.amount = "Contributions are whole pesos, with no centavos.";
  }

  if (input.frequency === "CUSTOM") {
    const days = input.intervalDays;
    if (days == null || !Number.isInteger(days) || days < MIN_CUSTOM_INTERVAL_DAYS) {
      errors.intervalDays = `Choose an interval of at least ${MIN_CUSTOM_INTERVAL_DAYS} days.`;
    }
  }

  const earliest = earliestStartDate(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) errors.startDate = "Choose a start date.";
  else if (input.startDate < earliest) {
    errors.startDate = `The start date must be at least ${MIN_START_LEAD_DAYS} days from today.`;
  }

  const interest = input.interestPercent;
  if (interest != null && interest !== 0) {
    if (!Number.isFinite(interest) || interest < 0) errors.interestPercent = "Enter a positive percentage.";
    else if (decimalPlaces(interest) > INTEREST_DECIMAL_PLACES) {
      errors.interestPercent = `Use at most ${INTEREST_DECIMAL_PLACES} decimal places.`;
    } else if (MAX_INTEREST_PERCENT !== null && interest > MAX_INTEREST_PERCENT) {
      errors.interestPercent = `Interest can be at most ${MAX_INTEREST_PERCENT}%.`;
    }
  }
  return errors;
}

/** Valid input → stored settings. Call only when `setupErrors` is empty. */
export function toSettings(input: SetupInput): GroupSettings {
  const amounts = computeAmounts(input.amountMode, input.amount, input.slotCount);
  return {
    ...amounts,
    name: input.name.trim(),
    slotCount: input.slotCount,
    amountMode: input.amountMode,
    enteredPot: input.amountMode === "POT" ? input.amount : null,
    frequency: input.frequency,
    intervalDays: input.frequency === "CUSTOM" ? (input.intervalDays ?? null) : null,
    startDate: input.startDate,
    interestRate: input.interestPercent ? rateFromPercent(input.interestPercent) : 0,
  };
}


const FREQUENCY_LABELS: Record<Frequency, string> = {
  WEEKLY: "Weekly",
  BI_WEEKLY: "Every 2 weeks",
  TWICE_MONTHLY: "Twice a month (15th and month-end)",
  MONTHLY: "Monthly",
  CUSTOM: "Custom",
};

export function frequencyLabel(frequency: Frequency, intervalDays: number | null): string {
  return frequency === "CUSTOM" ? `Every ${intervalDays} days` : FREQUENCY_LABELS[frequency];
}

/** One changed setting, with display values, for the R-LOB-09 notification and audit entry. */
export interface SettingChange {
  field: "name" | "slotCount" | "contribution" | "pot" | "frequency" | "startDate" | "interestRate";
  label: string;
  before: string;
  after: string;
}

/** What changed between two settings, in display form. Pot and contribution are listed separately. */
export function settingChanges(before: GroupSettings, after: GroupSettings): SettingChange[] {
  const rate = (bp: number) => (bp === 0 ? "None" : `${bp / 100}% per period`);
  const rows: SettingChange[] = [
    { field: "name", label: "Name", before: before.name, after: after.name },
    { field: "slotCount", label: "Slots", before: String(before.slotCount), after: String(after.slotCount) },
    { field: "contribution", label: "Contribution", before: formatPeso(before.contribution), after: formatPeso(after.contribution) },
    { field: "pot", label: "Pot", before: formatPeso(before.pot), after: formatPeso(after.pot) },
    {
      field: "frequency",
      label: "Frequency",
      before: frequencyLabel(before.frequency, before.intervalDays),
      after: frequencyLabel(after.frequency, after.intervalDays),
    },
    { field: "startDate", label: "Start date", before: before.startDate, after: after.startDate },
    { field: "interestRate", label: "Shortfall interest", before: rate(before.interestRate), after: rate(after.interestRate) },
  ];
  return rows.filter((row) => row.before !== row.after);
}

/** Why the group can't launch yet (R-LCH-02), in the order the organizer should fix them. */
export function launchBlockers(state: {
  slotCount: number;
  occupied: number;
  orderLocked: boolean;
  startDate: CalendarDate;
  today: CalendarDate;
}): string[] {
  const blockers: string[] = [];
  const open = state.slotCount - state.occupied;
  if (open > 0) blockers.push(`Fill the ${open} open slot${open === 1 ? "" : "s"}.`);
  else if (!state.orderLocked) blockers.push("Lock the payout order.");
  if (state.startDate < earliestStartDate(state.today)) {
    blockers.push(`Move the start date to at least ${MIN_START_LEAD_DAYS} days from today.`);
  }
  return blockers;
}
