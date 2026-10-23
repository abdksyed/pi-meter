import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import type { RangeParams, SessionSortField, SortDirection } from '../lib/api.types'
import { queryKeys } from '../lib/queryKeys'
import { normalizeSessions } from './apiAdapters'

export interface SessionsParams extends RangeParams {
  cwd?: string
  model?: string
  q?: string
  minCost?: string
  sort?: SessionSortField
  dir?: SortDirection
  page?: number
  pageSize?: number
}

export function useSessions(params: SessionsParams) {
  return useQuery({
    queryKey: queryKeys.sessions(params),
    queryFn: async ({ signal }) =>
      normalizeSessions(await apiGet<unknown>('/sessions', params, signal)),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
