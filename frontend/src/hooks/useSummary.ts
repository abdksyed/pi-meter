import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import type { RangeParams } from '../lib/api.types'
import { queryKeys } from '../lib/queryKeys'
import { normalizeSummary } from './apiAdapters'

export interface SummaryParams extends RangeParams {
  cwd?: string
  model?: string
}

export function useSummary(params: SummaryParams) {
  return useQuery({
    queryKey: queryKeys.summary(params),
    queryFn: async ({ signal }) => normalizeSummary(await apiGet<unknown>('/summary', params, signal)),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
