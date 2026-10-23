import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { ApiError, runRefresh } from '../lib/api'
import type { RefreshResponse } from '../lib/api.types'
import { cn } from '../lib/cn'

type RefreshMessage = {
  text: string
  tone: 'ok' | 'warning' | 'error'
}

function describeRefresh(result: RefreshResponse): RefreshMessage {
  const parts = [
    `${result.filesUpdated} updated`,
    `${result.filesAdded} added`,
    ...(result.filesRemoved > 0 ? [`${result.filesRemoved} removed`] : []),
    `${Math.round(result.durationMs)} ms`,
  ]
  if (result.filesFailed > 0) {
    return { text: `${parts.join(' · ')} · ${result.filesFailed} failed`, tone: 'warning' }
  }
  return { text: parts.join(' · '), tone: 'ok' }
}

export type RefreshButtonProps = {
  label?: string
  className?: string
}

/** Re-indexes the local session directory and refreshes every cached query. */
export function RefreshButton({ label = 'Refresh', className }: RefreshButtonProps) {
  const queryClient = useQueryClient()
  const [message, setMessage] = useState<RefreshMessage | null>(null)
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const showMessage = (next: RefreshMessage) => {
    setMessage(next)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMessage(null), 6000)
  }

  const mutation = useMutation({
    mutationFn: () => runRefresh(),
    onSuccess: async (result) => {
      showMessage(describeRefresh(result))
      await queryClient.invalidateQueries()
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        showMessage({ text: 'Refresh already in progress', tone: 'warning' })
        return
      }
      showMessage({
        text: error instanceof ApiError ? error.message : 'Refresh failed',
        tone: 'error',
      })
    },
  })

  const isBusy = mutation.isPending

  return (
    <div className={cn('pm-refresh', className)}>
      <button
        type="button"
        className="pm-btn"
        onClick={() => mutation.mutate()}
        disabled={isBusy}
        aria-busy={isBusy}
        aria-label={isBusy ? 'Refreshing session index' : 'Refresh session index'}
      >
        <svg className="pm-btn__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path
            d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2.5v3.2h-3.2"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span className="pm-btn__label">{isBusy ? 'Refreshing…' : label}</span>
      </button>
      <span
        className={cn(
          'pm-refresh__status',
          message?.tone === 'error' && 'is-error',
          message?.tone === 'warning' && 'is-warning',
        )}
        role="status"
        aria-live="polite"
      >
        {message?.text}
      </span>
    </div>
  )
}
