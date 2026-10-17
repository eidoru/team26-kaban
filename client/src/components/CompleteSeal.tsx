import { Check } from "lucide-react";

const SIZES = {
  sm: { seal: "h-5 w-5", check: "h-3 w-3" },
  lg: { seal: "mt-0.5 h-8 w-8", check: "h-5 w-5" },
};

/** A finished paluwagan's mark: a green check seal beside its name, in place of a "Completed" label. */
export function CompleteSeal({ size }: { size: keyof typeof SIZES }) {
  return (
    <span
      role="img"
      aria-label="Completed"
      title="Completed"
      className={`${SIZES[size].seal} inline-flex shrink-0 items-center justify-center rounded-full bg-brand-600 text-white shadow-press`}
    >
      <Check className={SIZES[size].check} strokeWidth={3} aria-hidden />
    </span>
  );
}
