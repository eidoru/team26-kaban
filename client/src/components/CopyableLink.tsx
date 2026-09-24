import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { ui } from "../lib/ui";

type CopyableLinkProps = {
  url: string;
  label?: string;
  compact?: boolean;
};

export function CopyableLink({ url, label = "Link", compact = false }: CopyableLinkProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable; input remains selectable.
    }
  }

  const inputClassName = compact
    ? "min-w-0 flex-1 truncate rounded-full border-2 border-ink-200 bg-ink-50 px-3 py-1.5 text-xs text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15"
    : "min-w-0 flex-1 truncate rounded-full border-2 border-ink-200 bg-white px-4 py-2 text-sm text-ink-700 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15";

  const buttonClassName = compact
    ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-brand-700 px-3.5 py-1.5 text-xs font-bold text-white transition-colors hover:bg-brand-600"
    : `${ui.btnPrimarySm} shrink-0 sm:min-w-[6.5rem]`;

  return (
    <div className={compact ? "w-full" : "rounded-3xl border border-brand-200 bg-brand-50 p-4"}>
      {!compact && <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-800">{label}</p>}
      <div className={`flex gap-2 ${compact ? "" : "flex-col sm:flex-row sm:items-center"}`}>
        <input
          type="text"
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          onClick={(e) => e.currentTarget.select()}
          className={inputClassName}
          aria-label={label}
        />
        <button type="button" onClick={() => void handleCopy()} className={buttonClassName}>
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
