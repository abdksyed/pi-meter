import { Link } from 'react-router-dom'
import type { SessionsResponse } from '../../lib/api.types'
import { cn } from '../../lib/cn'
import {
  formatCost,
  formatDateTime,
  formatRelativeTime,
  formatTokens,
} from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Panel } from '../Panel'
import { PanelState } from '../PanelState'
import { Skeleton } from '../Skeleton'
import { ModelBadge } from './ModelBadge'
import { getSessionStatus } from './sessionStatus'
import styles from './SessionList.module.css'

export type SessionListProps = {
  data?: SessionsResponse
  isFiltered: boolean
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
  onClearFilters: () => void
}

export function SessionList({
  data,
  isFiltered,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onClearFilters,
}: SessionListProps) {
  const rows = data?.items ?? []
  const status = isLoading ? 'loading' : isError ? 'error' : rows.length === 0 ? 'empty' : 'ready'

  return (
    <Panel className={styles.panel} bodyClassName={styles.body}>
      <PanelState
        status={status}
        skeleton={<Skeleton lines={6} height={72} />}
        error={
          <ErrorState title="Could not load sessions" message={errorMessage} onRetry={onRetry} />
        }
        empty={
          <EmptyState
            eyebrow={isFiltered ? 'No matches' : 'No sessions'}
            title={isFiltered ? 'No sessions match these filters' : 'No sessions in this range'}
            description={
              isFiltered
                ? 'Remove a filter or widen the date range to see more sessions.'
                : 'Try a wider date range, or refresh the local index.'
            }
            action={
              isFiltered ? (
                <button type="button" className="pm-btn" onClick={onClearFilters}>
                  Clear filters
                </button>
              ) : undefined
            }
          />
        }
      >
        <ul className={styles.list}>
          {rows.map((session) => {
            const title = session.sessionName ?? session.firstUserMessage ?? session.sessionId
            const status = getSessionStatus(session)
            const primaryModel = session.models[0]
            return (
              <li key={session.sessionId}>
                <Link className={styles.card} to={`/sessions/${session.sessionId}`}>
                  <span className={styles.topRow}>
                    <span
                      className={cn('pm-status-dot', status.className)}
                      title={session.parseError ?? status.label}
                      aria-label={status.label}
                      role="img"
                    />
                    <span className={styles.title}>{title}</span>
                    <span className={styles.cost}>{formatCost(session.costTotal)}</span>
                  </span>
                  <span className={styles.path} title={session.cwd}>
                    {session.cwd}
                  </span>
                  <span className={styles.meta}>
                    <time
                      dateTime={session.lastActivityAt}
                      title={formatDateTime(session.lastActivityAt)}
                    >
                      {formatRelativeTime(session.lastActivityAt)}
                    </time>
                    {primaryModel ? (
                      <ModelBadge
                        model={primaryModel.model}
                        extraCount={Math.max(0, session.models.length - 1)}
                        title={session.models.map((item) => `${item.provider}/${item.model}`).join(', ')}
                      />
                    ) : null}
                    <span className={styles.tokens}>{formatTokens(session.totalTokens)} tokens</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </PanelState>
    </Panel>
  )
}
