import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { prefetchHomeData } from "../lib/homeQueries";
import { ui } from "../lib/ui";
import { AuthShell } from "../components/AuthShell";
import { resolvePendingInvite } from "../lib/pendingInvite";
import { LIMITS, isValidEmail } from "../lib/validation";

type FieldErrors = Partial<Record<"displayName" | "email" | "password", string>>;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-2 text-xs font-normal text-danger-600">
      {message}
    </p>
  );
}

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  function clearFieldError(field: keyof FieldErrors) {
    setFieldErrors((current) => (current[field] ? { ...current, [field]: undefined } : current));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const nextErrors: FieldErrors = {};
    if (!displayName.trim()) nextErrors.displayName = "Enter your name.";
    if (!isValidEmail(email)) nextErrors.email = "Enter a valid email address.";
    if (password.length < 8) nextErrors.password = "Use at least 8 characters.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await register({
        email: email.trim(),
        password,
        displayName: displayName.trim(),
        contact: contact.trim() || undefined,
      });
      prefetchHomeData();
      const handled = await resolvePendingInvite(navigate);
      if (!handled) navigate("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Registration failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthShell
      title="Join the circle"
      subtitle="Create an account to start or join a paluwagan."
      width="md"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className={ui.link}>
            Sign in
          </Link>
        </>
      }
    >
      <div className={ui.cardCompact}>
        <form onSubmit={handleSubmit} className={ui.formStack} noValidate>
          {error && (
            <p className={ui.error} role="alert">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="displayName" className={ui.label}>
              Display name
            </label>
            <input
              id="displayName"
              type="text"
              required
              autoComplete="name"
              maxLength={LIMITS.name}
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                clearFieldError("displayName");
              }}
              className={ui.input}
              aria-invalid={!!fieldErrors.displayName}
              aria-describedby={fieldErrors.displayName ? "displayName-error" : undefined}
            />
            <FieldError id="displayName-error" message={fieldErrors.displayName} />
            {!fieldErrors.displayName && (
              <p className={ui.helperText}>Shown to members in your paluwagan groups.</p>
            )}
          </div>

          <div>
            <label htmlFor="email" className={ui.label}>
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                clearFieldError("email");
              }}
              className={ui.input}
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            <FieldError id="email-error" message={fieldErrors.email} />
          </div>

          <div>
            <label htmlFor="contact" className={ui.label}>
              Contact <span className="text-ink-500">(optional)</span>
            </label>
            <input
              id="contact"
              type="tel"
              autoComplete="tel"
              maxLength={LIMITS.contact}
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="Phone or messenger handle"
              className={ui.input}
            />
            <p className={ui.helperText}>Shared with group managers and members.</p>
          </div>

          <div>
            <label htmlFor="password" className={ui.label}>
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
              className={ui.input}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            <FieldError id="password-error" message={fieldErrors.password} />
            {!fieldErrors.password && <p className={ui.helperText}>At least 8 characters.</p>}
          </div>

          <div>
            <label htmlFor="confirmPassword" className={ui.label}>
              Confirm password
            </label>
            <input
              id="confirmPassword"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={ui.input}
              aria-invalid={confirmPassword.length > 0 && password !== confirmPassword}
            />
            {confirmPassword.length > 0 && password !== confirmPassword && (
              <p className="mt-2 text-xs font-normal text-danger-600">Passwords do not match.</p>
            )}
          </div>

          <button type="submit" disabled={submitting} className={ui.btnPrimaryFull}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
      </div>
    </AuthShell>
  );
}
