import { ui } from "../lib/ui";

/** Shared radio-style pill group — use this instead of a <select> wherever there
 * are a handful of mutually exclusive options the user should be able to scan at a glance. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  name,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  name: string;
}) {
  return (
    <div role="radiogroup" aria-label={name} className={ui.segmentedTrack}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={value === opt.value ? ui.segmentedOptionActive : ui.segmentedOption}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
