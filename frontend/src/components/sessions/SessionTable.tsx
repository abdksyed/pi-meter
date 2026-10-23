import { Link } from 'react-router-dom'
import type { SessionListItem, SessionsResponse, SessionSortField, SortDirection } from '../../lib/api.types'
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
import styles from './SessionTable.module.css'

export type SessionTableProps = {
  data?: SessionsResponse
  sort: SessionSortField
  dir: SortDirection
  isFiltered: boolean
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
  onSort: (field: SessionSortField) => void
  onClearFilters: () => void
}

export function SessionTable({
  data,
  sort,
  dir,
  isFiltered,
  isLoading,
  isError,
  errorMessage,
  onRetry,
  onSort,
  onClearFilters,
}: SessionTableProps) {
  const rows = data?.items ?? []
  const status = isLoading ? 'loading' : isError ? 'error' : rows.length === 0 ? 'empty' : 'ready'

  return (
    <Panel className={styles.panel} bodyClassName="pm-panel__body--flush">
      <PanelState
        status={status}
        skeleton={<TableSkeleton />}
        error={
          <div className={styles.statePad}>
            <ErrorState title="Could not load sessions" message={errorMessage} onRetry={onRetry} />
          </div>
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
        <div className={styles.tableScroll}>
          <table className={styles.table}>
            <caption className="pm-visually-hidden">
              Sessions{data ? `: ${data.total} total` : ''}
            </caption>
            <colgroup>
              <col className={styles.statusCol} />
              <col />
              <col className={styles.projectCol} />
              <col className={styles.timeCol} />
              <col className={styles.modelCol} />
              <col className={styles.tokensCol} />
              <col className={styles.costCol} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col" className={styles.statusHead}>
                  <span className="pm-visually-hidden">Status</span>
                </th>
                <SortHeader
                  field="title"
                  label="Session title & prompt"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                />
                <th scope="col">Project path</th>
                <SortHeader
                  field="lastActivity"
                  label="Last active"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                />
                <th scope="col">Model</th>
                <SortHeader
                  field="tokens"
                  label="Tokens"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  numeric
                />
                <SortHeader
                  field="cost"
                  label="Cost"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  numeric
                />
              </tr>
            </thead>
            <tbody>
              {rows.map((session) => (
                <SessionTableRow key={session.sessionId} session={session} />
              ))}
            </tbody>
          </table>
        </div>
      </PanelState>
    </Panel>
  )
}

function SessionTableRow({ session }: { session: SessionListItem }) {
  const title = session.sessionName ?? session.firstUserMessage ?? session.sessionId
  const status = getSessionStatus(session)
  const primaryModel = session.models[0]

  return (
    <tr className={styles.row}>
      <td className={styles.statusCell}>
        <span
          className={cn('pm-status-dot', status.className)}
          title={session.parseError ?? status.label}
          aria-label={status.label}
          role="img"
        />
      </td>
      <td className={styles.titleCell}>
        <Link to={`/sessions/${session.sessionId}`} className={styles.titleLink}>
          <span className={styles.title}>{title}</span>
          <span className={styles.prompt}>
            {session.parseStatus === 'error' ? (
              <span className={styles.parseError}>Parse error · </span>
            ) : null}
            {session.assistantMessageCount} responses · {session.entryCount} entries
          </span>
        </Link>
      </td>
      <td className={styles.pathCell}>
        <span className={styles.path} title={session.cwd}>
          {session.cwd}
        </span>
      </td>
      <td className={styles.timeCell}>
        <time dateTime={session.lastActivityAt} title={formatDateTime(session.lastActivityAt)}>
          {formatRelativeTime(session.lastActivityAt)}
        </time>
      </td>
      <td>
        {primaryModel ? (
          <ModelBadge
            model={primaryModel.model}
            extraCount={Math.max(0, session.models.length - 1)}
            title={session.models.map((item) => `${item.provider}/${item.model}`).join(', ')}
          />
        ) : (
          <span className={styles.muted}>—</span>
        )}
      </td>
      <td className={cn(styles.numCell)}>{formatTokens(session.totalTokens)}</td>
      <td className={cn(styles.numCell, styles.costCell)} title={formatCost(session.costTotal)}>
        {formatCost(session.costTotal)}
      </td>
    </tr>
  )
}

function SortHeader({
  field,
  label,
  sort,
  dir,
  onSort,
  numeric,
}: {
  field: SessionSortField
  label: string
  sort: SessionSortField
  dir: SortDirection
  onSort: (field: SessionSortField) => void
  numeric?: boolean
}) {
  const active = sort === field
  return (
    <th
      scope="col"
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={numeric ? styles.numHead : undefined}
    >
      <button type="button" className={styles.sortButton} onClick={() => onSort(field)}>
        {label}
        <span className={styles.sortMark} aria-hidden="true">
          {active ? (dir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  )
}

function TableSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <Skeleton lines={8} height={20} />
    </div>
  )
}
