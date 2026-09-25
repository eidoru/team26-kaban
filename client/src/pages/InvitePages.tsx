import { type ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ApiError,
  api,
  PENDING_INVITE_KEY,
  type GroupSummary,
  type InvitePreview,
} from "../api/client";
import { useAuth } from "../context/AuthContext";
import { invalidateHomeLists } from "../lib/homeQueries";
import { formatFrequency } from "../lib/frequency";
import { formatDueDate, formatLocalDate } from "../lib/dates";
import { formatShortfallInterestRate } from "../lib/shortfallInterest";
import { Avatar } from "../components/Avatar";
import { AuthShell } from "../components/AuthShell";
import { KabanChest } from "../components/Illustration";
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
    <AuthShell title={title} subtitle={subtitle} width="lg">
      {children}
    </AuthShell>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-ink-50 px-4 py-3">
      <dt className="text-xs font-bold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-bold text-ink-900 tabular-nums">{value}</dd>
    </div>
  );
}

function GroupInviteDetails({ data }: { data: InvitePreview }) {
  const { group, manager, members } = data;
  const amount = `₱${Number(group.contributionAmount).toLocaleString()}`;
  const freq = formatFrequency(group.frequency, group.frequencyDays);
  const potAmount = Number(group.contributionAmount) * group.slotCount;
  const startLabel = group.startDate ? formatDueDate(group.startDate) : null;
  const filled = group.filledCount ?? 0;
  const openSlots = group.openSlots ?? Math.max(0, group.slotCount - filled);
  const stack = members.slice(0, 5);

  return (
    <div className="overflow-hidden rounded-3xl border border-ink-200 bg-white shadow-card">
      <div className="flex items-start gap-3 p-5">
        <Avatar name={group.name} size="md" shape="tile" />
        <div className="min-w-0 flex-1">
          <p className="font-heading truncate text-xl font-bold text-ink-900">{group.name}</p>
          <p className="mt-0.5 text-sm text-ink-600">
            Organized by <span className="font-bold text-ink-800">{manager.displayName}</span>
          </p>
        </div>
        <span className={`${statusBadgeClass(group.status)} shrink-0`}>{statusLabel(group.status)}</span>
      </div>

      <div className="mx-5 rounded-2xl bg-brand-700 px-5 py-4 text-white">
        <p className="text-xs font-bold uppercase tracking-wide text-brand-100">Each round&apos;s pot</p>
        <p className="font-heading mt-1 text-3xl font-bold tabular-nums">₱{potAmount.toLocaleString()}</p>
        <p className="mt-1 text-sm text-brand-50">
          {amount} per member · {freq}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-2 p-5">
        <DetailRow label="Contribution" value={amount} />
        <DetailRow label="Schedule" value={freq} />
        {startLabel && <DetailRow label="Starts" value={startLabel} />}
        <DetailRow
          label="Shortfall interest"
          value={formatShortfallInterestRate(
            group.shortfallInterestRatePercent,
            group.frequency,
            group.frequencyDays,
          )}
        />
      </dl>

      <div className="border-t border-ink-100 px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {stack.length > 0 && (
              <div className="flex">
                {stack.map((member, index) => (
                  <Avatar
                    key={index}
                    name={member.displayName}
                    placeholder={member.isPlaceholder}
                    className={`ring-2 ring-white ${index > 0 ? "-ml-2" : ""}`}
                  />
                ))}
              </div>
            )}
            <p className="text-sm font-bold text-ink-900">
              {filled} of {group.slotCount} joined
            </p>
          </div>
          {group.status === "forming" && (
            <span className="text-xs font-semibold text-ink-500">
              {openSlots > 0 ? `${openSlots} seat${openSlots === 1 ? "" : "s"} open` : "Roster full"}
            </span>
          )}
        </div>
        {group.status === "forming" && (
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400 transition-all"
              style={{ width: `${rosterFillPercent(group)}%` }}
            />
          </div>
        )}
      </div>

      {members.length > 0 && (
        <div className="border-t border-ink-100 px-5 py-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-wide text-ink-500">Who&apos;s in</p>
          <ul className="space-y-2.5">
            {members.map((member, index) => (
              <li key={index} className="flex items-center gap-3">
                <Avatar name={member.displayName} placeholder={member.isPlaceholder} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink-900">{member.displayName}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {member.turnNumber != null && (
                    <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-bold text-ink-600">
                      Turn {member.turnNumber}
                    </span>
                  )}
                  {member.isManager && <span className={ui.badgeActive}>Manager</span>}
                </div>
              </li>
            ))}
            {group.status === "forming" &&
              openSlots > 0 &&
              Array.from({ length: Math.min(openSlots, 3) }).map((_, index) => (
                <li key={`open-${index}`} className="flex items-center gap-3 text-sm font-semibold text-ink-500">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-ink-300 text-xs">
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
    <div className="mb-4 flex items-start gap-4 rounded-3xl border-2 border-sun-200 bg-sun-100 p-5">
      <Avatar name={placeholder.displayName} size="md" className="ring-2 ring-white" />
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-wide text-sun-800">Your seat</p>
        <p className="font-heading mt-0.5 text-xl font-bold text-ink-900">{placeholder.displayName}</p>
        <div className="mt-2 space-y-1 text-sm text-ink-700">
          {placeholder.turnNumber != null && (
            <p>
              Payout turn <span className="font-bold text-ink-900">#{placeholder.turnNumber}</span>
            </p>
          )}
          {placeholder.contact && (
            <p>
              Contact on file: <span className="font-semibold text-ink-900">{placeholder.contact}</span>
            </p>
          )}
          <p>Sign in with your Kaban account to link this seat to your profile.</p>
        </div>
      </div>
    </div>
  );
}

function InviteMeta({ expiresAt }: { expiresAt: string | null }) {
  const expiresLabel = formatLocalDate(expiresAt);
  if (!expiresLabel) return null;

  return <p className="mt-4 text-center text-xs font-semibold text-ink-500">This link expires {expiresLabel}</p>;
}

function InviteLoading({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-cream" role="status">
      <KabanChest className="w-28 animate-pulse" />
      <p className="text-sm font-semibold text-ink-500">{label}</p>
    </div>
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
  alreadyMemberGroupId,
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
  /** Set when the signed-in viewer already has a seat: show a way in instead of Join. */
  alreadyMemberGroupId?: string;
}) {
  if (alreadyMemberGroupId) {
    return (
      <div className="mt-6 space-y-3">
        <p className={ui.success}>You&apos;re already in this paluwagan.</p>
        <Link to={`/groups/${alreadyMemberGroupId}`} className={ui.btnPrimaryFull}>
          Open paluwagan
        </Link>
      </div>
    );
  }

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
          <p className="pt-1 text-center text-xs text-ink-500">
            You&apos;ll return here after signing in to complete joining.
          </p>
        </div>
      )}

      {canJoin && user && (
        <div className="space-y-3">
          <p className="flex items-center justify-center gap-2 text-sm text-ink-600">
            <Avatar name={user.displayName} />
            Signed in as <span className="font-bold text-ink-900">{user.displayName}</span>
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
    if (!token) return;
    // Already a member: nothing to resume after login, so don't leave a pending invite behind.
    if (data?.invite.alreadyMember) sessionStorage.removeItem(PENDING_INVITE_KEY);
    else sessionStorage.setItem(PENDING_INVITE_KEY, token);
  }, [token, data?.invite.alreadyMember]);

  if (isLoading || authLoading) {
    return <InviteLoading label="Loading invitation…" />;
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
        alreadyMemberGroupId={data.invite.alreadyMember ? data.group.id : undefined}
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
    if (!token) return;
    // Already a member: nothing to resume after login, so don't leave a pending invite behind.
    if (data?.invite.alreadyMember) sessionStorage.removeItem(PENDING_INVITE_KEY);
    else sessionStorage.setItem(PENDING_INVITE_KEY, token);
  }, [token, data?.invite.alreadyMember]);

  if (isLoading || authLoading) {
    return <InviteLoading label="Loading claim link…" />;
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
        alreadyMemberGroupId={data.invite.alreadyMember ? data.group.id : undefined}
      />
    </InviteShell>
  );
}
