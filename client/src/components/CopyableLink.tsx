import { useState } from "react";
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
    ? "min-w-0 flex-1 truncate rounded-lg border border-gray-100 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
    : "min-w-0 flex-1 truncate rounded-lg border border-gray-100 bg-slate-50 px-3 py-2.5 text-sm text-slate-700 focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20";

  const buttonClassName = compact
    ? "shrink-0 rounded-lg bg-emerald-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-950"
    : `${ui.btnPrimarySm} shrink-0 sm:min-w-[6.5rem]`;

  return (
    <div className={compact ? "w-full" : "rounded-xl border border-emerald-200/60 bg-white p-4 shadow-sm"}>
      {!compact && <p className="mb-2 text-xs font-normal text-slate-500">{label}</p>}
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
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}
