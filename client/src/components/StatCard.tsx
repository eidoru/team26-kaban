export type StatCardTone = "neutral" | "success" | "warning" | "danger";
export type StatCardIconName = "clock" | "alert" | "wallet" | "users" | "check";

const statCardAccent: Record<StatCardTone, string> = {
  neutral: "border-l-gray-200",
  success: "border-l-emerald-200",
  warning: "border-l-amber-200",
  danger: "border-l-red-200",
};

const statCardIconWrap: Record<StatCardTone, string> = {
  neutral: "bg-slate-100 text-slate-600",
  success: "bg-emerald-50 text-emerald-800",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
};

export function StatCardIcon({ name }: { name: StatCardIconName }) {
  const className = "h-4 w-4";
  switch (name) {
    case "clock":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path strokeLinecap="round" d="M12 7v5l3 2" />
        </svg>
      );
    case "alert":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
      );
    case "wallet":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 7h18v10H3V7zm14 0V5a2 2 0 00-2-2H5a2 2 0 00-2 2v2m16 4h-4" />
        </svg>
      );
    case "users":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 11a3 3 0 100-6 3 3 0 000 6zM8 13a3 3 0 100-6 3 3 0 000 6zm-2 8a5 5 0 0110 0" />
        </svg>
      );
    case "check":
      return (
        <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      );
  }
}

/** Shared metric tile: label, big value, optional hint, tone-colored accent and icon. */
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
  return (
    <div
      className={`rounded-2xl border border-gray-100 border-l-[3px] bg-white p-4 shadow-card ${statCardAccent[tone]}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-medium tracking-tight text-slate-900">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
        {icon && (
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${statCardIconWrap[tone]}`}
            aria-hidden
          >
            <StatCardIcon name={icon} />
          </span>
        )}
      </div>
    </div>
  );
}
