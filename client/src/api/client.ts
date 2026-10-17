import type { AmountMode } from "@domain/amounts";
import type { Frequency } from "@domain/schedule";
import type { SetupErrors, SetupInput } from "@domain/setup";

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

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export type GroupState = "LOBBY" | "LAUNCHED" | "ACTIVE" | "COMPLETED" | "COMPLETED_WITH_OUTSTANDING_DEBT" | "CANCELLED";
export type { AmountMode, Frequency, SetupErrors, SetupInput };

/** A paluwagan's settings. Money is integer centavos; dates are YYYY-MM-DD Manila calendar days. */
export interface GroupSummary {
  id: string;
  name: string;
  state: GroupState;
  slotCount: number;
  amountMode: AmountMode;
  contribution: number;
  pot: number;
  enteredPot: number | null;
  /** Pot mode: the pot was rounded up from this (R-AMT-02). */
  potAdjustedFrom: number | null;
  frequency: Frequency;
  intervalDays: number | null;
  frequencyLabel: string;
  startDate: string;
  /** Hundredths of a percent: 125 is 1.25%. */
  interestRate: number;
  createdAt: string;
  launchedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
}


export interface SlotView {
  id: string;
  kind: "MEMBER" | "PLACEHOLDER";
  name: string;
  isOrganizer: boolean;
  isViewer: boolean;
  position: number | null;
  /** When a user claimed this placeholder; earlier records are inherited. */
  claimedAt: string | null;
  /** Placeholder contact, organizer only. */
  contact: string | null;
  /** Live claim link, organizer only. */
  claimLink: { url: string; createdAt: string } | null;
  /**
   * What this slot owes the organizer (§8), in centavos. Everyone sees everyone's (R-DEC-06).
   * `rounds` is what each round's payout added; the rounds less `repaid` and `deducted` (taken
   * from their payout) is what's owed now.
   */
  debt: {
    principal: number;
    interest: number;
    rounds: { round: number; shortfall: number; interest: number }[];
    repaid: number;
    deducted: number;
  };
}

/** A processed payout (§7). Amounts in centavos. */
export interface PayoutView {
  round: number;
  payoutDate: string;
  recipientSlotId: string;
  gross: number;
  ownShortfall: number;
  interestDeducted: number;
  principalDeducted: number;
  net: number;
  status: "AWAITING_HANDOVER" | "HANDED_OVER" | "CONFIRMED";
  handedOverAt: string | null;
  confirmedAt: string | null;
  autoConfirmed: boolean;
  proofAttached: boolean;
  /** Handover photo, for the recipient and the organizer only. */
  proofUrl: string | null;
}

export interface ScheduleRound {
  number: number;
  periodStart: string;
  payoutDate: string;
  recipientSlotId: string | null;
  status: "UPCOMING" | "OPEN" | "CLOSED";
}

export type PeriodStatus = "PAID" | "PARTIAL" | "UNPAID";

/** One slot's standing in the open period (R-SUB-07). Amounts in centavos. */
export interface PeriodSlot {
  slotId: string;
  due: number;
  approved: number;
  pending: number;
  status: PeriodStatus;
  pendingReview: boolean;
  /** Last time the organizer sent this slot a reminder this round. */
  remindedAt: string | null;
  /** Reminded within the last day; the next reminder waits. */
  remindedRecently: boolean;
}

export interface PeriodView {
  roundId: string;
  number: number;
  periodStart: string;
  payoutDate: string;
  recipientSlotId: string;
  expected: number;
  approvedTotal: number;
  pendingTotal: number;
  slots: PeriodSlot[];
}

export interface SubmissionView {
  id: string;
  slotId: string;
  round: number | null;
  type: "CONTRIBUTION" | "DEBT_PAYMENT";
  /** How an approved submission counted; a late contribution counts as a DEBT_PAYMENT. */
  appliedAs: "CONTRIBUTION" | "DEBT_PAYMENT" | null;
  amount: number;
  effectiveAmount: number | null;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED";
  note: string | null;
  proofAttached: boolean;
  /** Short-lived link to the photo; only for the submitter's slot and the organizer. */
  proofUrl: string | null;
  submittedAt: string;
  /** Reported by the viewer, who may withdraw it while pending. */
  mine: boolean;
  reviewedAt: string | null;
  denialReason: string | null;
  selfApproved: boolean;
}

