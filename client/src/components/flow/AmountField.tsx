import { useId, useState } from "react";
import { ui } from "../../lib/ui";

/**
 * A peso amount input. `error` comes from the shared rules; it shows under the field once the
 * viewer has typed something or left the field, so the form checks as you type.
 */
export function AmountField({
  label,
  value,
  onChange,
  error,
  helper,
  placeholder,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | null;
  helper?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const shown = touched || value.trim() ? error : null;

  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-base font-bold text-ink-500" aria-hidden>
          ₱
        </span>
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder={placeholder}
          autoFocus={autoFocus}
          aria-invalid={!!shown}
          aria-describedby={shown || helper ? `${id}-note` : undefined}
          className={`${ui.input} ${ui.money} pl-9 text-base font-bold ${
            shown ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/15" : ""
          }`}
        />
      </div>
      {shown ? (
        <p id={`${id}-note`} className="mt-1.5 text-xs font-semibold text-danger-700">
          {shown}
        </p>
      ) : (
        helper && (
          <p id={`${id}-note`} className={ui.helperText}>
            {helper}
          </p>
        )
      )}
    </div>
  );
}
