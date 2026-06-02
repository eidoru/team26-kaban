import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { prefetchHomeData } from "../lib/homeQueries";
import { ui } from "../lib/ui";
import { resolvePendingInvite } from "./InvitePages";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      prefetchHomeData();
      const handled = await resolvePendingInvite(navigate);
      if (!handled) navigate("/home");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-50 to-slate-50 px-4 py-10">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center">
        <div className="mb-8 text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight text-emerald-900">
            Kaban
          </Link>
          <p className={`mt-3 text-sm ${ui.muted}`}>Sign in to your account</p>
        </div>

        <div className={ui.cardCompact}>
          <form onSubmit={handleSubmit} className={ui.formStack}>
            {error && (
              <p className={ui.error} role="alert">
                {error}
              </p>
            )}

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
              <label htmlFor="password" className={ui.label}>
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={ui.input}
              />
            </div>

            <button type="submit" disabled={submitting} className={ui.btnPrimaryFull}>
              {submitting ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>

        <p className={`mt-6 text-center text-sm ${ui.muted}`}>
          No account?{" "}
          <Link to="/register" className={ui.link}>
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
