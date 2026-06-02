import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertDialog } from "../components/AlertDialog";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { PromptDialog } from "../components/PromptDialog";
import { SettleDebtDialog } from "../components/SettleDebtDialog";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
}

export interface PromptOptions {
  title: string;
  description?: string;
  label?: string;
  placeholder?: string;
  defaultValue?: string;
  required?: boolean;
  multiline?: boolean;
  submitLabel?: string;
  cancelLabel?: string;
  validate?: (value: string) => string | null;
}

export interface AlertOptions {
  title: string;
  description?: string;
  okLabel?: string;
}

export interface SettleDebtOptions {
  title: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
  alert: (opts: AlertOptions) => Promise<void>;
  settleDebt: (opts: SettleDebtOptions) => Promise<{ amount: number; note?: string } | null>;
}

type ActiveDialog =
  | { type: "confirm"; opts: ConfirmOptions; resolve: (value: boolean) => void }
  | { type: "prompt"; opts: PromptOptions; resolve: (value: string | null) => void }
  | { type: "alert"; opts: AlertOptions; resolve: () => void }
  | {
      type: "settle-debt";
      opts: SettleDebtOptions;
      resolve: (value: { amount: number; note?: string } | null) => void;
    };

const DialogContext = createContext<DialogContextValue | null>(null);

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

  const settleDebt = useCallback((opts: SettleDebtOptions) => {
    return new Promise<{ amount: number; note?: string } | null>((resolve) => {
      const entry: ActiveDialog = {
        type: "settle-debt",
        opts,
        resolve: (value) => {
          resolve(value);
          close();
        },
      };
      setActive(entry);
    });
  }, [close]);

  const value = useMemo(
    () => ({ confirm, prompt, alert, settleDebt }),
    [confirm, prompt, alert, settleDebt],
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
      {active?.type === "settle-debt" && (
        <SettleDebtDialog
          open
          title={active.opts.title}
          description={active.opts.description}
          submitLabel={active.opts.submitLabel}
          cancelLabel={active.opts.cancelLabel}
          onSubmit={(result) => active.resolve(result)}
          onCancel={() => active.resolve(null)}
        />
      )}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error("useDialog must be used within DialogProvider");
  return ctx;
}
