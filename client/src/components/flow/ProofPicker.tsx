import { useEffect, useId, useMemo } from "react";
import { Camera, X } from "lucide-react";
import { proofFileError } from "../../lib/proofUpload";
import { ui } from "../../lib/ui";

/**
 * One required proof photo, previewed before it's sent. The parent uploads `file` when it submits
 * (lib/proofUpload). `onError` gets the reason a chosen file can't be used.
 */
export function ProofPicker({
  file,
  onChange,
  onError,
  prompt,
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  onError: (message: string) => void;
  prompt: string;
}) {
  const fileId = useId();
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div>
      <span className={ui.label}>Proof</span>
      {file && preview ? (
        <div className="relative overflow-hidden rounded-2xl border-2 border-ink-200 bg-ink-50">
          <img src={preview} alt="Proof to attach" className="max-h-64 w-full object-contain" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label="Remove photo"
            className="absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full bg-white/90 text-ink-700 shadow-card"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
      ) : (
        <label
          htmlFor={fileId}
          className="flex min-h-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-ink-300 bg-white px-4 py-4 text-center text-sm font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-500/20"
        >
          <Camera className="h-5 w-5" aria-hidden />
          {prompt}
          <input
            id={fileId}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => {
              const chosen = e.target.files?.[0];
              e.target.value = "";
              if (!chosen) return;
              const problem = proofFileError(chosen);
              if (problem) onError(problem);
              else onChange(chosen);
            }}
          />
        </label>
      )}
    </div>
  );
}
