import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, type GroupDetail } from "../api/client";
import { invalidateHomeLists } from "./homeQueries";

/** Everything about one group lives under this key, so one invalidation refreshes it all. */
export const groupKey = (id: string) => ["group", id] as const;

/** `refetchInterval` is the fallback poll for when the realtime channel is down. */
export function useGroup(id: string | undefined, refetchInterval: number | false = false) {
  return useQuery({
    queryKey: groupKey(id ?? ""),
    queryFn: ({ signal }) => api.getGroup(id!, signal),
    enabled: !!id,
    staleTime: 30_000,
    refetchInterval,
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 2,
  });
}

/**
 * Run group actions that answer with the fresh GroupDetail: the cache is replaced with the reply,
 * so the screen updates without a refetch. Tracks which action is in flight and the last error.
 */
export function useGroupActions(groupId: string) {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (
      key: string,
      action: () => Promise<GroupDetail>,
      options?: { onError?: (error: ApiError) => void },
    ): Promise<GroupDetail | null> => {
      setPending(key);
      setError(null);
      try {
        const detail = await action();
        queryClient.setQueryData(groupKey(groupId), detail);
        invalidateHomeLists(queryClient);
        return detail;
      } catch (err) {
        const apiError = err instanceof ApiError ? err : new ApiError(0, "Something went wrong. Try again.");
        setError(apiError);
        options?.onError?.(apiError);
        return null;
      } finally {
        setPending(null);
      }
    },
    [groupId, queryClient],
  );

  return { run, pending, error, clearError: () => setError(null) };
}
