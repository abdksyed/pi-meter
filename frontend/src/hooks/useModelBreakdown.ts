import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import type { RangeParams } from '../lib/api.types'
import { queryKeys } from '../lib/queryKeys'
import { normalizeModelBreakdown } from './apiAdapters'

export interface ModelBreakdownParams extends RangeParams {
  cwd?: string
}

export function useModelBreakdown(params: ModelBreakdownParams) {
  return useQuery({
    queryKey: queryKeys.byModel(params),
    queryFn: async ({ signal }) =>
      normalizeModelBreakdown(await apiGet<unknown>('/usage/by-model', params, signal)),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
