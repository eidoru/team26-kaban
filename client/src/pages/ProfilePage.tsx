import { type FormEvent, type ReactNode, useId, useState } from "react";
import { api, ApiError, patchSession, storeAuth } from "../api/client";
import { useAuth } from "../context/useAuth";
import { Avatar } from "../components/Avatar";
import { ToggleSwitch } from "../components/ToggleSwitch";
import { demoToolsAvailable, useDemoToolsSetting } from "../lib/devTools";
import { ui } from "../lib/ui";
import { LIMITS, isValidEmail } from "../lib/validation";

function FormAlerts({ success, error }: { success?: string; error?: string }) {
  if (!success && !error) return null;
  return (
    <div className="space-y-3">
      {success && <p className={ui.success}>{success}</p>}
      {error && <p className={ui.error}>{error}</p>}
    </div>
  );
}

function SecurityRow({
  title,
  value,
  open,
  onToggle,
  panelId,
  children,
}: {
  title: string;
  value: string;
  open: boolean;
  onToggle: () => void;
  panelId: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-3xl border transition-colors ${open ? "border-brand-200 bg-brand-50/60" : "border-ink-200 bg-white"}`}>
      <div className="relative p-4 pr-[8.5rem] sm:p-5">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink-900">{title}</p>
          <p className="mt-0.5 truncate text-sm text-ink-600">{value}</p>
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className={`absolute right-4 top-4 inline-flex h-10 w-[6.5rem] items-center justify-center rounded-full border-2 text-sm font-bold transition-colors sm:right-5 sm:top-5 ${
            open
              ? "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              : "border-brand-700 text-brand-700 hover:bg-brand-700 hover:text-white"
          }`}
        >
          {open ? "Cancel" : "Change"}
        </button>
      </div>
      {open && (
        <div id={panelId} className="border-t border-brand-100 px-4 pb-5 pt-4 sm:px-5">
          {children}
        </div>
      )}
    </div>
  );
}

export function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [demoToolsOn, setDemoToolsOn] = useDemoToolsSetting();
  const emailPanelId = useId();
  const passwordPanelId = useId();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [contact, setContact] = useState(user?.contact ?? "");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileSubmitting, setProfileSubmitting] = useState(false);

  const [emailOpen, setEmailOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [emailCurrentPassword, setEmailCurrentPassword] = useState("");
  const [emailMessage, setEmailMessage] = useState("");
  const [emailError, setEmailError] = useState("");
  const [emailSubmitting, setEmailSubmitting] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);


  function resetEmailForm() {
    setEmailMessage("");
    setEmailError("");
    setNewEmail("");
    setEmailCurrentPassword("");
  }

  function resetPasswordForm() {
    setPasswordMessage("");
    setPasswordError("");
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  function toggleEmailOpen() {
    setEmailOpen((open) => {
      if (open) resetEmailForm();
      return !open;
    });
  }

  function togglePasswordOpen() {
    setPasswordOpen((open) => {
      if (open) resetPasswordForm();
      return !open;
    });
  }

  async function handleProfileSubmit(e: FormEvent) {
    e.preventDefault();
    setProfileMessage("");
    setProfileError("");
    if (!displayName.trim()) {
      setProfileError("Enter a display name.");
      return;
    }
    setProfileSubmitting(true);
    try {
      await api.updateProfile({
        displayName: displayName.trim(),
        contact: contact.trim() || null,
      });
      await refreshUser();
      setProfileMessage("Profile updated.");
    } catch (err) {
      setProfileError(err instanceof ApiError ? err.message : "Update failed");
    } finally {
      setProfileSubmitting(false);
    }
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    setEmailMessage("");
    setEmailError("");

    const trimmed = newEmail.trim();
    if (!trimmed) {
      setEmailError("Enter a new email address.");
      return;
    }
    if (!isValidEmail(trimmed)) {
      setEmailError("Enter a valid email address.");
      return;
    }
    if (trimmed.toLowerCase() === user?.email.toLowerCase()) {
      setEmailError("New email must be different from your current email.");
      return;
    }

    setEmailSubmitting(true);
    try {
      const { user: updated, accessToken } = await api.changeEmail({
        currentPassword: emailCurrentPassword,
        newEmail: trimmed,
      });
      patchSession(updated, accessToken);
      await refreshUser();
      setNewEmail("");
      setEmailCurrentPassword("");
      setEmailMessage("Email updated.");
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.message : "Email update failed");
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handlePasswordSubmit(e: FormEvent) {
    e.preventDefault();
    setPasswordMessage("");
    setPasswordError("");

    if (newPassword !== confirmPassword) {
      setPasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters.");
      return;
    }

    setPasswordSubmitting(true);
    try {
      const data = await api.changePassword({
        currentPassword,
        newPassword,
      });
      storeAuth(data);
      await refreshUser();
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordMessage("Password updated. Other sessions have been signed out.");
    } catch (err) {
      setPasswordError(err instanceof ApiError ? err.message : "Password update failed");
    } finally {
      setPasswordSubmitting(false);
    }
  }

  return (
    <div className={`${ui.page} space-y-8`}>
      <h1 className={ui.pageTitle}>Profile</h1>

      <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card">
        <div className="relative overflow-hidden bg-brand-700 p-6 text-white sm:p-8">
          <div aria-hidden className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-brand-600" />
          <div className="relative flex items-center gap-4">
            <Avatar name={user?.displayName} size="lg" className="ring-4 ring-white/30" />
            <div className="min-w-0">
              <p className="font-heading truncate text-2xl font-bold">{user?.displayName}</p>
              <p className="truncate text-sm text-brand-50">{user?.email}</p>
              <p className="mt-0.5 truncate text-sm text-brand-100">{user?.contact || "No contact added"}</p>
            </div>
          </div>
        </div>

        <div className="p-6 sm:p-8">
          <form onSubmit={handleProfileSubmit} className={ui.formStack}>
            <FormAlerts success={profileMessage} error={profileError} />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <label htmlFor="displayName" className={ui.label}>
                  Display name
                </label>
                <input
                  id="displayName"
                  type="text"
                  required
                  maxLength={LIMITS.name}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className={ui.input}
                />
              </div>
              <div>
                <label htmlFor="contact" className={ui.label}>
                  Contact <span className="text-ink-500">(optional)</span>
                </label>
                <input
                  id="contact"
                  type="text"
                  maxLength={LIMITS.contact}
                  value={contact}
                  onChange={(e) => setContact(e.target.value)}
                  placeholder="Phone or messenger handle"
                  className={ui.input}
                />
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <button type="submit" disabled={profileSubmitting} className={ui.btnPrimary}>
                {profileSubmitting ? "Saving…" : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      </div>

      <section>
        <h2 className={`${ui.sectionHeading} mb-4`}>Account security</h2>

        <div className="space-y-3">
          <SecurityRow
            title="Email address"
            value={user?.email ?? "…"}
            open={emailOpen}
            onToggle={toggleEmailOpen}
            panelId={emailPanelId}
          >
            <form onSubmit={handleEmailSubmit} className={ui.formStack}>
              <FormAlerts success={emailMessage} error={emailError} />
              <div>
                <label htmlFor="newEmail" className={ui.label}>
                  New email
                </label>
                <input
                  id="newEmail"
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={ui.input}
                />
              </div>
              <div>
                <label htmlFor="emailCurrentPassword" className={ui.label}>
                  Current password
                </label>
                <input
                  id="emailCurrentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={emailCurrentPassword}
                  onChange={(e) => setEmailCurrentPassword(e.target.value)}
                  className={ui.input}
                />
              </div>
              <div className="flex justify-end pt-1">
                <button type="submit" disabled={emailSubmitting} className={ui.btnPrimarySm}>
                  {emailSubmitting ? "Updating…" : "Update email"}
                </button>
              </div>
            </form>
          </SecurityRow>

          <SecurityRow
            title="Password"
            value="••••••••"
            open={passwordOpen}
            onToggle={togglePasswordOpen}
            panelId={passwordPanelId}
          >
            <form onSubmit={handlePasswordSubmit} className={ui.formStack}>
              <FormAlerts success={passwordMessage} error={passwordError} />
              <div>
                <label htmlFor="currentPassword" className={ui.label}>
                  Current password
                </label>
                <input
                  id="currentPassword"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className={ui.input}
                />
              </div>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div>
                  <label htmlFor="newPassword" className={ui.label}>
                    New password
                  </label>
                  <input
                    id="newPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className={ui.input}
                  />
                  <p className={ui.helperText}>At least 8 characters.</p>
                </div>
                <div>
                  <label htmlFor="confirmPassword" className={ui.label}>
                    Confirm new password
                  </label>
                  <input
                    id="confirmPassword"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={ui.input}
                    aria-invalid={confirmPassword.length > 0 && newPassword !== confirmPassword}
                  />
                  {confirmPassword.length > 0 && newPassword !== confirmPassword && (
                    <p className="mt-2 text-xs font-normal text-danger-600">Passwords do not match.</p>
                  )}
                </div>
              </div>
              <div className="flex justify-end pt-1">
                <button type="submit" disabled={passwordSubmitting} className={ui.btnPrimarySm}>
                  {passwordSubmitting ? "Updating…" : "Update password"}
                </button>
              </div>
            </form>
          </SecurityRow>
        </div>
      </section>

      {demoToolsAvailable && (
        <section>
          <h2 className={`${ui.sectionHeading} mb-4`}>Developer</h2>
          <div className={`${ui.sectionCard} space-y-2`}>
            <ToggleSwitch
              id="showDemoTools"
              checked={demoToolsOn}
              onChange={setDemoToolsOn}
              label="Show demo tools"
            />
            <p className="text-xs text-ink-500">Testing shortcuts, in this browser only.</p>
          </div>
        </section>
      )}
    </div>
  );
}
