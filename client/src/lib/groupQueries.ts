import type { QueryClient } from "@tanstack/react-query";
import type { GroupDetail, GroupMember, RoundContribution } from "../api/client";

export const OPTIMISTIC_MEMBER_ID = "__optimistic_member__";

export type PollableGroupStatus = "forming" | "active" | "completed";

const groupDetailQueryKeys = (groupId: string) =>
  [
    ["group", groupId],
    ["ledger", groupId],
    ["audit-log", groupId],
    ["obligations", groupId],
    ["disputes", groupId],
    ["dashboard", groupId],
    ["completion-summary", groupId],
  ] as const;

export function groupQueryKey(groupId: string) {
  return ["group", groupId] as const;
}

export function patchGroupCurrentRoundContribution(
  queryClient: QueryClient,
  groupId: string,
  contributionId: string,
  update: (contribution: RoundContribution) => RoundContribution,
) {
  queryClient.setQueryData<GroupDetail>(groupQueryKey(groupId), (current) => {
    if (!current?.currentRound?.contributions) return current;
    const contributions = current.currentRound.contributions.map((c) =>
      c.id === contributionId ? update(c) : c,
    );
    return {
      ...current,
      currentRound: { ...current.currentRound, contributions },
    };
  });
}

export function patchConfirmedContribution(contribution: RoundContribution): RoundContribution {
  const now = new Date().toISOString();
  return {
    ...contribution,
    status: "confirmed",
    confirmedAt: contribution.confirmedAt ?? now,
    canReport: false,
    canConfirm: false,
    canRecord: false,
  };
}

export function patchReportedContribution(
  contribution: RoundContribution,
  amount?: string,
  options?: { isManager?: boolean },
): RoundContribution {
  const now = new Date().toISOString();
  return {
    ...contribution,
    status: "reported",
    source: "member",
    amount: amount ?? contribution.amount,
    reportedAt: now,
    canReport: false,
    canRecord: false,
    canConfirm: options?.isManager ?? false,
  };
}

