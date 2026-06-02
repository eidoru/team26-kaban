import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { prefetchHomeData } from "../lib/homeQueries";
import { ui } from "../lib/ui";
import { resolvePendingInvite } from "./InvitePages";

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [contact, setContact] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

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
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50 to-slate-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center">
        <div className="mb-8 text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight text-emerald-900">
            Kaban
          </Link>
          <p className={`mt-3 text-sm ${ui.muted}`}>Create your account</p>
        </div>

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
                maxLength={100}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className={ui.input}
              />
              <p className={ui.helperText}>Shown to members in your paluwagan groups.</p>
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
                onChange={(e) => setEmail(e.target.value)}
                className={ui.input}
              />
            </div>

            <div>
              <label htmlFor="contact" className={ui.label}>
                Contact <span className="text-slate-400">(optional)</span>
              </label>
              <input
                id="contact"
                type="tel"
                autoComplete="tel"
                maxLength={200}
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
                onChange={(e) => setPassword(e.target.value)}
                className={ui.input}
              />
              <p className={ui.helperText}>At least 8 characters.</p>
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
                <p className="mt-2 text-xs font-normal text-red-600">Passwords do not match.</p>
              )}
            </div>

            <button type="submit" disabled={submitting} className={ui.btnPrimaryFull}>
              {submitting ? "Creating account…" : "Create account"}
            </button>
          </form>
        </div>

        <p className={`mt-6 text-center text-sm ${ui.muted}`}>
          Already have an account?{" "}
          <Link to="/login" className={ui.link}>
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
