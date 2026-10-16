const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-full text-sm font-bold transition-all disabled:cursor-not-allowed disabled:opacity-50";
// Primary buttons sit on a darker "lip" that presses flat on click.
const btnPrimaryBase = `${btnBase} bg-brand-700 text-white shadow-press hover:bg-brand-600 active:translate-y-[2px] active:shadow-none disabled:translate-y-0 disabled:shadow-press`;
const btnSecondaryBase = `${btnBase} border-2 border-ink-200 bg-white text-ink-700 hover:border-brand-200 hover:bg-brand-50`;
const inputBase =
  "rounded-2xl border-2 border-ink-200 bg-white px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 transition-colors focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15";
const badgeBase = "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold";

export const ui = {
  page: "max-w-5xl",
  pageTitle: "font-heading text-3xl font-bold tracking-tight text-ink-900 text-balance",
  pageSubtitle: "mt-2 text-base text-ink-600",
  sectionHeading: "font-heading text-lg font-semibold text-ink-900",
  card: "rounded-3xl border border-ink-200 bg-white p-8 shadow-card",
  cardCompact: "rounded-3xl border border-ink-200 bg-white p-6 shadow-card",
  emptyState: "rounded-3xl border-2 border-dashed border-ink-300 bg-ink-50 p-10 text-center",
  label: "mb-1.5 block text-sm font-semibold text-ink-600",
  input: `w-full ${inputBase}`,
  helperText: "mt-2 text-xs text-ink-500",
  money: "tabular-nums",
  btnPrimary: `${btnPrimaryBase} px-7 py-2.5`,
  btnPrimarySm: `${btnPrimaryBase} px-4 py-2`,
  btnPrimaryFull: `${btnPrimaryBase} w-full py-2.5`,
  btnSecondary: `${btnSecondaryBase} px-5 py-2`,
  btnSecondarySm: `${btnSecondaryBase} px-4 py-1.5`,
  btnSecondaryFull: `${btnSecondaryBase} w-full py-2`,
  btnGhost: `${btnBase} px-3 py-1.5 font-semibold text-ink-600 hover:bg-ink-100`,
  btnDangerGhost:
    "rounded-full px-2 py-1 text-sm font-semibold text-danger-700 transition-colors hover:bg-danger-50 disabled:opacity-50",
  error: "rounded-2xl bg-danger-50 px-4 py-3 text-sm font-semibold text-danger-700",
  success: "rounded-2xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-800",
  warning: "rounded-2xl bg-warn-50 px-4 py-3 text-sm font-semibold text-warn-700",
  badgeActive: `${badgeBase} bg-brand-100 text-brand-700`,
  badgeTurn: `${badgeBase} bg-sun-100 text-sun-800`,
  link: "text-sm font-semibold text-brand-700 underline-offset-2 hover:text-brand-900 hover:underline",
  muted: "text-ink-500",
  skeleton: "animate-pulse rounded-2xl bg-ink-100",
  formStack: "space-y-6",
  sectionCard: "rounded-3xl border border-ink-200 bg-white p-6 shadow-card",
  sectionSubtitle: "mt-0.5 text-sm text-ink-500",
  toggleTrack: "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors",
  toggleTrackOn: "bg-brand-600",
  toggleTrackOff: "bg-ink-300",
  toggleThumb: "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform",
} as const;

export function navLinkClass(active: boolean): string {
  const base = "inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-bold transition-colors";
  return active ? `${base} bg-brand-100 text-brand-800` : `${base} text-ink-600 hover:bg-ink-100 hover:text-ink-900`;
}