export async function refreshGroupView(queryClient: QueryClient, groupId: string) {
  await queryClient.refetchQueries({ queryKey: groupQueryKey(groupId) });
  void queryClient.invalidateQueries({ queryKey: ["dashboard", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["disputes", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["ledger", groupId] });
}

export function invalidateGroupShell(queryClient: QueryClient, groupId: string) {
  void queryClient.invalidateQueries({ queryKey: groupQueryKey(groupId) });
  void queryClient.invalidateQueries({ queryKey: ["groups"] });
  void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
}

export function invalidateGroupIssues(queryClient: QueryClient, groupId: string) {
  void queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["disputes", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard", groupId] });
  void queryClient.invalidateQueries({ queryKey: groupQueryKey(groupId) });
  void queryClient.invalidateQueries({ queryKey: ["manager-obligations"] });
}

export function invalidateGroupCycle(queryClient: QueryClient, groupId: string) {
  invalidateGroupShell(queryClient, groupId);
  void queryClient.invalidateQueries({ queryKey: ["ledger", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["audit-log", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["completion-summary", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["member-reliability", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["obligations", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["disputes", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["manager-obligations"] });
}

export function mergeCurrentRoundIntoGroupCache(
  queryClient: QueryClient,
  groupId: string,
  currentRound: GroupDetail["currentRound"],
) {
  if (!currentRound) return;
  queryClient.setQueryData<GroupDetail>(groupQueryKey(groupId), (current) => {
    if (!current) return current;
    return { ...current, currentRound };
  });
}

export function patchRecordedContribution(
  contribution: RoundContribution,
  amount?: string,
): RoundContribution {
  const now = new Date().toISOString();
  return {
    ...contribution,
    status: "confirmed",
    source: "organizer",
    amount: amount ?? contribution.amount,
    reportedAt: now,
    confirmedAt: now,
    canReport: false,
    canConfirm: false,
    canRecord: false,
  };
}

/** Refresh home/stats/ledger in the background without refetching the group view. */
export function deferContributionSideEffects(queryClient: QueryClient, groupId: string) {
  void queryClient.invalidateQueries({ queryKey: ["groups"] });
  void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["ledger", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["audit-log", groupId] });
  void queryClient.invalidateQueries({ queryKey: ["member-reliability", groupId] });
}

function recomputeFormingGroupDetail(current: GroupDetail, members: GroupMember[]): GroupDetail {
  const filledCount = members.length;
  const openSlots = Math.max(0, current.group.slotCount - filledCount);
  const unclaimedSeats = members.filter((m) => m.isPlaceholder).length;
  const needsPayoutOrder = members.some((m) => m.turnNumber === null);

  return {
    ...current,
    members,
    group: {
      ...current.group,
      filledCount,
      openSlots,
    },
    pending: {
      ...current.pending,
      payoutOrder: needsPayoutOrder,
      openSlots,
      unclaimedSeats,
      canActivate:
        current.group.status === "forming" &&
        openSlots === 0 &&
        !needsPayoutOrder &&
        !!current.group.startDate,
    },
  };
}

export function patchMemberAdded(queryClient: QueryClient, groupId: string, member: GroupMember) {
  queryClient.setQueryData<GroupDetail>(groupQueryKey(groupId), (current) => {
    if (!current) return current;
    const withoutOptimistic = current.members.filter((m) => m.id !== OPTIMISTIC_MEMBER_ID);
    const members = withoutOptimistic.some((m) => m.id === member.id)
      ? withoutOptimistic.map((m) => (m.id === member.id ? member : m))
      : [...withoutOptimistic, member];
    return recomputeFormingGroupDetail(current, members);
  });
}

export function patchMemberRemoved(queryClient: QueryClient, groupId: string, memberId: string) {
  queryClient.setQueryData<GroupDetail>(groupQueryKey(groupId), (current) => {
    if (!current) return current;
    const members = current.members.filter((m) => m.id !== memberId && m.id !== OPTIMISTIC_MEMBER_ID);
    return recomputeFormingGroupDetail(current, members);
  });
}

export function shuffleMemberTurnOrder(members: GroupMember[]): GroupMember[] {
  const copy = [...members];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.map((member, index) => ({ ...member, turnNumber: index + 1 }));
}

export function applyManualTurnOrder(
  members: GroupMember[],
  order: { membershipId: string; turnNumber: number }[],
): GroupMember[] {
  const turnById = new Map(order.map((entry) => [entry.membershipId, entry.turnNumber]));
  return members
    .map((member) => ({
      ...member,
      turnNumber: turnById.get(member.id) ?? member.turnNumber,
    }))
    .sort((a, b) => (a.turnNumber ?? 0) - (b.turnNumber ?? 0));
}

export function payoutOrderFromMembers(
  members: GroupMember[],
): { membershipId: string; turnNumber: number }[] | null {
  if (members.some((member) => member.turnNumber == null)) return null;
  return members.map((member) => ({
    membershipId: member.id,
    turnNumber: member.turnNumber as number,
  }));
}

export function patchPayoutOrder(queryClient: QueryClient, groupId: string, members: GroupMember[]) {
  queryClient.setQueryData<GroupDetail>(groupQueryKey(groupId), (current) => {
    if (!current) return current;
    const sorted = [...members].sort((a, b) => (a.turnNumber ?? 0) - (b.turnNumber ?? 0));
    return recomputeFormingGroupDetail(current, sorted);
  });
}

/** Sync home list after roster changes without refetching the group detail view. */
export function deferStructureSideEffects(queryClient: QueryClient, groupId: string) {
  void queryClient.invalidateQueries({ queryKey: ["groups"] });
  void queryClient.invalidateQueries({ queryKey: ["home-overview"] });
  void queryClient.invalidateQueries({ queryKey: groupQueryKey(groupId), refetchType: "none" });
}

export async function clearGroupQueries(queryClient: QueryClient, groupId: string) {
  await Promise.all(
    groupDetailQueryKeys(groupId).map(async (queryKey) => {
      await queryClient.cancelQueries({ queryKey });
      queryClient.removeQueries({ queryKey });
    }),
  );
}

export function isGroupNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    (error as { status: number }).status === 404
  );
}

export function shouldPollGroupStatus(status: PollableGroupStatus | undefined): boolean {
  return status === "forming" || status === "active";
}

/** Secondary group endpoints — fetch on demand, not on a poll loop. */
export const groupSupplementalQueryOptions = {
  staleTime: 60_000,
  refetchOnWindowFocus: false,
  refetchInterval: false as const,
};

export function groupQueryPollOptions(_status: PollableGroupStatus | undefined): {
  refetchInterval: number | false;
  refetchOnWindowFocus: boolean;
} {
  return {
    refetchInterval: false,
    refetchOnWindowFocus: true,
  };
}

export function shouldRetryGroupQuery(failureCount: number, queryError: unknown): boolean {
  return isGroupNotFoundError(queryError) ? false : failureCount < 2;
}
