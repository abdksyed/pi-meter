import { Link } from 'react-router-dom'
import type { ProjectBreakdownRow } from '../../lib/api.types'
import { projectColor } from '../../lib/chartColors'
import { projectSlug, formatCost, formatCostExact, formatPercent, formatTokens } from '../../lib/format'
import type { RangeState } from '../../lib/dateRange'
import { buildSessionsHref } from '../../lib/searchParams'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Panel } from '../Panel'
import { PanelState } from '../PanelState'
import { BreakdownSkeleton } from './ModelBreakdown'
import styles from './BreakdownPanel.module.css'

export type ProjectBreakdownProps = {
  rows?: ProjectBreakdownRow[]
  range: RangeState
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
}

export function ProjectBreakdown({
  rows,
  range,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: ProjectBreakdownProps) {
  const allRows = rows ?? []
  const sorted = [...allRows].sort((a, b) => b.costTotal - a.costTotal).slice(0, 6)
  const total = allRows.reduce((sum, row) => sum + row.costTotal, 0)
  const status = isLoading ? 'loading' : isError ? 'error' : sorted.length === 0 ? 'empty' : 'ready'
  const top = sorted[0]

  return (
    <Panel
      title="Cost by project"
      meta={rows ? `${rows.length} ${rows.length === 1 ? 'directory' : 'directories'}` : undefined}
      footer={top ? `Top directory · ${projectSlug(top.cwd)}` : undefined}
      className={styles.panel}
      bodyClassName="pm-panel__body--flush"
    >
      <PanelState
        status={status}
        skeleton={<BreakdownSkeleton />}
        error={
          <ErrorState title="Could not load projects" message={errorMessage} onRetry={onRetry} />
        }
        empty={
          <EmptyState
            title="No project usage"
            description="No working directory usage was recorded in this range."
          />
        }
      >
        <ul className={styles.list}>
          {sorted.map((row) => {
            const share = total > 0 ? row.costTotal / total : 0
            return (
              <li key={row.cwd}>
                <Link
                  className={styles.row}
                  to={buildSessionsHref(range, { cwd: row.cwd })}
                  title={`Show sessions in ${row.cwd}`}
                >
                  <span className={styles.rowTop}>
                    <span className={styles.nameBlock}>
                      <span className={styles.name}>{projectSlug(row.cwd)}</span>
                      <span className={styles.sub} title={row.cwd}>
                        {row.cwd}
                      </span>
                    </span>
                    <span className={styles.values}>
                      <span className={styles.amount} title={formatCostExact(row.costTotal)}>
                        {formatCost(row.costTotal)}
                      </span>
                      <span className={styles.percent}>
                        {formatTokens(row.totalTokens)} · {formatPercent(share)}
                      </span>
                    </span>
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span
                      className={styles.fill}
                      style={{ width: `${share * 100}%`, backgroundColor: projectColor(row.cwd) }}
                    />
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
