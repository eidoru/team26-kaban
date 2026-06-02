export const ui = {
  avatarInitials:
    "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-900 text-lg font-medium text-white",
  avatarInitialsSm:
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-900 text-xs font-medium text-white",
  page: "max-w-5xl",
  backLink:
    "group mb-8 flex items-center gap-2 text-sm font-normal text-emerald-700 transition-colors hover:text-emerald-900",
  backLinkArrow: "transition-transform group-hover:-translate-x-1",
  pageTitle: "text-3xl font-medium tracking-tight text-slate-900",
  pageSubtitle: "mt-2 text-base text-slate-600",
  sectionTitle: "mb-4 text-sm font-medium text-slate-900",
  sectionHeading: "text-base font-medium text-slate-900",
  card: "rounded-2xl border border-gray-100 bg-white p-8 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.03)]",
  cardCompact: "rounded-2xl border border-gray-100 bg-white p-6 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.03)]",
  cardFlat: "rounded-2xl border border-gray-100 bg-white p-4",
  callout: "rounded-2xl border border-emerald-100 bg-emerald-50 p-8",
  emptyState: "rounded-2xl border border-dashed border-gray-200 bg-white p-10 text-center",
  label: "mb-1.5 block text-sm font-normal text-slate-500",
  input:
    "w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm placeholder:text-gray-300 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20",
  inputInline:
    "rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20",
  select:
    "appearance-none rounded-xl border border-gray-200 bg-white py-2.5 pl-4 pr-10 text-sm shadow-sm focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20",
  helperText: "mt-2 text-xs font-normal text-slate-500",
  btnPrimary:
    "rounded-xl bg-emerald-900 px-8 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-950 active:scale-[0.98] disabled:opacity-60",
  btnPrimarySm:
    "rounded-xl bg-emerald-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-950 disabled:opacity-60",
  btnPrimaryFull:
    "flex w-full items-center justify-center rounded-xl bg-emerald-900 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-emerald-950 active:scale-[0.98] disabled:opacity-60",
  btnSecondary:
    "rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-normal text-slate-600 transition-all hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-60",
  btnSecondarySm:
    "rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-normal text-slate-600 transition-all hover:border-emerald-200 hover:bg-emerald-50 disabled:opacity-60",
  btnSecondaryFull:
    "flex w-full items-center justify-center rounded-xl border border-gray-200 bg-white py-2.5 text-sm font-normal text-slate-600 transition-all hover:border-emerald-200 hover:bg-emerald-50",
  btnOutline:
    "rounded-xl border border-emerald-900 px-6 py-2.5 text-sm font-normal text-emerald-900 transition-all hover:bg-emerald-900 hover:text-white disabled:opacity-60",
  btnGhost:
    "rounded-xl border border-gray-200 px-3 py-1.5 text-sm font-normal text-slate-600 transition-all hover:bg-gray-50 disabled:opacity-60",
  btnDangerGhost: "text-sm font-normal text-red-600 hover:text-red-800 disabled:opacity-50",
  error: "rounded-xl bg-red-50 px-4 py-2.5 text-sm font-normal text-red-700",
  success: "rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-normal text-emerald-800",
  warning: "rounded-xl bg-orange-50 px-4 py-2.5 text-sm font-normal text-orange-700",
  listItem:
    "block rounded-2xl border border-gray-100 bg-white p-4 shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.03)] transition-colors hover:border-emerald-200",
  listItemMuted: "block rounded-2xl border border-gray-100 bg-white p-4 opacity-80 transition-colors hover:border-gray-200",
  badgeForming: "rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-normal text-orange-700",
  badgeActive: "rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-xs font-normal text-emerald-700",
  badgeCompleted: "rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-normal text-slate-600",
  link: "text-sm font-normal text-emerald-700 hover:text-emerald-900",
  muted: "text-slate-500",
  stack: "space-y-8",
  formStack: "space-y-6",
  tableWrap: "mt-3 overflow-x-auto rounded-2xl border border-gray-100 bg-white",
  tableHead: "border-b border-gray-100 bg-gray-50 text-left text-sm font-normal text-slate-500",
  tableRow: "border-b border-gray-50 last:border-0",
} as const;

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return ui.badgeActive;
    case "completed":
      return ui.badgeCompleted;
    default:
      return ui.badgeForming;
  }
}

export function navLinkClass(active: boolean): string {
  const base = "inline-flex h-10 items-center rounded-xl px-3 font-bold";
  return active
    ? `${base} bg-emerald-50 text-emerald-900`
    : `${base} text-slate-500 transition-colors hover:text-slate-700`;
}

export function pillButtonClass(selected: boolean): string {
  return selected
    ? "rounded-xl bg-emerald-900 px-4 py-2.5 text-sm font-normal text-white shadow-sm"
    : "rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-normal text-slate-600 transition-all hover:border-emerald-200 hover:bg-emerald-50";
}
