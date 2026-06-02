import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  api,
  getStoredTokens,
  PENDING_INVITE_KEY,
  type GroupSummary,
  type InvitePreview,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { invalidateHomeLists } from "../lib/homeQueries";
import { formatFrequency } from "../lib/frequency";
import { formatShortfallInterestRate } from "../lib/shortfallInterest";
import { displayInitials } from "../lib/initials";
import { statusBadgeClass, ui } from "../lib/ui";

function statusLabel(status: GroupSummary["status"]) {
  switch (status) {
    case "forming":
      return "Forming";
    case "active":
      return "Active";
    case "completed":
      return "Completed";
  }
}

function formatInviteDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function rosterFillPercent(group: InvitePreview["group"]): number {
  if (group.slotCount <= 0) return 0;
  return Math.min(100, Math.round(((group.filledCount ?? 0) / group.slotCount) * 100));
}

function InviteShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/80 to-slate-50 px-4 py-10">
      <div className="mx-auto w-full max-w-lg">
        <div className="mb-8 text-center">
          <Link to="/" className="text-2xl font-bold tracking-tight text-emerald-900">
            Kaban
          </Link>
          <h1 className="mt-6 text-3xl font-medium tracking-tight text-slate-900">{title}</h1>
          <p className={`mt-2 text-base ${ui.muted}`}>{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-900">{value}</dd>
    </div>
  );
}

