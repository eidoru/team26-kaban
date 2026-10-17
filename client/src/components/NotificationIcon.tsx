import {
  ArrowLeftRight,
  Ban,
  BadgeCheck,
  Banknote,
  Bell,
  BellRing,
  CalendarClock,
  CircleX,
  HandCoins,
  Scale,
  ShieldCheck,
  PencilLine,
  Rocket,
  UserCheck,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";

/** Icons by notification kind (server/src/services/notifications.ts). Unknown kinds get a bell. */
const KINDS: Record<string, { icon: LucideIcon; tone: string }> = {
  "group.edited": { icon: PencilLine, tone: "bg-sun-100 text-sun-800" },
  "group.cancelled": { icon: Ban, tone: "bg-ink-100 text-ink-600" },
  "group.launched": { icon: Rocket, tone: "bg-brand-100 text-brand-700" },
  "period.opened": { icon: CalendarClock, tone: "bg-brand-100 text-brand-700" },
  "member.joined": { icon: UserPlus, tone: "bg-brand-100 text-brand-700" },
  "member.left": { icon: UserMinus, tone: "bg-ink-100 text-ink-600" },
  "member.kicked": { icon: UserMinus, tone: "bg-ink-100 text-ink-600" },
  "placeholder.claimed": { icon: UserCheck, tone: "bg-sky-100 text-sky-800" },
  "group.completed": { icon: BadgeCheck, tone: "bg-brand-100 text-brand-700" },
  "submission.pending": { icon: HandCoins, tone: "bg-sun-100 text-sun-800" },
  "submission.approved": { icon: BadgeCheck, tone: "bg-brand-100 text-brand-700" },
  "submission.denied": { icon: CircleX, tone: "bg-danger-50 text-danger-700" },
  "payout.ready": { icon: Banknote, tone: "bg-sun-100 text-sun-800" },
  "payout.handed_over": { icon: Banknote, tone: "bg-sun-100 text-sun-800" },
  "debt.created": { icon: Scale, tone: "bg-danger-50 text-danger-700" },
  "debt.interest": { icon: Scale, tone: "bg-danger-50 text-danger-700" },
  "dispute.raised": { icon: ShieldCheck, tone: "bg-sky-100 text-sky-800" },
  "dispute.approved": { icon: ShieldCheck, tone: "bg-brand-100 text-brand-700" },
  "dispute.denied": { icon: ShieldCheck, tone: "bg-danger-50 text-danger-700" },
  "dispute.expired": { icon: ShieldCheck, tone: "bg-ink-100 text-ink-600" },
  "swap.requested": { icon: ArrowLeftRight, tone: "bg-sun-100 text-sun-800" },
  "swap.awaiting_approval": { icon: ArrowLeftRight, tone: "bg-sun-100 text-sun-800" },
  "swap.approved": { icon: ArrowLeftRight, tone: "bg-brand-100 text-brand-700" },
  "swap.declined": { icon: ArrowLeftRight, tone: "bg-ink-100 text-ink-600" },
  "swap.denied": { icon: ArrowLeftRight, tone: "bg-ink-100 text-ink-600" },
  "swap.expired": { icon: ArrowLeftRight, tone: "bg-ink-100 text-ink-600" },
  "reminder.due": { icon: BellRing, tone: "bg-sun-100 text-sun-800" },
  "reminder.payout_day": { icon: BellRing, tone: "bg-danger-50 text-danger-700" },
  "reminder.manual": { icon: BellRing, tone: "bg-sun-100 text-sun-800" },
};

const FALLBACK = { icon: Bell, tone: "bg-ink-100 text-ink-600" };

const SIZES = {
  sm: { box: "h-8 w-8", icon: "h-4 w-4" },
  md: { box: "h-10 w-10", icon: "h-5 w-5" },
  // Small on phones, regular from sm up.
  responsive: { box: "h-8 w-8 sm:h-10 sm:w-10", icon: "h-4 w-4 sm:h-5 sm:w-5" },
} as const;

export function NotificationIcon({ kind, size = "md" }: { kind: string; size?: keyof typeof SIZES }) {
  const { icon: Icon, tone } = KINDS[kind] ?? FALLBACK;
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full ${tone} ${SIZES[size].box}`}>
      <Icon className={SIZES[size].icon} />
    </span>
  );
}
