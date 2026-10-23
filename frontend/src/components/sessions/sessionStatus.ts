import type { SessionListItem } from '../../lib/api.types'

export type SessionStatus = {
  className: '' | 'is-ok' | 'is-warning' | 'is-error'
  label: string
}

const ACTIVE_WINDOW_MS = 15 * 60_000

export function getSessionStatus(session: SessionListItem, now = Date.now()): SessionStatus {
  if (session.parseStatus === 'error') {
    return { className: 'is-error', label: 'Parse error' }
  }
  if (session.parseStatus === 'warning') {
    return { className: 'is-warning', label: 'Parse warning' }
  }
  const lastActivity = new Date(session.lastActivityAt).getTime()
  if (Number.isFinite(lastActivity) && now - lastActivity < ACTIVE_WINDOW_MS) {
    return { className: 'is-ok', label: 'Active in the last 15 minutes' }
  }
  return { className: '', label: 'Idle' }
}
