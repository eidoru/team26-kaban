import type { ReactNode } from "react";
import { HandCoins, ShieldCheck, Users } from "lucide-react";
import { KabanChest } from "./Illustration";
import { KabanLogo } from "./KabanLogo";

const WIDTHS = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-lg" } as const;

const POINTS = [
  { icon: Users, text: "Everyone sees the same roster, schedule and payout order." },
  { icon: HandCoins, text: "Report a payment; your organizer confirms it." },
  { icon: ShieldCheck, text: "Shortfalls are recorded, not forgotten." },
] as const;

/** Split layout for signed-out pages: brand panel on wide screens, centered form everywhere. */
export function AuthShell({
  title,
  subtitle,
  width = "sm",
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  width?: keyof typeof WIDTHS;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-cream">
      <aside className="relative hidden w-[42%] max-w-xl shrink-0 flex-col justify-between overflow-hidden bg-brand-700 p-10 text-white lg:flex">
        <div aria-hidden className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-600" />
        <div aria-hidden className="absolute -bottom-32 -left-20 h-80 w-80 rounded-full bg-brand-800" />
        <div className="relative">
          <KabanLogo inverted size="lg" />
        </div>
        <div className="relative">
          <KabanChest className="mb-8 w-48" />
          <p className="font-heading text-3xl font-bold leading-tight text-balance">
            Your paluwagan, kept straight for everyone.
          </p>
          <ul className="mt-6 space-y-3">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-3 text-sm text-brand-50">
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-brand-100">Kaban records payments. It never holds your money.</p>
      </aside>

      <div className="flex flex-1 flex-col px-4 py-10 sm:px-6">
        <div className={`mx-auto flex w-full ${WIDTHS[width]} flex-1 flex-col justify-center`}>
          <div className="mb-8 lg:hidden">
            <KabanLogo size="lg" />
          </div>
          <h1 className="font-heading text-3xl font-bold tracking-tight text-ink-900 text-balance">{title}</h1>
          {subtitle && <p className="mt-2 text-base text-ink-600">{subtitle}</p>}
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-ink-600">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
