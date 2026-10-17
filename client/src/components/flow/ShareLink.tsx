import { Check, Copy, Share2 } from "lucide-react";
import { useEffect, useState } from "react";
import { ui } from "../../lib/ui";

/**
 * A link to hand to someone: the URL, a Copy button, and the phone's share sheet where there is
 * one (most people send these through Messenger or Viber).
 */
export function ShareLink({ url, shareText }: { url: string; shareText: string }) {
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard blocked: the URL is selectable in the field.
    }
  }

  return (
    <div className="space-y-2">
      <input
        readOnly
        value={url}
        aria-label="Link"
        onFocus={(e) => e.target.select()}
        className="w-full truncate rounded-2xl border-2 border-ink-200 bg-ink-50 px-4 py-2.5 font-mono text-xs text-ink-700"
      />
      <div className="flex gap-2">
        <button type="button" onClick={() => void copy()} className={`${ui.btnSecondary} min-h-11 flex-1`}>
          {copied ? <Check className="h-4 w-4 text-brand-600" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          <span aria-live="polite">{copied ? "Copied" : "Copy link"}</span>
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => void navigator.share({ text: shareText, url }).catch(() => undefined)}
            className={`${ui.btnPrimary} min-h-11 flex-1`}
          >
            <Share2 className="h-4 w-4" aria-hidden />
            Share
          </button>
        )}
      </div>
    </div>
  );
}