/** A request to change an approved contribution (§6.2). Amounts in centavos. */
export interface DisputeView {
  id: string;
  submissionId: string;
  slotId: string;
  round: number | null;
  previousAmount: number;
  proposedAmount: number;
  reason: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" | "EXPIRED";
  createdAt: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  /** Raised by the viewer, who may withdraw it while pending. */
  mine: boolean;
  /** The refund an approved decrease created (R-DSP-03), owed by the organizer. */
  refund: number | null;
}

/** A request to trade payout turns (§9). */
export interface SwapView {
  id: string;
  requesterSlotId: string;
  targetSlotId: string;
  status: "AWAITING_TARGET" | "AWAITING_ORGANIZER" | "APPROVED" | "DECLINED" | "DENIED" | "EXPIRED" | "CANCELLED";
  createdAt: string;
  expiresAt: string | null;
  reviewNote: string | null;
}

/** R-CMP-02: one member's totals, in centavos. */
export interface MemberTotals {
  slotId: string;
  name: string;
  position: number | null;
  isOrganizer: boolean;
  contributed: number;
  received: number;
  refunds: number;
  coveredByOrganizer: number;
  debtIncurred: number;
  debtSettled: number;
  debtOutstanding: number;
}

export interface GroupSummaryTotals {
  members: MemberTotals[];
  totals: { collected: number; paidOut: number; coveredByOrganizer: number; refunds: number; debtOutstanding: number };
}

export type ActivityCategory = "payments" | "debts" | "payouts" | "disputes" | "swaps" | "members" | "settings";

/** One audit-log entry as members read it (§13). */
export interface ActivityEntry {
  id: string;
  at: string;
  action: string;
  category: ActivityCategory;
  actor: string;
  /** Done by the app itself (a period closing, a reminder), not a person. */
  system: boolean;
  title: string;
  detail: string | null;
  proofAttached: boolean | null;
  selfApproved: boolean;
}

export type Health = "ON_TRACK" | "AT_RISK" | "SHORT";

/** §15.1 / §15.3 for one paluwagan. Amounts in centavos. */
export interface GroupStats {
  openRound: { number: number; periodStart: string; payoutDate: string; health: Health; projectedPayout: number | null } | null;
  money: { collected: number; paidOut: number; toPayOut: number; coveredByOrganizer: number; owedToOrganizer: number; refunds: number };
  collection: { round: number; payoutDate: string; approved: number; expected: number; rate: number }[];
  reliability: { slotId: string; name: string; onTime: number; partial: number; missed: number }[];
  myTurn: {
    round: number;
    payoutDate: string;
    status: "UPCOMING" | "COLLECTING" | "AWAITING_HANDOVER" | "HANDED_OVER" | "CONFIRMED";
    net: number | null;
    /** What it would come to if paid out now, after this slot's shortfall and debt. */
    projected: number | null;
  } | null;
}

export interface HistoryEvent {
  at: string;
  round: number | null;
  slotId: string;
  name: string;
  event: string;
  amount: number | null;
  principalDelta: number | null;
  interestDelta: number | null;
  status: string | null;
  notes: string;
  inherited: boolean;
}

