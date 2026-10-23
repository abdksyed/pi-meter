import { Link } from 'react-router-dom'
import type { SessionsResponse } from '../../lib/api.types'
import {
  formatCost,
  formatDateTime,
  formatRelativeTime,
  formatTokens,
  projectSlug,
} from '../../lib/format'
import type { RangeState } from '../../lib/dateRange'
import { buildSessionsHref } from '../../lib/searchParams'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Panel } from '../Panel'
import { PanelState } from '../PanelState'
import { Skeleton } from '../Skeleton'
import styles from './RecentSessions.module.css'

export type RecentSessionsProps = {
  data?: SessionsResponse
  range: RangeState
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
}

export function RecentSessions({
  data,
  range,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: RecentSessionsProps) {
  const rows = data?.items ?? []
  const status = isLoading ? 'loading' : isError ? 'error' : rows.length === 0 ? 'empty' : 'ready'

  return (
    <Panel
      title="Recent sessions"
      meta={data ? `${rows.length} of ${data.total}` : undefined}
      className={styles.panel}
      bodyClassName="pm-panel__body--flush"
      footer={
        <Link to={buildSessionsHref(range)} className={styles.viewAll}>
          View all sessions →
        </Link>
      }
    >
      <PanelState
        status={status}
        skeleton={<RecentSkeleton />}
        error={
          <ErrorState title="Could not load recent sessions" message={errorMessage} onRetry={onRetry} />
        }
        empty={
          <EmptyState
            title="No sessions yet"
            description="Sessions appear here after the local index has been refreshed."
          />
        }
      >
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="pm-visually-hidden">Recent sessions</caption>
            <thead>
              <tr>
                <th scope="col">Session</th>
                <th scope="col" className={styles.projectColumn}>
                  Project
                </th>
                <th scope="col" className={styles.timeColumn}>
                  Last active
                </th>
                <th scope="col" className={styles.modelColumn}>
                  Model
                </th>
                <th scope="col" className={styles.numColumn}>
                  Tokens
                </th>
                <th scope="col" className={styles.numColumn}>
                  Cost
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((session) => {
                const title =
                  session.sessionName ?? session.firstUserMessage ?? session.sessionId
                const model = session.models[0]
                return (
                  <tr key={session.sessionId} className={styles.row}>
                    <td className={styles.titleCell}>
                      <Link to={`/sessions/${session.sessionId}`} className={styles.titleLink}>
                        <span className={styles.title}>{title}</span>
                        <span className={styles.titleMeta}>
                          {formatRelativeTime(session.lastActivityAt)} ·{' '}
                          {session.assistantMessageCount} responses · {session.entryCount} entries
                        </span>
                      </Link>
                    </td>
                    <td className={styles.projectColumn}>
                      <span className="pm-tag" title={session.cwd}>
                        {projectSlug(session.cwd)}
                      </span>
                    </td>
                    <td className={styles.timeColumn}>
                      <time dateTime={session.lastActivityAt} title={formatDateTime(session.lastActivityAt)}>
                        {formatRelativeTime(session.lastActivityAt)}
                      </time>
                    </td>
                    <td className={styles.modelColumn}>
                      {model ? (
                        <span className="pm-tag" title={session.models.map((item) => item.model).join(', ')}>
                          {model.model}
                          {session.models.length > 1 ? ` +${session.models.length - 1}` : ''}
                        </span>
                      ) : (
                        <span className={styles.muted}>—</span>
                      )}
                    </td>
                    <td className={styles.numColumn}>{formatTokens(session.totalTokens)}</td>
                    <td className={styles.numColumn}>{formatCost(session.costTotal)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </PanelState>
    </Panel>
  )
}

function RecentSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <Skeleton lines={6} height={18} />
    </div>
  )
}
