import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import type { BucketGroup, RangeParams } from '../lib/api.types'
import { queryKeys } from '../lib/queryKeys'
import { normalizeTimeseries } from './apiAdapters'

export interface TimeseriesParams extends RangeParams {
  groupBy: BucketGroup
  cwd?: string
  model?: string
}

export function useUsageTimeseries(params: TimeseriesParams) {
  return useQuery({
    queryKey: queryKeys.timeseries(params),
    queryFn: async ({ signal }) =>
      normalizeTimeseries(await apiGet<unknown>('/usage/timeseries', params, signal)),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  })
}
