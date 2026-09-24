/** Flat brand illustration: an open kaban (chest) with a peso coin. Decorative only. */
export function KabanChest({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 160 110" className={className} aria-hidden focusable="false">
      <ellipse cx="80" cy="100" rx="58" ry="7" fill="var(--color-ink-100)" />
      <rect x="28" y="46" width="104" height="52" rx="12" fill="var(--color-brand-600)" />
      <rect x="28" y="46" width="104" height="14" fill="var(--color-brand-700)" />
      <path d="M28 50c0-18 23-30 52-30s52 12 52 30z" fill="var(--color-brand-500)" />
      <rect x="70" y="52" width="20" height="22" rx="5" fill="var(--color-sun-300)" />
      <circle cx="80" cy="62" r="3" fill="var(--color-sun-800)" />
      <circle cx="122" cy="20" r="9" fill="var(--color-sun-300)" />
      <text
        x="122"
        y="24"
        textAnchor="middle"
        fontSize="11"
        fontWeight="800"
        fill="var(--color-sun-800)"
        fontFamily="Nunito, sans-serif"
      >
        ₱
      </text>
      <circle cx="38" cy="26" r="6" fill="var(--color-sun-200)" />
    </svg>
  );
}
