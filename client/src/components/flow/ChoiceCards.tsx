import { Check } from "lucide-react";
import { type ReactNode, useId } from "react";

/** A radio group drawn as tappable cards. Full-width rows on phones; `columns` from sm up. */
export function ChoiceCards<T extends string>({
  label,
  value,
  onChange,
  options,
  columns = 1,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: { value: T; title: string; detail?: ReactNode }[];
  columns?: 1 | 2;
}) {
  const name = useId();
  return (
    <fieldset>
      <legend className="mb-1.5 block text-sm font-semibold text-ink-600">{label}</legend>
      <div className={`grid gap-2 ${columns === 2 ? "sm:grid-cols-2" : ""}`}>
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <label
              key={option.value}
              className={`flex min-h-14 cursor-pointer items-start gap-3 rounded-2xl border-2 px-4 py-3 transition-colors has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/20 ${
                selected ? "border-brand-600 bg-brand-50" : "border-ink-200 bg-white hover:border-brand-200"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white"
                }`}
              >
                {selected && <Check className="h-3 w-3" strokeWidth={3} />}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-bold text-ink-900">{option.title}</span>
                {option.detail && <span className="mt-0.5 block text-xs text-ink-500">{option.detail}</span>}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
