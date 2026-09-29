export type MetricTileTone = "neutral" | "success" | "warning" | "danger";

const VALUE_TONE: Record<MetricTileTone, string> = {
  neutral: "text-ink-900",
  success: "text-brand-700",
  warning: "text-ink-900",
  danger: "text-danger-700",
};

/** Compact metric: label, value, one line of context. Small enough to sit two across on a phone. */
export function MetricTile({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: MetricTileTone;
}) {
  return (
    <div className="rounded-2xl bg-ink-50 px-4 py-3">
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`font-heading mt-0.5 text-xl font-bold tabular-nums ${VALUE_TONE[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-600">{hint}</p>}
    </div>
  );
}
