import { type KeyboardEvent, useRef } from "react";
import { ui } from "../lib/ui";

// Static strings so Tailwind generates them; 4 options become a 2×2 grid on phones.
const PHONE_COLUMNS: Record<number, string> = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2" };

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
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = Math.max(
    0,
    options.findIndex((opt) => opt.value === value),
  );

  function select(index: number) {
    const next = (index + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  // Radio-group pattern: arrows move and select; one Tab stop for the whole group.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const moves: Record<string, number> = {
      ArrowRight: selectedIndex + 1,
      ArrowDown: selectedIndex + 1,
      ArrowLeft: selectedIndex - 1,
      ArrowUp: selectedIndex - 1,
      Home: 0,
      End: options.length - 1,
    };
    if (!(e.key in moves)) return;
    e.preventDefault();
    select(moves[e.key]);
  }

  return (
    <div
      role="radiogroup"
      aria-label={name}
      onKeyDown={onKeyDown}
      className={`${ui.segmentedTrack} ${PHONE_COLUMNS[options.length] ?? "grid-cols-2"}`}
    >
      {options.map((opt, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(opt.value)}
            className={checked ? ui.segmentedOptionActive : ui.segmentedOption}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
