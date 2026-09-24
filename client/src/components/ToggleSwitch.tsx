import { ui } from "../lib/ui";

/** Shared on/off switch for optional settings — pairs a label with a pill-shaped toggle. */
export function ToggleSwitch({
  checked,
  onChange,
  label,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id: string;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-4">
      <span className="text-sm font-normal text-slate-700">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`${ui.toggleTrack} ${checked ? ui.toggleTrackOn : ui.toggleTrackOff}`}
      >
        <span className={`${ui.toggleThumb} ${checked ? "translate-x-6" : "translate-x-1"}`} />
      </button>
    </label>
  );
}
