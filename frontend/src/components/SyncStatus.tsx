import { useEffect, useState } from 'react'
import { useHealth } from '../hooks/useHealth'
import { cn } from '../lib/cn'
import { formatDateTime, formatRelativeTime } from '../lib/format'

function useTick(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])

  return now
}

/** Relative "Synced 2m ago" label backed by /api/health. */
export function SyncStatus({ className }: { className?: string }) {
  const health = useHealth()
  const now = useTick(30_000)
  const lastRefreshAt = health.data?.lastRefreshAt ?? null
  const isDegraded = health.isError || (health.data ? health.data.database !== 'ok' : false)

  let label = 'Not synced yet'
  if (health.isPending) label = 'Checking sync…'
  else if (isDegraded) label = 'Sync unavailable'
  else if (lastRefreshAt) label = `Synced ${formatRelativeTime(lastRefreshAt, now)}`

  return (
    <span
      className={cn('pm-sync', className)}
      title={lastRefreshAt ? formatDateTime(lastRefreshAt) : 'No refresh has run yet'}
    >
      <span
        className={cn('pm-status-dot', isDegraded ? 'is-error' : health.isPending ? '' : 'is-ok')}
        aria-hidden="true"
      />
      <span className="pm-sync__label">{label}</span>
    </span>
  )
}
