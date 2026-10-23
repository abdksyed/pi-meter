import { useMutation, useQueryClient } from '@tanstack/react-query'
import { runRefresh } from '../lib/api'

export function useRefresh() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ signal }: { signal?: AbortSignal } = {}) => runRefresh(signal),
    onSuccess: () => {
      void queryClient.invalidateQueries()
    },
  })
}
