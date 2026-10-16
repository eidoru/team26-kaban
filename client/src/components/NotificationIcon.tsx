import {
  Ban,
  Bell,
  CalendarClock,
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
