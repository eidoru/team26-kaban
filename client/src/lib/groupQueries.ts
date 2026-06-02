import type { QueryClient } from "@tanstack/react-query";

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

export function getGroupPollIntervalMs(status: PollableGroupStatus | undefined): number | false {
  if (status === "forming") return 8_000;
  if (status === "active") return 10_000;
  return false;
}

export function groupQueryPollOptions(status: PollableGroupStatus | undefined): {
  refetchInterval: number | false;
  refetchOnWindowFocus: boolean;
} {
  const interval = getGroupPollIntervalMs(status);
  return {
    refetchInterval: typeof interval === "number" ? interval : false,
    refetchOnWindowFocus: shouldPollGroupStatus(status),
  };
}

export function shouldRetryGroupQuery(failureCount: number, queryError: unknown): boolean {
  return isGroupNotFoundError(queryError) ? false : failureCount < 2;
}
