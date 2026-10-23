import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../lib/api'
import { queryKeys } from '../lib/queryKeys'
import { normalizeHealth } from './apiAdapters'

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: async ({ signal }) =>
      normalizeHealth(await apiGet<unknown>('/health', undefined, signal)),
    staleTime: 5_000,
  })
}
