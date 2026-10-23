import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'

import { queryKeys } from '../lib/queryKeys'
import { normalizeFilters } from './apiAdapters'

export function useFilters() {
  return useQuery({
    queryKey: queryKeys.filters(),
    queryFn: async ({ signal }) => normalizeFilters(await apiGet<unknown>('/filters', undefined, signal)),
    staleTime: 60_000,
  })
}
