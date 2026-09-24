import { Check, Clock, TriangleAlert, Users, Wallet, type LucideIcon } from "lucide-react";

export type StatCardTone = "neutral" | "success" | "warning" | "danger";
export type StatCardIconName = "clock" | "alert" | "wallet" | "users" | "check";

const ICONS: Record<StatCardIconName, LucideIcon> = {
  clock: Clock,
  alert: TriangleAlert,
  wallet: Wallet,
  users: Users,
  check: Check,
};

const iconWrap: Record<StatCardTone, string> = {
  neutral: "bg-ink-100 text-ink-600",
  success: "bg-brand-100 text-brand-700",
  warning: "bg-sun-100 text-sun-700",
  danger: "bg-danger-50 text-danger-600",
};

const valueColor: Record<StatCardTone, string> = {
  neutral: "text-ink-900",
  success: "text-brand-700",
  warning: "text-ink-900",
  danger: "text-danger-700",
};

/** Shared metric tile: tone-colored icon, label, big value, optional hint. */
export function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: StatCardTone;
  icon?: StatCardIconName;
}) {
  const Icon = icon ? ICONS[icon] : null;
  return (
    <div className="rounded-3xl border border-ink-200 bg-white p-5 shadow-card">
      {Icon && (
        <span
          className={`mb-3 flex h-9 w-9 items-center justify-center rounded-xl ${iconWrap[tone]}`}
          aria-hidden
        >
          <Icon className="h-[18px] w-[18px]" />
        </span>
      )}
      <p className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`font-heading mt-1 text-2xl font-bold tracking-tight tabular-nums ${valueColor[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-500">{hint}</p>}
    </div>
  );
}
