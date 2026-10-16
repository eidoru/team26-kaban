import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertDialog } from "../components/AlertDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PromptDialog } from "../components/PromptDialog";
import { DialogContext, type AlertOptions, type ConfirmOptions, type PromptOptions } from "./useDialog";

type ActiveDialog =
  | { type: "confirm"; opts: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: "prompt"; opts: PromptOptions; resolve: (value: string | null) => void }
  | { type: "alert"; opts: AlertOptions; resolve: () => void };


export function DialogProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<ActiveDialog | null>(null);

  const close = useCallback(() => {
    setActive(null);
  }, []);

  const confirm = useCallback((opts: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      const entry: ActiveDialog = {
        type: "confirm",
        opts,
        resolve: (value) => {
          resolve(value);
          close();
        },
      };
      setActive(entry);
    });
  }, [close]);

  const prompt = useCallback((opts: PromptOptions) => {
    return new Promise<string | null>((resolve) => {
      const entry: ActiveDialog = {
        type: "prompt",
        opts,
        resolve: (value) => {
          resolve(value);
          close();
        },
      };
      setActive(entry);
    });
  }, [close]);

  const alert = useCallback((opts: AlertOptions) => {
    return new Promise<void>((resolve) => {
      const entry: ActiveDialog = {
        type: "alert",
        opts,
        resolve: () => {
          resolve();
          close();
        },
      };
      setActive(entry);
    });
  }, [close]);

  const value = useMemo(
    () => ({ confirm, prompt, alert }),
    [confirm, prompt, alert],
  );

  return (
    <DialogContext.Provider value={value}>
      {children}
      {active?.type === "confirm" && (
        <ConfirmDialog
          open
          title={active.opts.title}
          description={active.opts.description}
          confirmLabel={active.opts.confirmLabel}
          cancelLabel={active.opts.cancelLabel}
          variant={active.opts.variant}
          onConfirm={() => active.resolve(true)}
          onCancel={() => active.resolve(false)}
        />
      )}
      {active?.type === "prompt" && (
        <PromptDialog
          open
          title={active.opts.title}
          description={active.opts.description}
          label={active.opts.label}
          placeholder={active.opts.placeholder}
          defaultValue={active.opts.defaultValue}
          required={active.opts.required}
          multiline={active.opts.multiline}
          maxLength={active.opts.maxLength}
          inputMode={active.opts.inputMode}
          submitLabel={active.opts.submitLabel}
          cancelLabel={active.opts.cancelLabel}
          validate={active.opts.validate}
          onSubmit={(v) => active.resolve(v)}
          onCancel={() => active.resolve(null)}
        />
      )}
      {active?.type === "alert" && (
        <AlertDialog
          open
          title={active.opts.title}
          description={active.opts.description}
          okLabel={active.opts.okLabel}
          onClose={() => active.resolve()}
        />
      )}
    </DialogContext.Provider>
  );
}

