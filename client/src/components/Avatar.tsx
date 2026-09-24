import { avatarTone } from "../lib/avatar";
import { displayInitials } from "../lib/initials";

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
} as const;

export function Avatar({
  name,
  size = "sm",
  shape = "circle",
  placeholder = false,
  className = "",
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  shape?: "circle" | "tile";
  /** A seat held for someone without an account: dashed outline, like an open seat. */
  placeholder?: boolean;
  className?: string;
}) {
  return (
    <>
      <span
        aria-hidden
        className={`inline-flex shrink-0 items-center justify-center font-bold ${SIZES[size]} ${
          shape === "circle" ? "rounded-full" : "rounded-2xl font-heading"
        } ${
          placeholder ? "border-2 border-dashed border-ink-400 bg-white text-ink-500" : avatarTone(name)
        } ${className}`}
      >
        {displayInitials(name)}
      </span>
      {placeholder && <span className="sr-only">(placeholder)</span>}
    </>
  );
}
