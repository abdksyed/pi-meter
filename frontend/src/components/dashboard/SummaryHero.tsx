import type { SummaryResponse } from '../../lib/api.types'
import { cn } from '../../lib/cn'
import { formatCost, formatCostExact, formatPercent, formatTokensExact } from '../../lib/format'
import { ErrorState } from '../ErrorState'
import { Skeleton } from '../Skeleton'
import styles from './SummaryHero.module.css'

export type SummaryHeroProps = {
  summary?: SummaryResponse
  rangeLabel: string
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
}

export function SummaryHero({
  summary,
  rangeLabel,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: SummaryHeroProps) {
  if (isError) {
    return (
      <section className={cn('pm-panel', styles.panel)} aria-label="Total cost">
        <div className="pm-panel__body">
          <ErrorState title="Could not load the summary" message={errorMessage} onRetry={onRetry} />
        </div>
      </section>
    )
  }

  if (isLoading || !summary) {
    return (
      <section className={cn('pm-panel', styles.panel)} aria-label="Total cost" aria-busy="true">
        <div className={cn('pm-panel__body', styles.body)}>
          <Skeleton lines={1} height={11} width="30%" />
          <Skeleton lines={1} height={58} width="58%" />
          <Skeleton lines={1} height={16} width="42%" />
        </div>
      </section>
    )
  }

  const delta =
    summary.previous && summary.previous.sessionCount > 0 && summary.previous.costTotal > 0
      ? (summary.costTotal - summary.previous.costTotal) / summary.previous.costTotal
      : null

  return (
    <section className={cn('pm-panel', styles.panel)} aria-labelledby="summary-hero-title">
      <div className={cn('pm-panel__body', styles.body)}>
        <p className="pm-eyebrow" id="summary-hero-title">
          Total cost · {rangeLabel}
        </p>
        <p className={styles.cost} title={formatCostExact(summary.costTotal)}>
          {formatCost(summary.costTotal)}
        </p>
        <div className={styles.metaRow}>
          <p className={styles.tokens} title={formatTokensExact(summary.totalTokens)}>
            {formatTokensExact(summary.totalTokens)} tokens
          </p>
          <span className={styles.sessionCount}>
            · {summary.sessionCount.toLocaleString()}{' '}
            {summary.sessionCount === 1 ? 'session' : 'sessions'}
          </span>
          {delta !== null && (
            <span
              className={cn(styles.delta, delta > 0 ? styles.up : styles.down)}
              title={`${formatCost(summary.previous?.costTotal ?? 0)} previous period`}
            >
              {delta >= 0 ? '↑' : '↓'} {formatPercent(Math.abs(delta))}
            </span>
          )}
        </div>
      </div>
    </section>
  )
}
