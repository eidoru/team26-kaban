import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { prefetchHomeData } from "../lib/homeQueries";
import { ui } from "../lib/ui";
import { AuthShell } from "../components/AuthShell";
import { resolvePendingInvite } from "../lib/pendingInvite";

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
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to check on your paluwagan."
      footer={
        <>
          No account yet?{" "}
          <Link to="/register" className={ui.link}>
            Create one
          </Link>
        </>
      }
    >
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
    </AuthShell>
  );
}
