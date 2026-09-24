/** Ring spinner: green arc chased by a short sun arc. Mirrored in index.html's pre-JS splash. */
export function Spinner({ className = "h-11 w-11" }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" className={`animate-spin ${className}`} aria-hidden focusable="false">
      <circle cx="22" cy="22" r="18" fill="none" strokeWidth="4" stroke="var(--color-ink-200)" />
      <circle
        cx="22"
        cy="22"
        r="18"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        stroke="var(--color-brand-600)"
        strokeDasharray="40 113"
      />
      <circle
        cx="22"
        cy="22"
        r="18"
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        stroke="var(--color-sun-300)"
        strokeDasharray="12 113"
        strokeDashoffset="-50"
      />
    </svg>
  );
}

/** Full-screen app-start state (auth check, lazy page chunks). */
export function Splash() {
  return (
    <div role="status" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-cream">
      <span className="font-heading flex items-center gap-2 text-2xl font-bold tracking-tight text-brand-700">
        <span aria-hidden className="flex items-center gap-0.5">
          <span className="h-3 w-3 rounded-full bg-sun-300" />
          <span className="h-3 w-3 rounded-full bg-brand-400" />
        </span>
        Kaban
      </span>
      <Spinner />
      <span className="sr-only">Loading</span>
    </div>
  );
}
