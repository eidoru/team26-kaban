import { type FormEvent, useEffect, useState } from "react";
import { ui } from "../lib/ui";
import { Modal } from "./Modal";

export function PromptDialog({
  open,
  title,
  description,
  label,
  placeholder,
  defaultValue = "",
  required = false,
  multiline = false,
  submitLabel = "Submit",
  cancelLabel = "Cancel",
  validate,
  onSubmit,
  onCancel,
}: {
  open: boolean;
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
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue(defaultValue);
      setError(null);
    }
  }, [open, defaultValue]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (required && !trimmed) {
      setError("This field is required.");
      return;
    }
    if (validate) {
      const validationError = validate(value);
      if (validationError) {
        setError(validationError);
        return;
      }
    }
    onSubmit(value);
  }

  const submitDisabled = required && !value.trim();

  return (
    <Modal open={open} title={title} description={description} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="space-y-4">
        {label && (
          <div>
            <label htmlFor="prompt-dialog-input" className={ui.label}>
              {label}
            </label>
            {multiline ? (
              <textarea
                id="prompt-dialog-input"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder={placeholder}
                rows={4}
                className={`${ui.input} resize-y min-h-[6rem]`}
              />
            ) : (
              <input
                id="prompt-dialog-input"
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder={placeholder}
                className={ui.input}
              />
            )}
          </div>
        )}
        {!label && (
          multiline ? (
            <textarea
              id="prompt-dialog-input"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder={placeholder}
              rows={4}
              className={`${ui.input} resize-y min-h-[6rem]`}
            />
          ) : (
            <input
              id="prompt-dialog-input"
              type="text"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                setError(null);
              }}
              placeholder={placeholder}
              className={ui.input}
            />
          )
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap justify-end gap-3">
          <button type="button" onClick={onCancel} className={ui.btnSecondary}>
            {cancelLabel}
          </button>
          <button type="submit" disabled={submitDisabled} className={ui.btnPrimary}>
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
