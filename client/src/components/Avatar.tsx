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
  className = "",
}: {
  name: string | null | undefined;
  size?: keyof typeof SIZES;
  shape?: "circle" | "tile";
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center font-bold ${SIZES[size]} ${
        shape === "circle" ? "rounded-full" : "rounded-2xl font-heading"
      } ${avatarTone(name)} ${className}`}
    >
      {displayInitials(name)}
    </span>
  );
}
