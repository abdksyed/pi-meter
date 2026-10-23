import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import type { RangeParams } from '../lib/api.types'
import { queryKeys } from '../lib/queryKeys'
import { normalizeProjectBreakdown } from './apiAdapters'

export interface ProjectBreakdownParams extends RangeParams {
  model?: string
}

export function useProjectBreakdown(params: ProjectBreakdownParams) {
  return useQuery({
    queryKey: queryKeys.byProject(params),
    queryFn: async ({ signal }) =>
      normalizeProjectBreakdown(await apiGet<unknown>('/usage/by-project', params, signal)),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
