import { Link } from 'react-router-dom'
import type { ModelBreakdownRow } from '../../lib/api.types'
import { formatCost, formatCostExact, formatPercent, formatTokens } from '../../lib/format'
import type { RangeState } from '../../lib/dateRange'
import { buildSessionsHref } from '../../lib/searchParams'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Panel } from '../Panel'
import { PanelState } from '../PanelState'
import { Skeleton } from '../Skeleton'
import styles from './BreakdownPanel.module.css'

export type ModelBreakdownProps = {
  rows?: ModelBreakdownRow[]
  range: RangeState
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
}

export function ModelBreakdown({
  rows,
  range,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: ModelBreakdownProps) {
  const allRows = rows ?? []
  const sorted = [...allRows].sort((a, b) => b.costTotal - a.costTotal).slice(0, 6)
  const total = allRows.reduce((sum, row) => sum + row.costTotal, 0)
  const status = isLoading ? 'loading' : isError ? 'error' : sorted.length === 0 ? 'empty' : 'ready'
  const top = sorted[0]

  return (
    <Panel
      title="Cost by model"
      meta={rows ? `${rows.length} ${rows.length === 1 ? 'model' : 'models'}` : undefined}
      footer={top ? `Top model · ${formatPercent(total > 0 ? top.costTotal / total : 0)} of cost` : undefined}
      className={styles.panel}
      bodyClassName="pm-panel__body--flush"
    >
      <PanelState
        status={status}
        skeleton={<BreakdownSkeleton />}
        error={
          <ErrorState title="Could not load models" message={errorMessage} onRetry={onRetry} />
        }
        empty={
          <EmptyState
            title="No model usage"
            description="No model-attributed usage was recorded in this range."
          />
        }
      >
        <ul className={styles.list}>
          {sorted.map((row) => {
            const share = total > 0 ? row.costTotal / total : 0
            return (
              <li key={`${row.provider}:${row.model}`}>
                <Link
                  className={styles.row}
                  to={buildSessionsHref(range, { model: row.model })}
                  title={`Show sessions using ${row.model}`}
                >
                  <span className={styles.rowTop}>
                    <span className={styles.nameBlock}>
                      <span className={styles.name} title={row.model}>
                        {row.model}
                      </span>
                      <span className={styles.sub}>
                        {row.provider} · {formatTokens(row.totalTokens)} tokens
                      </span>
                    </span>
                    <span className={styles.values}>
                      <span className={styles.amount} title={formatCostExact(row.costTotal)}>
                        {formatCost(row.costTotal)}
                      </span>
                      <span className={styles.percent}>{formatPercent(share)}</span>
                    </span>
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span className={styles.fill} style={{ width: `${share * 100}%` }} />
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

export function BreakdownSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} lines={2} height={10} width="100%" />
      ))}
    </div>
  )
}
