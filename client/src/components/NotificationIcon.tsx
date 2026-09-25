import {
  BadgeCheck,
  Bell,
  CircleCheck,
  Clock,
  HandCoins,
  TriangleAlert,
  UserCheck,
  UserMinus,
  type LucideIcon,
} from "lucide-react";

const KINDS: Record<string, { icon: LucideIcon; tone: string }> = {
  member_left: { icon: UserMinus, tone: "bg-ink-100 text-ink-600" },
  chair_claimed: { icon: UserCheck, tone: "bg-sky-100 text-sky-800" },
  contribution_confirmed: { icon: BadgeCheck, tone: "bg-brand-100 text-brand-700" },
  contribution_due: { icon: Clock, tone: "bg-warn-50 text-warn-700" },
  turn_to_receive: { icon: HandCoins, tone: "bg-sun-100 text-sun-800" },
  dispute_raised: { icon: TriangleAlert, tone: "bg-danger-50 text-danger-600" },
  dispute_resolved: { icon: CircleCheck, tone: "bg-brand-100 text-brand-700" },
};

const FALLBACK = { icon: Bell, tone: "bg-ink-100 text-ink-600" };

const SIZES = {
  sm: { box: "h-8 w-8", icon: "h-4 w-4" },
  md: { box: "h-10 w-10", icon: "h-5 w-5" },
  // Small on phones, regular from sm up.
  responsive: { box: "h-8 w-8 sm:h-10 sm:w-10", icon: "h-4 w-4 sm:h-5 sm:w-5" },
} as const;

export function NotificationIcon({ type, size = "md" }: { type: string; size?: keyof typeof SIZES }) {
  const { icon: Icon, tone } = KINDS[type] ?? FALLBACK;
  return (
    <span aria-hidden className={`flex shrink-0 items-center justify-center rounded-full ${tone} ${SIZES[size].box}`}>
      <Icon className={SIZES[size].icon} />
    </span>
  );
}
