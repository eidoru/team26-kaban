/** Inline message under a form field; pair the input with aria-invalid and aria-describedby={id}. */
export function FieldError({ id, message }: { id: string; message?: string | null }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-xs font-normal text-danger-600" role="alert">
      {message}
    </p>
  );
}
