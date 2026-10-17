import type { ReactNode } from "react";
import { CircleCheck } from "lucide-react";
import { ui } from "../../lib/ui";
import { Sheet } from "./Sheet";

/**
 * What a sheet shows once its action worked, in place of closing on the spot: a check that pops in,
 * what happened (`title`) and what comes next (`children`), then Done. The page behind has already
 * changed; this makes the change something the viewer sees happen. `another` offers to do it again.
 */
export function SheetDone({
  title,
  children,
  onClose,
  another,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  another?: { label: string; onClick: () => void };
}) {
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      footer={
        another ? (
          <div className="flex gap-2">
            <button type="button" onClick={another.onClick} className={`${ui.btnSecondary} min-h-11 flex-1`}>
              {another.label}
            </button>
            <button type="button" onClick={onClose} className={`${ui.btnPrimary} min-h-11 flex-1`}>
              Done
            </button>
          </div>
        ) : (
          <button type="button" onClick={onClose} className={`${ui.btnPrimaryFull} min-h-11`} autoFocus>
            Done
          </button>
        )
      }
    >
      <div className="animate-slide-in flex flex-col items-center gap-3 py-4 text-center" role="status">
        <span className="animate-pop flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <CircleCheck className="h-9 w-9" aria-hidden />
        </span>
        <p className="max-w-sm text-sm text-ink-600">{children}</p>
      </div>
    </Sheet>
  );
}