/** §15.2: the member's home across every paluwagan. */
export interface HomeDashboard {
  groups: {
    id: string;
    name: string;
    state: GroupState;
    isOrganizer: boolean;
    contribution: number;
    frequencyLabel: string;
    slotCount: number;
    occupied: number;
    startDate: string;
    openRound: { number: number; payoutDate: string } | null;
    myStanding: { due: number; approved: number; pending: number; reportable: number } | null;
    myTurn: { round: number; payoutDate: string; paid: boolean } | null;
    owed: number;
    waiting: { reviews: number; swapsToAnswer: number; payoutsToHandOver: number; receiptsToConfirm: number };
  }[];
  due: { groupId: string; groupName: string; kind: "CONTRIBUTION" | "DEBT"; amount: number; dueDate: string | null; round: number | null }[];
  payouts: {
    groupId: string;
    groupName: string;
    round: number;
    payoutDate: string;
    status: "NOT_STARTED" | "UPCOMING" | "COLLECTING" | "AWAITING_HANDOVER" | "HANDED_OVER" | "CONFIRMED";
    net: number | null;
  }[];
  debts: { groupId: string; groupName: string; principal: number; interest: number }[];
  owedToMe: { groupId: string; groupName: string; name: string; amount: number }[];
  totals: { contributed: number; received: number; owed: number; owedToMe: number; refundsToMe: number; refundsIOwe: number };
}

export type ExportKind = "statement" | "ledger" | "summary";
export type ExportFormat = "pdf" | "csv";

export interface GroupDetail {
  group: GroupSummary & { organizerName: string };
  viewer: { slotId: string; isOrganizer: boolean };
  slots: SlotView[];
  openSlots: number;
  inviteLink: { url: string; createdAt: string } | null;
  schedule: ScheduleRound[];
  /** The open contribution period; null outside ACTIVE. */
  period: PeriodView | null;
  /** Submissions the viewer may see (this period's, pending, debt payments): all for the organizer, their own slot's otherwise. */
  submissions: SubmissionView[];
  /** Disputes the viewer may see, oldest first. */
  disputes: DisputeView[];
  /** Turn swaps the viewer may see, newest first. */
  swaps: SwapView[];
  /** Processed payouts, newest first. */
  payouts: PayoutView[];
  /** LOBBY only. */
  launch: { blockers: string[]; earliestStartDate: string } | null;
}

export type PublicGroup = GroupSummary & { organizerName: string; occupied: number };

export interface InviteLanding {
  status: "OPEN" | "FULL" | "CLOSED" | "ALREADY_MEMBER";
  group: PublicGroup;
}

export interface ClaimLanding {
  status: "OPEN" | "CLAIMED" | "CLOSED" | "ALREADY_MEMBER";
  group: PublicGroup;
  placeholder: { slotId: string; name: string | null; position: number | null };
}

export interface NotificationItem {
  id: string;
  groupId: string | null;
  groupName: string | null;
  kind: string;
  title: string;
  body: string;
  link: string | null;
  data: unknown;
  readAt: string | null;
  createdAt: string;
  isUnread: boolean;
}

class ApiError extends Error {
  status: number;
  /** The server's machine-readable reason, e.g. "FULL" or "NOT_READY". */
  code?: string;
  /** Per-field messages for forms. */
  fields?: Record<string, string>;

  constructor(status: number, message: string, code?: string, fields?: Record<string, string>) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields;
  }
}

async function errorFrom(res: Response): Promise<ApiError> {
  const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string; fields?: Record<string, string> };
  return new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code, body.fields);
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

  if (!res.ok) throw await errorFrom(res);
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
      if (!retryRes.ok) throw await errorFrom(retryRes);
      if (retryRes.status === 204) return undefined as T;
      return retryRes.json() as Promise<T>;
    }
  }

  if (!res.ok) throw await errorFrom(res);

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** No refresh-and-retry. With `withAuth`, sends the stored token so the server can personalize;
 * an expired token is simply treated as a guest there. */
