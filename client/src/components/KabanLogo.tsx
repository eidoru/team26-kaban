import { Link } from "react-router-dom";

const SIZES = {
  md: { text: "text-xl", dot: "h-2.5 w-2.5" },
  lg: { text: "text-2xl", dot: "h-3 w-3" },
} as const;

export function KabanLogo({
  to = "/",
  size = "md",
  inverted = false,
}: {
  to?: string;
  size?: keyof typeof SIZES;
  inverted?: boolean;
}) {
  const s = SIZES[size];
  return (
    <Link
      to={to}
      className={`font-heading inline-flex shrink-0 items-center gap-2 font-bold tracking-tight ${s.text} ${
        inverted ? "text-white" : "text-brand-700"
      }`}
    >
      <span aria-hidden className="flex items-center gap-0.5">
        <span className={`${s.dot} rounded-full bg-sun-300`} />
        <span className={`${s.dot} rounded-full ${inverted ? "bg-brand-300" : "bg-brand-400"}`} />
      </span>
      Kaban
    </Link>
  );
}
