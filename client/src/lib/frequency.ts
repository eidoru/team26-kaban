export type GroupFrequencyValue = "weekly" | "biweekly" | "monthly" | "custom";

export function formatFrequency(frequency: string, frequencyDays?: number | null): string {
  switch (frequency) {
    case "weekly":
      return "Weekly";
    case "biweekly":
      return "Bi-weekly";
    case "monthly":
      return "Monthly";
    case "custom":
      if (frequencyDays != null && frequencyDays > 0) {
        return `Every ${frequencyDays} day${frequencyDays === 1 ? "" : "s"}`;
      }
      return "Custom";
    default:
      return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  }
}