function GroupInviteDetails({ data }: { data: InvitePreview }) {
  const { group, manager, members } = data;
  const amount = `₱${Number(group.contributionAmount).toLocaleString()}`;
  const freq = formatFrequency(group.frequency, group.frequencyDays);
  const potAmount = Number(group.contributionAmount) * group.slotCount;
  const startLabel = formatInviteDate(group.startDate);
  const filled = group.filledCount ?? 0;
  const openSlots = group.openSlots ?? Math.max(0, group.slotCount - filled);

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_4px_20px_-2px_rgba(0,0,0,0.05),0_2px_8px_-2px_rgba(0,0,0,0.03)]">
      <div className="border-b border-gray-100 bg-slate-50/80 px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-medium text-slate-900">{group.name}</p>
            <p className="mt-0.5 text-sm text-slate-600">
              Organized by <span className="font-medium text-slate-800">{manager.displayName}</span>
            </p>
          </div>
          <span className={`${statusBadgeClass(group.status)} shrink-0`}>
            {statusLabel(group.status)}
          </span>
        </div>
      </div>

      <dl className="divide-y divide-gray-50 px-5">
        <DetailRow label="Contribution" value={amount} />
        <DetailRow label="Schedule" value={freq} />
        <DetailRow label="Roster" value={`${filled} of ${group.slotCount} joined`} />
        {startLabel && <DetailRow label="Start date" value={startLabel} />}
        <DetailRow label="Round pot" value={`₱${potAmount.toLocaleString()}`} />
        <DetailRow
          label="Shortfall interest"
          value={formatShortfallInterestRate(
            group.shortfallInterestRatePercent,
            group.frequency,
            group.frequencyDays,
          )}
        />
      </dl>

      {group.status === "forming" && (
        <div className="border-t border-gray-100 px-5 py-4">
          <div className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
            <span>Roster progress</span>
            <span>
              {openSlots > 0
                ? `${openSlots} seat${openSlots === 1 ? "" : "s"} open`
                : "Roster full"}
            </span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-600 transition-all"
              style={{ width: `${rosterFillPercent(group)}%` }}
            />
          </div>
        </div>
      )}

      {members.length > 0 && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Members</p>
          <ul className="space-y-2">
            {members.map((member, index) => (
              <li key={index} className="flex items-center gap-3">
                <span className={ui.avatarInitialsSm} aria-hidden>
                  {displayInitials(member.displayName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {member.displayName}
                    {member.isPlaceholder && (
                      <span className="ml-1.5 font-normal text-slate-400">(placeholder)</span>
                    )}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {member.turnNumber != null && (
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                      Turn {member.turnNumber}
                    </span>
                  )}
                  {member.isManager && (
                    <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">
                      Manager
                    </span>
                  )}
                </div>
              </li>
            ))}
            {group.status === "forming" && openSlots > 0 &&
              Array.from({ length: Math.min(openSlots, 3) }).map((_, index) => (
                <li key={`open-${index}`} className="flex items-center gap-3 text-sm text-slate-400">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-dashed border-gray-200 bg-slate-50 text-xs">
                    ?
                  </span>
                  Open seat
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ClaimSeatCallout({ data }: { data: InvitePreview }) {
  const { placeholder } = data;
  if (!placeholder) return null;

  return (
    <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-emerald-800/70">Your seat</p>
      <p className="mt-1 text-lg font-medium text-slate-900">{placeholder.displayName}</p>
      <div className="mt-2 space-y-1 text-sm text-slate-600">
        {placeholder.turnNumber != null && (
          <p>
            Payout turn <span className="font-medium text-slate-900">#{placeholder.turnNumber}</span>
          </p>
        )}
        {placeholder.contact && (
          <p>
            Contact on file: <span className="text-slate-800">{placeholder.contact}</span>
          </p>
        )}
        <p className="text-slate-500">
          Sign in with your Kaban account to link this seat to your profile.
        </p>
      </div>
    </div>
  );
}

function InviteMeta({ expiresAt }: { expiresAt: string | null }) {
  const expiresLabel = formatInviteDate(expiresAt);
  if (!expiresLabel) return null;

  return (
    <p className="mt-4 text-center text-xs text-slate-400">This link expires {expiresLabel}</p>
  );
}

function InviteActions({
  canJoin,
  user,
  joinLabel,
  joinPending,
  onJoin,
  loginLabel,
  registerLabel,
  error,
  reason,
}: {
  canJoin: boolean;
  user: { displayName: string } | null;
  joinLabel: string;
  joinPending: boolean;
  onJoin: () => void;
  loginLabel: string;
  registerLabel: string;
  error: string;
  reason?: string;
}) {
  return (
    <div className="mt-6">
      {!canJoin && reason && <p className={ui.warning}>{reason}</p>}
      {error && <p className={`mt-3 ${ui.error}`}>{error}</p>}

      {canJoin && !user && (
        <div className="space-y-3">
          <Link to="/login" className={ui.btnPrimaryFull}>
            {loginLabel}
          </Link>
          <Link to="/register" className={ui.btnSecondaryFull}>
            {registerLabel}
          </Link>
          <p className="pt-1 text-center text-xs text-slate-500">
            You&apos;ll return here after signing in to complete joining.
          </p>
        </div>
      )}

      {canJoin && user && (
        <div className="space-y-3">
          <p className="text-center text-sm text-slate-600">
            Signed in as <span className="font-medium text-slate-900">{user.displayName}</span>
          </p>
          <button
            type="button"
            onClick={onJoin}
            disabled={joinPending}
            className={ui.btnPrimaryFull}
          >
            {joinPending ? "Please wait…" : joinLabel}
          </button>
        </div>
      )}

      {!canJoin && (
        <Link to="/" className={`mt-4 ${ui.btnSecondaryFull}`}>
          Go to Kaban
        </Link>
      )}
    </div>
  );
}

function InviteErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <InviteShell title={title} subtitle={message}>
      <div className={`${ui.cardCompact} text-center`}>
        <Link to="/" className={`inline-block ${ui.link}`}>
          Go to Kaban
        </Link>
      </div>
    </InviteShell>
  );
}

export function InviteLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState("");

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["invite", token],
    queryFn: () => api.previewInvite(token!),
    enabled: !!token,
  });

  const join = useMutation({
    mutationFn: () => api.resolveInvite(token!),
  });

  async function handleJoin() {
    setError("");
    try {
      const res = await join.mutateAsync();
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      invalidateHomeLists(queryClient);
      navigate(`/groups/${res.groupId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to join");
    }
  }

  useEffect(() => {
    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
  }, [token]);

  if (isLoading || authLoading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${ui.muted}`}>
        Loading invitation…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <InviteErrorState
        title="Invalid invite"
        message={
          loadError instanceof ApiError ? loadError.message : "This link is no longer valid."
        }
      />
    );
  }

  return (
    <InviteShell
      title="You're invited"
      subtitle="Review the paluwagan details below, then join when you're ready."
    >
      <GroupInviteDetails data={data} />
      <InviteMeta expiresAt={data.invite.expiresAt} />
      <InviteActions
        canJoin={data.invite.canJoin}
        user={user}
        joinLabel="Join paluwagan"
        joinPending={join.isPending}
        onJoin={() => void handleJoin()}
        loginLabel="Log in to join"
        registerLabel="Create account & join"
        error={error}
        reason={data.invite.reason}
      />
    </InviteShell>
  );
}

export function ClaimLandingPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading: authLoading } = useAuth();
  const [error, setError] = useState("");

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: ["claim", token],
    queryFn: () => api.previewInvite(token!),
    enabled: !!token,
  });

  const claim = useMutation({
    mutationFn: () => api.resolveInvite(token!),
  });

  async function handleClaim() {
    setError("");
    try {
      const res = await claim.mutateAsync();
      sessionStorage.removeItem(PENDING_INVITE_KEY);
      invalidateHomeLists(queryClient);
      navigate(`/groups/${res.groupId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to claim seat");
    }
  }

  useEffect(() => {
    if (token) sessionStorage.setItem(PENDING_INVITE_KEY, token);
  }, [token]);

  if (isLoading || authLoading) {
    return (
      <div className={`flex min-h-screen items-center justify-center ${ui.muted}`}>
        Loading claim link…
      </div>
    );
  }

  if (loadError || !data) {
    return (
      <InviteErrorState
        title="Invalid claim link"
        message={
          loadError instanceof ApiError ? loadError.message : "This link is no longer valid."
        }
      />
    );
  }

  return (
    <InviteShell
      title="Claim your seat"
      subtitle="This link reserves a specific seat in the paluwagan for you."
    >
      <ClaimSeatCallout data={data} />
      <GroupInviteDetails data={data} />
      <InviteMeta expiresAt={data.invite.expiresAt} />
      <InviteActions
        canJoin={data.invite.canJoin}
        user={user}
        joinLabel="Claim this seat"
        joinPending={claim.isPending}
        onJoin={() => void handleClaim()}
        loginLabel="Log in to claim"
        registerLabel="Register & claim"
        error={error}
        reason={data.invite.reason}
      />
    </InviteShell>
  );
}

export async function resolvePendingInvite(navigate: (path: string) => void): Promise<boolean> {
  const token = sessionStorage.getItem(PENDING_INVITE_KEY);
  if (!token || !getStoredTokens()) return false;

  try {
    const preview = await api.previewInvite(token);
    if (!preview.invite.canJoin) {
      const path = preview.invite.type === "membership_claim" ? `/claim/${token}` : `/invite/${token}`;
      navigate(path);
      return true;
    }
    const result = await api.resolveInvite(token);
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    navigate(`/groups/${result.groupId}`);
    return true;
  } catch {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
    return false;
  }
}
