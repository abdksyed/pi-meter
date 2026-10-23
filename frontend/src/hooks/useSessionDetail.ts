import { useQuery } from "@tanstack/react-query";
import { apiGet, ApiError } from "../lib/api";
import { normalizeSessionDetail } from "../lib/normalize";
import { queryKeys } from "../lib/queryKeys";
import type { NormalizedSessionDetail } from "../lib/sessionTypes";

export interface SessionDetailError {
  message: string;
  status?: number;
  notFound: boolean;
}

export interface SessionDetailState {
  data?: NormalizedSessionDetail;
  isLoading: boolean;
  isFetching: boolean;
  error?: SessionDetailError;
  refetch: () => void;
}

function toSessionError(error: unknown): SessionDetailError | undefined {
  if (!error) return undefined;
  if (error instanceof ApiError) {
    return {
      message: error.message,
      status: error.status,
      notFound: error.status === 404,
    };
  }
  return {
    message: error instanceof Error ? error.message : "Could not load this session.",
    notFound: false,
  };
}

export function useSessionDetail(sessionId: string | undefined): SessionDetailState {
  const query = useQuery({
    queryKey: queryKeys.session(sessionId ?? ""),
    enabled: Boolean(sessionId),
    queryFn: async ({ signal }) => {
      const json = await apiGet<unknown>(`/sessions/${encodeURIComponent(sessionId as string)}`, undefined, signal);
      return normalizeSessionDetail(json);
    },
    staleTime: 30_000,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  return {
    data: query.data,
    isLoading: Boolean(sessionId) && query.isLoading,
    isFetching: query.isFetching,
    error: toSessionError(query.error),
    refetch: () => {
      void query.refetch();
    },
  };
}
