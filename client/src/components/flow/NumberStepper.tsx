import { Minus, Plus } from "lucide-react";
import { useId } from "react";

/** A whole number with big − / + buttons, for counts people adjust by one (slots). */
export function NumberStepper({
  label,
  value,
  onChange,
  min,
  max,
  unit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max?: number | null;
  /** Shown after the number, e.g. "slots". */
  unit?: string;
}) {
  const id = useId();
  const button =
    "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-ink-200 bg-white text-ink-700 transition-colors hover:border-brand-300 hover:bg-brand-50 disabled:opacity-40 disabled:hover:border-ink-200 disabled:hover:bg-white";
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-ink-600">
        {label}
      </label>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={button}
          onClick={() => onChange(value - 1)}
          disabled={value <= min}
          aria-label={`Fewer ${unit ?? ""}`.trim()}
        >
          <Minus className="h-5 w-5" aria-hidden />
        </button>
        <div className="flex min-w-0 flex-1 items-baseline justify-center gap-2 rounded-2xl border-2 border-ink-200 bg-white px-4 py-1.5">
          <input
            id={id}
            type="number"
            inputMode="numeric"
            min={min}
            max={max ?? undefined}
            value={Number.isFinite(value) ? value : ""}
            onChange={(e) => onChange(e.target.value === "" ? NaN : Math.floor(Number(e.target.value)))}
            className="font-heading w-16 bg-transparent text-center text-3xl font-bold tabular-nums text-ink-900 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
          />
          {unit && <span className="text-sm font-semibold text-ink-500">{unit}</span>}
        </div>
        <button
          type="button"
          className={button}
          onClick={() => onChange((Number.isFinite(value) ? value : min - 1) + 1)}
          disabled={max != null && value >= max}
          aria-label={`More ${unit ?? ""}`.trim()}
        >
          <Plus className="h-5 w-5" aria-hidden />
        </button>
      </div>
    </div>
  );
}
