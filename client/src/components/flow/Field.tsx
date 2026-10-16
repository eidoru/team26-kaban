import { type ReactNode, useId, useState } from "react";
import { ui } from "../../lib/ui";

/**
 * A labeled input that shows `error` under itself once the viewer has typed or left the field.
 * `children` receives the input's id and props to spread, so any input type fits.
 */
export function Field({
  label,
  error,
  helper,
  hasValue,
  children,
}: {
  label: string;
  error?: string | null;
  helper?: ReactNode;
  /** Whether the field has content; errors show right away once it does. */
  hasValue: boolean;
  children: (props: {
    id: string;
    onBlur: () => void;
    "aria-invalid": boolean;
    "aria-describedby": string | undefined;
    className: string;
  }) => ReactNode;
}) {
  const id = useId();
  const [touched, setTouched] = useState(false);
  const shown = touched || hasValue ? error : null;
  return (
    <div>
      <label htmlFor={id} className={ui.label}>
        {label}
      </label>
      {children({
        id,
        onBlur: () => setTouched(true),
        "aria-invalid": !!shown,
        "aria-describedby": shown || helper ? `${id}-note` : undefined,
        className: `${ui.input} ${shown ? "border-danger-400 focus:border-danger-500 focus:ring-danger-500/15" : ""}`,
      })}
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
