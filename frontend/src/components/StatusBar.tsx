import { useHealth } from '../hooks/useHealth'
import { cn } from '../lib/cn'

const ENDPOINT = '127.0.0.1:8743'

/** Bottom strip: local-only status, database state, and the bound endpoint. */
export function StatusBar() {
  const health = useHealth()
  const isDegraded = health.isError || (health.data ? health.data.database !== 'ok' : false)

  let databaseLabel = 'Checking database…'
  if (health.isError) databaseLabel = 'Database unavailable'
  else if (health.data) databaseLabel = health.data.database === 'ok' ? 'SQLite synced' : 'Database error'

  return (
    <footer className="pm-statusbar" aria-label="Local index status">
      <span className="pm-statusbar__group">
        <span
          className={cn('pm-status-dot', isDegraded ? 'is-error' : health.isPending ? '' : 'is-ok')}
          aria-hidden="true"
        />
        <span>{health.isError ? 'Server unavailable' : 'Local'}</span>
      </span>
      <span className="pm-statusbar__sep" aria-hidden="true">
        ·
      </span>
      <span>{databaseLabel}</span>
      <span className="pm-statusbar__sep" aria-hidden="true">
        ·
      </span>
      <span className="pm-mono">{ENDPOINT}</span>
    </footer>
  )
}
