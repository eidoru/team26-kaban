function resolveApiBase(): string {
  const configured = import.meta.env.VITE_API_URL as string | undefined;
  if (!configured) return "/api/v1";
  try {
    const { hostname } = new URL(configured, "http://localhost");
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "/api/v1";
    }
  } catch {
    return "/api/v1";
  }
  return configured;
}

const API_BASE = resolveApiBase();

export interface User {
  id: string;
  email: string;
  displayName: string;
  contact?: string | null;
}

export interface RealtimeTokenResponse {
  accessToken: string;
  expiresIn: number;
  supabaseUrl: string;
}

export interface UserActivityStats {
  paluwagans: {
    total: number;
    active: number;
    forming: number;
    completed: number;
  };
  totalContributed: string;
  totalReceived: string;
  outstanding: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface GroupSummary {
  id: string;
  name: string;
  status: "forming" | "active" | "completed";
  contributionAmount: string;
  frequency: string;
  frequencyDays?: number | null;
  slotCount: number;
  startDate: string | null;
  shortfallInterestRatePercent: string;
  filledCount?: number;
  openSlots?: number;
  role: "manager" | "member";
  membershipId: string;
  totalCollected?: string;
  outstandingDebt?: string;
}

export interface GroupMember {
  id: string;
  displayName: string;
  contact: string | null;
  isManager: boolean;
  isPlaceholder: boolean;
  userId: string | null;
  turnNumber: number | null;
}

export interface MemberReliability {
  membershipId: string;
  displayName: string;
  isPlaceholder: boolean;
  totalRounds: number;
  confirmedFull: number;
  partial: number;
  missed: number;
  openDisputes: number;
  reliabilitySummary: string;
}

export interface DisputeEntry {
  id: string;
  contributionId: string;
  raisedById: string;
  status: "open" | "resolved";
  note: string | null;
  proofUrl: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  createdAt: string;
  raisedByName: string;
  memberDisplayName: string;
  roundNumber: number;
  contributionStatus: string;
  contributionAmount: string;
}

export interface GroupDashboard {
  groupStatus: string;
  memberCount: number;
  currentRound: {
    number: number;
    dueDate: string;
    recipientName: string;
    confirmedContributions: number;
    pendingContributions: number;
    overdueContributions: number;
    isOverdue: boolean;
  } | null;
  pendingConfirmations: number;
  openDisputes: number;
  outstandingObligations: number;
  totalOutstanding: string;
  contributionAmount: string;
}

export interface CompletionSummary {
  groupName: string;
  completedAt: string | null;
  startDate: string | null;
  contributionAmount: string;
  frequency: string;
  frequencyDays?: number | null;
  shortfallInterestRatePercent: string;
  memberCount: number;
  roundsCompleted: number;
  totalContributions: number;
  confirmedContributions: number;
  collectionRate: number;
  potPerRound: string;
  totalExpected: string;
  totalCollected: string;
  cycleDurationDays: number | null;
  openDisputes: number;
  resolvedDisputes: number;
  unsettledObligations: number;
  outstandingDebt: string;
  payoutRecipients: {
    roundNumber: number;
    recipientName: string;
    dueDate: string;
    potAmount: string;
  }[];
  memberReliability: MemberReliability[];
}

export interface NotificationItem {
  id: string;
  groupId: string | null;
  groupName: string | null;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
  isUnread: boolean;
}

export interface HomeAttentionItem {
  id: string;
  kind:
    | "forming_ready"
    | "forming_slots"
    | "confirm_payments"
    | "payment_due"
    | "owed_outstanding";
  title: string;
  body: string;
  link: string;
  priority: "high" | "normal";
}

export interface HomeOverview {
  stats: {
    activeGroups: number;
    formingGroups: number;
    completedGroups: number;
    unreadNotifications: number;
    totalOwed: string | null;
    pendingConfirmations: number;
    paymentsDue: number;
  };
  attention: HomeAttentionItem[];
}

export interface ManagerObligationsOverview {
  totalOutstanding: string;
  groups: {
    groupId: string;
    groupName: string;
    groupStatus: string;
    count: number;
    totalOutstanding: string;
    items: { id: string; displayName: string; roundNumber: number; remaining: string }[];
  }[];
}

export interface RoundContribution {
  id: string;
  membershipId: string;
  displayName?: string;
  amount: string;
  status: "pending" | "reported" | "confirmed";
  source?: "member" | "organizer";
  note?: string | null;
  reportedAt?: string | null;
  confirmedAt?: string | null;
  isPlaceholder?: boolean;
  canReport?: boolean;
  canConfirm?: boolean;
  canRecord?: boolean;
  canDispute?: boolean;
  expectedAmount?: string;
  isPartial?: boolean;
}

export interface ObligationSettlement {
  id: string;
  amount: string;
  note: string | null;
  createdAt: string;
}

export interface ObligationEntry {
  id: string;
  debtorMembershipId: string;
  sourceRoundId: string;
  amount: string;
  settledAmount: string;
  interestSettledAmount: string;
  principalRemaining: string;
  accruedInterest: string;
  remaining: string;
  status: "unsettled" | "partially_settled" | "settled";
  externalCoverageNote: string | null;
  createdAt: string;
  displayName: string;
  isPlaceholder: boolean;
  roundNumber: number;
  roundDueDate: string;
  settlements: ObligationSettlement[];
}

export interface LedgerEntry extends RoundContribution {
  displayName: string;
  isPlaceholder: boolean;
  roundNumber: number;
  roundStatus: string;
  roundDueDate: string;
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorName: string;
  createdAt: string;
  title: string;
  summary: string;
  details: string[];
  category: string;
  categoryLabel: string;
}

export interface RoundSummary {
  id: string;
  number: number;
  dueDate: string;
  status: "scheduled" | "current" | "closed";
  closedAt: string | null;
  recipientMembershipId: string;
  recipientName?: string;
  contributions?: RoundContribution[];
}

export interface GroupDetail {
  group: Omit<GroupSummary, "membershipId"> & { membershipId?: string };
  members: GroupMember[];
  pending: {
    payoutOrder: boolean;
    startDateMissing: boolean;
    openSlots: number;
    unclaimedSeats: number;
    cycleStarted: boolean;
    canActivate: boolean;
  };
  currentRound: RoundSummary | null;
  schedule: RoundSummary[];
  issueCounts?: {
    openDisputes: number;
    unsettledObligations: number;
  };
  reliability?: MemberReliability[];
}

export interface InvitePreview {
  invite: {
    type: "group_invite" | "membership_claim";
    token: string;
    canJoin: boolean;
    reason?: string;
    expiresAt: string | null;
  };
  group: Omit<GroupSummary, "role" | "membershipId">;
  manager: { displayName: string };
  members: {
    displayName: string;
    isManager: boolean;
    isPlaceholder: boolean;
    turnNumber: number | null;
  }[];
  placeholder: {
    displayName: string;
    turnNumber: number | null;
    contact: string | null;
  } | null;
}

export interface InviteLink {
  id: string;
  type: "group_invite" | "membership_claim";
  token: string;
  expiresAt: string;
  url: string;
}

class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const AUTH_KEY = "kaban_auth";
const USER_KEY = "kaban_user";

function getActiveAuthStorage(): Storage | null {
  if (sessionStorage.getItem(AUTH_KEY)) return sessionStorage;
  if (localStorage.getItem(AUTH_KEY)) return localStorage;
  return null;
}

function resolveRememberMe(remember?: boolean): boolean {
  if (remember !== undefined) return remember;
  if (localStorage.getItem(AUTH_KEY)) return true;
  if (sessionStorage.getItem(AUTH_KEY)) return false;
  return true;
}

export function getStoredTokens() {
  const storage = getActiveAuthStorage();
  if (!storage) return null;
  const raw = storage.getItem(AUTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { accessToken: string; refreshToken: string };
  } catch {
    return null;
  }
}

export function storeAuth(data: AuthResponse, remember?: boolean) {
  const persist = resolveRememberMe(remember);
  clearAuth();
  const storage = persist ? localStorage : sessionStorage;
  storage.setItem(
    AUTH_KEY,
    JSON.stringify({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
    }),
  );
  storage.setItem(USER_KEY, JSON.stringify(data.user));
}

/** Update stored session after email change (keeps existing refresh token). */
export function patchSession(user: User, accessToken: string) {
  const tokens = getStoredTokens();
  if (!tokens) return;
  storeAuth({ user, accessToken, refreshToken: tokens.refreshToken });
}

export function clearAuth() {
  sessionStorage.removeItem(AUTH_KEY);
  sessionStorage.removeItem(USER_KEY);
  localStorage.removeItem(AUTH_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): User | null {
  const storage = getActiveAuthStorage();
  if (!storage) return null;
  const raw = storage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setStoredUser(user: User) {
  const storage = getActiveAuthStorage() ?? localStorage;
  storage.setItem(USER_KEY, JSON.stringify(user));
}

function isAccessTokenExpired(accessToken: string): boolean {
  try {
    const payload = JSON.parse(atob(accessToken.split(".")[1] ?? "")) as { exp?: number };
    if (!payload.exp) return true;
    return payload.exp * 1000 <= Date.now() + 30_000;
  } catch {
    return true;
  }
}

/** Revalidate stored session without redundant /me + /refresh round-trips. */
export async function restoreSession(): Promise<User | null> {
  const tokens = getStoredTokens();
  if (!tokens) return null;

  if (tokens.accessToken && !isAccessTokenExpired(tokens.accessToken)) {
    try {
      const { user } = await api.me();
      setStoredUser(user);
      return user;
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 401)) throw err;
    }
  }

  if (tokens.refreshToken) {
    const accessToken = await refreshAccessToken();
    if (accessToken) {
      return getStoredUser();
    }
  }

  clearAuth();
  return null;
}

export const PENDING_INVITE_KEY = "kaban_pending_invite";

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const tokens = getStoredTokens();
    if (!tokens?.refreshToken) return null;

    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) {
      clearAuth();
      return null;
    }

    const data = (await res.json()) as AuthResponse;
    storeAuth(data);
    return data.accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed (${res.status})`;
    try {
      const err = JSON.parse(text) as { error?: string; details?: unknown };
      message = err.error ?? message;
      throw new ApiError(res.status, message, err.details);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(res.status, message);
    }
  }

  return res.json() as Promise<T>;
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const tokens = getStoredTokens();
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  if (tokens?.accessToken) {
    headers.set("Authorization", `Bearer ${tokens.accessToken}`);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (res.status === 401 && retry && tokens?.refreshToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers.set("Authorization", `Bearer ${newToken}`);
      const retryRes = await fetch(`${API_BASE}${path}`, { ...options, headers });
      if (!retryRes.ok) {
        const err = await retryRes.json().catch(() => ({}));
        throw new ApiError(retryRes.status, err.error ?? "Request failed", err.details);
      }
      if (retryRes.status === 204) return undefined as T;
      return retryRes.json() as Promise<T>;
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let message = `Request failed (${res.status})`;
    try {
      const err = JSON.parse(text) as { error?: string; details?: unknown };
      message = err.error ?? message;
      throw new ApiError(res.status, message, err.details);
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(res.status, message);
    }
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

async function publicRequest<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new ApiError(res.status, err.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export const api = {
  register: (body: {
    email: string;
    password: string;
    displayName: string;
    contact?: string;
  }) => publicPost<AuthResponse>("/auth/register", body),

  login: (body: { email: string; password: string }) => publicPost<AuthResponse>("/auth/login", body),

  logout: (tokens: { refreshToken: string; accessToken?: string }) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (tokens.accessToken) {
      headers.Authorization = `Bearer ${tokens.accessToken}`;
    }
    return fetch(`${API_BASE}/auth/logout`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    }).then((res) => {
      if (!res.ok && res.status !== 401) {
        throw new ApiError(res.status, "Logout failed");
      }
    });
  },

  me: () => request<{ user: User }>("/auth/me"),

  getRealtimeToken: () => request<RealtimeTokenResponse>("/auth/realtime-token"),

  getProfileActivity: () => request<{ activity: UserActivityStats }>("/auth/me/activity"),

  updateProfile: (body: { displayName?: string; contact?: string | null }) =>
    request<{ user: User }>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),

  changeEmail: (body: { currentPassword: string; newEmail: string }) =>
    request<{ user: User; accessToken: string }>("/auth/me/email", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<AuthResponse>("/auth/me/password", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  groups: () => request<{ groups: GroupSummary[] }>("/groups"),

  getHomeOverview: () => request<HomeOverview>("/home/overview"),

  createGroup: (body: {
    name: string;
    contributionAmount: number;
    frequency: "weekly" | "biweekly" | "monthly" | "custom";
    frequencyDays?: number;
    slotCount: number;
    startDate: string;
    shortfallInterestRatePercent?: number;
  }) =>
    request<{ group: GroupSummary; membershipId: string }>("/groups", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  getGroup: (id: string) => request<GroupDetail>(`/groups/${id}`),

  getMemberReliability: (groupId: string) =>
    request<{ reliability: MemberReliability[] }>(`/groups/${groupId}/member-reliability`),

  addPlaceholder: (groupId: string, body: { displayName: string; contact?: string }) =>
    request<{ member: GroupMember }>(`/groups/${groupId}/members`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateMember: (groupId: string, memberId: string, body: { displayName?: string; contact?: string | null }) =>
    request<{ member: GroupMember }>(`/groups/${groupId}/members/${memberId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  removeMember: (groupId: string, memberId: string) =>
    request<void>(`/groups/${groupId}/members/${memberId}`, { method: "DELETE" }),

  createInvite: (
    groupId: string,
    body: { type: "group_invite" | "membership_claim"; membershipId?: string },
  ) =>
    request<{ invite: InviteLink }>(`/groups/${groupId}/invites`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  leaveGroup: (groupId: string) =>
    request<void>(`/groups/${groupId}/leave`, { method: "POST", body: JSON.stringify({}) }),

  deleteGroup: (groupId: string) =>
    request<void>(`/groups/${groupId}`, { method: "DELETE" }),

  setPayoutOrder: (
    groupId: string,
    body:
      | { method: "random" }
      | { method: "manual"; order: { membershipId: string; turnNumber: number }[] },
  ) =>
    request<{ members: GroupMember[] }>(`/groups/${groupId}/payout-order`, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  setStartDate: (groupId: string, startDate: string) =>
    request<{ group: GroupSummary }>(`/groups/${groupId}/start-date`, {
      method: "PATCH",
      body: JSON.stringify({ startDate }),
    }),

  activateGroup: (groupId: string, body?: { startDate?: string }) =>
    request<GroupDetail>(`/groups/${groupId}/activate`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  /** Dev/demo only — closes the current round immediately (requires non-production API). */
  advanceRound: (groupId: string) =>
    request<{
      ok: true;
      closedRound: number;
      openedRound: number | null;
      completed: boolean;
      group: GroupDetail;
    }>(`/dev/groups/${groupId}/advance-round`, { method: "POST", body: JSON.stringify({}) }),

  getCurrentRound: (groupId: string) =>
    request<{ currentRound: RoundSummary | null }>(`/groups/${groupId}/rounds/current`),

  getSchedule: (groupId: string) =>
    request<{ schedule: RoundSummary[] }>(`/groups/${groupId}/rounds`),

  reportContribution: (groupId: string, contributionId: string, body?: { note?: string; amount?: number }) =>
    request<{ contribution: RoundContribution }>(`/groups/${groupId}/contributions/${contributionId}/report`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  confirmContribution: (groupId: string, contributionId: string) =>
    request<{ contribution: RoundContribution }>(
      `/groups/${groupId}/contributions/${contributionId}/confirm`,
      { method: "POST", body: JSON.stringify({}) },
    ),

  recordContribution: (groupId: string, contributionId: string, body?: { note?: string; amount?: number }) =>
    request<{ contribution: RoundContribution }>(`/groups/${groupId}/contributions/${contributionId}/record`, {
      method: "POST",
      body: JSON.stringify(body ?? {}),
    }),

  getObligations: (groupId: string) =>
    request<{ obligations: ObligationEntry[] }>(`/groups/${groupId}/obligations`),

  settleMemberDebts: (groupId: string, memberId: string, body: { amount: number; note?: string }) =>
    request<{ applied: string; unapplied: string; slices: unknown[] }>(
      `/groups/${groupId}/members/${memberId}/settle`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  coverObligationExternally: (groupId: string, obligationId: string, body: { note: string }) =>
    request<{ obligationId: string; externalCoverageNote: string }>(
      `/groups/${groupId}/obligations/${obligationId}/cover-externally`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  getLedger: (groupId: string) => request<{ entries: LedgerEntry[] }>(`/groups/${groupId}/ledger`),

  getAuditLog: (groupId: string) => request<{ entries: AuditLogEntry[] }>(`/groups/${groupId}/audit-log`),

  getDashboard: (groupId: string) =>
    request<{ dashboard: GroupDashboard }>(`/groups/${groupId}/dashboard`),

  getCompletionSummary: (groupId: string) =>
    request<{ summary: CompletionSummary }>(`/groups/${groupId}/completion-summary`),

  getDisputes: (groupId: string) => request<{ disputes: DisputeEntry[] }>(`/groups/${groupId}/disputes`),

  raiseDispute: (groupId: string, contributionId: string, body: { note: string; proofUrl?: string }) =>
    request<{ dispute: { id: string; status: string } }>(
      `/groups/${groupId}/contributions/${contributionId}/disputes`,
      { method: "POST", body: JSON.stringify(body) },
    ),

  resolveDispute: (groupId: string, disputeId: string, resolution: string) =>
    request<{ dispute: { id: string; status: string } }>(
      `/groups/${groupId}/disputes/${disputeId}/resolve`,
      { method: "PATCH", body: JSON.stringify({ resolution }) },
    ),

  getManagerObligations: () =>
    request<ManagerObligationsOverview>("/groups/manager/obligations"),

  getNotifications: () =>
    request<{ notifications: NotificationItem[]; unreadCount: number }>("/notifications"),

  markNotificationRead: (notificationId: string) =>
    request<{ notification: { id: string; readAt: string | null } }>(
      `/notifications/${notificationId}`,
      { method: "PATCH", body: JSON.stringify({}) },
    ),

  markAllNotificationsRead: () =>
    request<{ marked: number }>("/notifications/read-all", { method: "PATCH", body: JSON.stringify({}) }),

  previewInvite: (token: string) => publicRequest<InvitePreview>(`/invites/${token}`),

  resolveInvite: (token: string) =>
    request<{ groupId: string; membershipId: string; alreadyMember?: boolean }>(
      `/invites/${token}/resolve`,
      { method: "POST", body: JSON.stringify({}) },
    ),
};

export { ApiError };
