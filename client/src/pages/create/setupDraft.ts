import { computeAmounts, type AmountMode } from "@domain/amounts";
import { MIN_SLOTS } from "@domain/constants";
import { payoutDates, type Frequency } from "@domain/schedule";
import { setupErrors, type SetupErrors, type SetupInput } from "@domain/setup";
import type { GroupSummary } from "../../api/client";
import { parsePesoInput, pesoInputValue } from "../../lib/money";

/** The setup form as typed. Amounts stay text until submit, so "1,500." doesn't fight the cursor. */
export interface SetupDraft {
  name: string;
  slotCount: number;
  amountMode: AmountMode;
  amountText: string;
  frequency: Frequency;
  intervalText: string;
  startDate: string;
  interestOn: boolean;
  interestText: string;
}

export const emptyDraft = (): SetupDraft => ({
  name: "",
  slotCount: 5,
  amountMode: "CONTRIBUTION",
  amountText: "",
  frequency: "MONTHLY",
  intervalText: "",
  startDate: "",
  interestOn: false,
  interestText: "",
});

/** A saved group back into a draft, for the edit page. */
export function draftFromGroup(group: GroupSummary): SetupDraft {
  return {
    name: group.name,
    slotCount: group.slotCount,
    amountMode: group.amountMode,
    amountText: pesoInputValue(group.amountMode === "POT" ? (group.enteredPot ?? group.pot) : group.contribution),
    frequency: group.frequency,
    intervalText: group.intervalDays ? String(group.intervalDays) : "",
    startDate: group.startDate,
    interestOn: group.interestRate > 0,
    interestText: group.interestRate > 0 ? String(group.interestRate / 100) : "",
  };
}

export function toInput(draft: SetupDraft): SetupInput {
  return {
    name: draft.name,
    slotCount: draft.slotCount,
    amountMode: draft.amountMode,
    amount: parsePesoInput(draft.amountText),
    frequency: draft.frequency,
    intervalDays: draft.frequency === "CUSTOM" ? Number(draft.intervalText) || null : null,
    startDate: draft.startDate,
    interestPercent: draft.interestOn ? Number(draft.interestText) : null,
  };
}

/**
 * The server's own rules (domain/setup.ts) plus what only the form can get wrong: text that isn't
 * a number. `minSlots` is the occupied-slot floor when editing (R-LOB-10).
 */
export function draftErrors(draft: SetupDraft, today: string, minSlots = MIN_SLOTS): SetupErrors {
  const input = toInput(draft);
  const errors = setupErrors(input, today, minSlots);
  if (draft.amountText.trim() && Number.isNaN(input.amount)) {
    errors.amount = "Enter an amount like 1500 or 1,500.50.";
  }
  if (draft.interestOn) {
    if (!draft.interestText.trim()) errors.interestPercent = "Enter a percentage, or turn interest off.";
    else if (!/^\d*\.?\d+$/.test(draft.interestText.trim())) errors.interestPercent = "Enter a number like 1.25.";
    else if (Number(draft.interestText) === 0) errors.interestPercent = "Enter a percentage above 0, or turn interest off.";
  }
  return errors;
}

/** Which fields each wizard step owns, so a step can't continue with its own errors. */
export const STEP_FIELDS: (keyof SetupErrors)[][] = [
  ["name", "slotCount"],
  ["amount"],
  ["frequency", "intervalDays", "startDate"],
  ["interestPercent"],
  [],
];

/** The live numbers for the pot card, or null until the amount is usable. */
export function previewAmounts(draft: SetupDraft) {
  const input = toInput(draft);
  if (!Number.isFinite(input.amount) || input.amount <= 0 || !(input.slotCount >= MIN_SLOTS)) return null;
  return computeAmounts(input.amountMode, input.amount, input.slotCount);
}

/** The payout dates (first and last pulled out), or null until the schedule is valid. */
export function previewDates(draft: SetupDraft, errors: SetupErrors) {
  if (errors.startDate || errors.intervalDays || errors.slotCount || !draft.startDate) return null;
  const dates = payoutDates(draft.startDate, draft.frequency, draft.slotCount, Number(draft.intervalText) || undefined);
  return { all: dates, first: dates[0], last: dates[dates.length - 1], count: dates.length };
}
