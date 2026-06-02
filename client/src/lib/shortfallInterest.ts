import { formatFrequency, type GroupFrequencyValue } from "./frequency";

export function shortfallInterestPeriodLabel(
  frequency: GroupFrequencyValue | string,
  frequencyDays?: number | null,
): string {
  switch (frequency) {
    case "weekly":
      return "week";
    case "biweekly":
      return "two weeks";
    case "monthly":
      return "month";
    case "custom":
      return frequencyDays != null ? `${frequencyDays}-day period` : "period";
    default:
      return "period";
  }
}

export function formatShortfallInterestRate(
  rate: string | number | null | undefined,
  frequency: GroupFrequencyValue | string,
  frequencyDays?: number | null,
): string {
  const n = Number(rate ?? 0);
  if (Number.isNaN(n) || n <= 0) return "None";
  return `${n}% per ${shortfallInterestPeriodLabel(frequency, frequencyDays)}`;
}

export function formatShortfallInterestHint(
  frequency: GroupFrequencyValue | string,
  frequencyDays?: number | null,
): string {
  const schedule = formatFrequency(frequency as GroupFrequencyValue, frequencyDays ?? null);
  return `Charged on unpaid shortfalls each ${shortfallInterestPeriodLabel(frequency, frequencyDays)} (${schedule} rounds)`;
}
