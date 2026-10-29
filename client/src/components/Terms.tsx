import { useId } from "react";

/** A paluwagan's terms (R-SET-07): plain text, one rule per line. */
export function TermsText({ terms }: { terms: string }) {
  return (
    <div className="space-y-2 text-sm text-ink-700">
      {terms.split("\n").map((line, i) => (
        <p key={i}>{line}</p>
      ))}
    </div>
  );
}

/**
 * R-INV-08, R-CLM-07: the terms in a short scroll box and the box to tick. The caller keeps its
 * Join or Claim button disabled until `agreed`.
 */
export function TermsAgreement({
  terms,
  agreed,
  onAgreedChange,
}: {
  terms: string;
  agreed: boolean;
  onAgreedChange: (agreed: boolean) => void;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="space-y-3">
      <h2 id={headingId} className="text-sm font-bold text-ink-900">
        Terms
      </h2>
      {/* Focusable so keyboard users can scroll it. */}
      <div
        tabIndex={0}
        aria-labelledby={headingId}
        className="max-h-44 overflow-y-auto rounded-2xl border border-ink-200 bg-ink-50 p-4"
      >
        <TermsText terms={terms} />
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2.5 text-sm font-semibold text-ink-900">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => onAgreedChange(e.target.checked)}
          className="size-4 cursor-pointer accent-brand-700"
        />
        I agree to the terms
      </label>
    </section>
  );
}