async function publicRequest<T>(path: string, { withAuth = false }: { withAuth?: boolean } = {}): Promise<T> {
  const tokens = withAuth ? getStoredTokens() : null;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : undefined,
  });
  if (!res.ok) throw await errorFrom(res);
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

  getNotifications: () =>
    request<{ notifications: NotificationItem[]; unreadCount: number }>("/notifications"),

  markNotificationRead: (notificationId: string) =>
    request<{ notification: { id: string; readAt: string | null } }>(`/notifications/${notificationId}`, {
      method: "PATCH",
      body: JSON.stringify({}),
    }),

  markAllNotificationsRead: () =>
    request<{ marked: number }>("/notifications/read-all", { method: "PATCH", body: JSON.stringify({}) }),

  // --- Groups. Every change returns the fresh GroupDetail.
  createGroup: (body: SetupInput) => send<GroupDetail>("POST", "/groups", body),
  getGroup: (id: string, signal?: AbortSignal) => request<GroupDetail>(`/groups/${id}`, { signal }),
  editGroup: (id: string, body: SetupInput) => send<GroupDetail>("PATCH", `/groups/${id}`, body),
  cancelGroup: (id: string) => send<GroupDetail>("POST", `/groups/${id}/cancel`),
  createInviteLink: (id: string) => send<GroupDetail>("POST", `/groups/${id}/invite-link`),
  addPlaceholder: (id: string, body: { name: string; contact?: string }) =>
    send<GroupDetail>("POST", `/groups/${id}/placeholders`, body),
  removeSlot: (id: string, slotId: string) => send<GroupDetail>("DELETE", `/groups/${id}/slots/${slotId}`),
  createClaimLink: (id: string, slotId: string) => send<GroupDetail>("POST", `/groups/${id}/slots/${slotId}/claim-link`),
  revokeClaimLink: (id: string, slotId: string) =>
    send<GroupDetail>("DELETE", `/groups/${id}/slots/${slotId}/claim-link`),
  setOrder: (id: string, slotIds: string[]) => send<GroupDetail>("PUT", `/groups/${id}/order`, { slotIds }),
  shuffleOrder: (id: string) => send<GroupDetail>("POST", `/groups/${id}/order/shuffle`),
  launch: (id: string) => send<GroupDetail>("POST", `/groups/${id}/launch`),
  leaveGroup: (id: string) => send<{ ok: true }>("POST", `/groups/${id}/leave`),
  // --- Payments (§6.1). Upload a proof first (requestProofUpload, then lib/proofUpload), then submit.
  requestProofUpload: (id: string, contentType: string) =>
    send<{ path: string; token: string }>("POST", `/groups/${id}/proofs`, { contentType }),
  submitPayment: (
    id: string,
    body: { slotId: string; type: "CONTRIBUTION" | "DEBT_PAYMENT"; amount: number; proofPath?: string; note?: string },
  ) => send<GroupDetail>("POST", `/groups/${id}/submissions`, body),
  raiseDispute: (id: string, body: { submissionId: string; proposedAmount: number; reason: string }) =>
    send<GroupDetail>("POST", `/groups/${id}/disputes`, body),
  approveDispute: (id: string, disputeId: string) => send<GroupDetail>("POST", `/groups/${id}/disputes/${disputeId}/approve`),
  denyDispute: (id: string, disputeId: string, note: string) =>
    send<GroupDetail>("POST", `/groups/${id}/disputes/${disputeId}/deny`, { note }),
  cancelDispute: (id: string, disputeId: string) => send<GroupDetail>("POST", `/groups/${id}/disputes/${disputeId}/cancel`),
  requestSwap: (id: string, body: { targetSlotId: string; requesterSlotId?: string }) =>
    send<GroupDetail>("POST", `/groups/${id}/swaps`, body),
  acceptSwap: (id: string, swapId: string) => send<GroupDetail>("POST", `/groups/${id}/swaps/${swapId}/accept`),
  declineSwap: (id: string, swapId: string) => send<GroupDetail>("POST", `/groups/${id}/swaps/${swapId}/decline`),
  approveSwap: (id: string, swapId: string) => send<GroupDetail>("POST", `/groups/${id}/swaps/${swapId}/approve`),
  denySwap: (id: string, swapId: string, note: string) => send<GroupDetail>("POST", `/groups/${id}/swaps/${swapId}/deny`, { note }),
  cancelSwap: (id: string, swapId: string) => send<GroupDetail>("POST", `/groups/${id}/swaps/${swapId}/cancel`),
  markHandedOver: (id: string, round: number, proofPath?: string) =>
    send<GroupDetail>("POST", `/groups/${id}/rounds/${round}/handover`, { proofPath }),
  confirmReceipt: (id: string, round: number) => send<GroupDetail>("POST", `/groups/${id}/rounds/${round}/confirm-receipt`),
  approveSubmission: (id: string, submissionId: string) =>
    send<GroupDetail>("POST", `/groups/${id}/submissions/${submissionId}/approve`),
  denySubmission: (id: string, submissionId: string, reason: string) =>
    send<GroupDetail>("POST", `/groups/${id}/submissions/${submissionId}/deny`, { reason }),
  cancelSubmission: (id: string, submissionId: string) =>
    send<GroupDetail>("POST", `/groups/${id}/submissions/${submissionId}/cancel`),
  // --- Activity (§13) and reminders (§12).
  activity: (id: string, options: { before?: string; category?: ActivityCategory } = {}) => {
    const query = new URLSearchParams();
    if (options.before) query.set("before", options.before);
    if (options.category) query.set("category", options.category);
    const qs = query.toString();
    return request<{ entries: ActivityEntry[]; hasMore: boolean }>(`/groups/${id}/activity${qs ? `?${qs}` : ""}`);
  },
  remindSlot: (id: string, slotId: string) => send<GroupDetail>("POST", `/groups/${id}/slots/${slotId}/remind`),

  // --- Dashboards (§15).
  home: () => request<HomeDashboard>("/groups/home"),
  stats: (id: string) => request<GroupStats>(`/groups/${id}/stats`),
  history: (id: string, slotId?: string) =>
    request<{ slotId: string; claimedAt: string | null; events: HistoryEvent[] }>(
      `/groups/${id}/history${slotId ? `?slot=${encodeURIComponent(slotId)}` : ""}`,
    ),

  // --- Records (§10, §14).
  summary: (id: string) => request<GroupSummaryTotals>(`/groups/${id}/summary`),
  /** Downloads a statement, the ledger or the summary as a file (the browser saves it). */
  downloadExport: async (id: string, kind: ExportKind, format: ExportFormat, slotId?: string) => {
    const query = slotId ? `?slot=${encodeURIComponent(slotId)}` : "";
    const { blob, filename } = await requestFile(`/groups/${id}/exports/${kind}.${format}${query}`);
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement("a"), { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  },
  /** Demo tools only. */
  activateNow: (id: string) => send<{ ok: true; activated: number }>("POST", `/dev/groups/${id}/activate-now`),
  /** Demo tools only: close the open period now. */
  closeRoundNow: (id: string) => send<{ ok: true; closed: number; completed: boolean }>("POST", `/dev/groups/${id}/close-round`),

  // --- Link landing pages: public, personalized when signed in.
  getInvite: (token: string) => publicRequest<InviteLanding>(`/invites/${token}`, { withAuth: true }),
  joinViaInvite: (token: string) =>
    send<{ groupId: string; alreadyMember: boolean }>("POST", `/invites/${token}/join`),
  getClaim: (token: string) => publicRequest<ClaimLanding>(`/claims/${token}`, { withAuth: true }),
  claimPlaceholder: (token: string) => send<{ groupId: string }>("POST", `/claims/${token}/claim`),
};

/** An authenticated download: the file and the name the server gave it. Refreshes the token once on 401. */
async function requestFile(path: string, retry = true): Promise<{ blob: Blob; filename: string }> {
  const tokens = getStoredTokens();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: tokens?.accessToken ? { Authorization: `Bearer ${tokens.accessToken}` } : undefined,
  });
  if (res.status === 401 && retry && tokens?.refreshToken && (await refreshAccessToken())) return requestFile(path, false);
  if (!res.ok) throw await errorFrom(res);
  const filename = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "kaban-export";
  return { blob: await res.blob(), filename };
}

function send<T>(method: string, path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method, body: JSON.stringify(body ?? {}) });
}

export { ApiError };
