import type { SummaryResponse } from '../../lib/api.types'
import { COST_SEGMENTS } from '../../lib/chartColors'
import type { CostSegmentKey } from '../../lib/chartColors'
import { formatCost, formatCostExact, formatPercent } from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Panel } from '../Panel'
import { PanelState } from '../PanelState'
import { Skeleton } from '../Skeleton'
import styles from './CostBreakdown.module.css'

export type CostBreakdownProps = {
  summary?: SummaryResponse
  rangeLabel: string
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onRetry?: () => void
}

export function CostBreakdown({
  summary,
  rangeLabel,
  isLoading,
  isError,
  errorMessage,
  onRetry,
}: CostBreakdownProps) {
  const parts = summary
    ? COST_SEGMENTS.map((segment) => ({
        ...segment,
        value: summary[segment.key as CostSegmentKey],
      }))
    : []
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const isEmpty = !summary || total <= 0

  const status = isLoading ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'

  return (
    <Panel
      title="Cost composition"
      meta={rangeLabel}
      className={styles.panel}
      bodyClassName={styles.body}
    >
      <PanelState
        status={status}
        skeleton={<CostSkeleton />}
        error={
          <ErrorState
            title="Could not load cost composition"
            message={errorMessage}
            onRetry={onRetry}
          />
        }
        empty={
          <EmptyState
            title="No cost recorded"
            description="No usage with a recorded cost was found in this range."
          />
        }
      >
        <div
          className={styles.track}
          role="img"
          aria-label={parts
            .map((part) => `${part.label} ${formatPercent(total > 0 ? part.value / total : 0)}`)
            .join(', ')}
        >
          {parts.map((part) => {
            const share = total > 0 ? part.value / total : 0
            if (share <= 0) return null
            return (
              <span
                key={part.key}
                className={styles.segment}
                style={{ width: `${share * 100}%`, backgroundColor: part.color }}
                title={`${part.label}: ${formatCostExact(part.value)} (${formatPercent(share)})`}
              />
            )
          })}
        </div>

        <dl className={styles.legend}>
          {parts.map((part) => {
            const share = total > 0 ? part.value / total : 0
            return (
              <div className={styles.legendRow} key={part.key}>
                <dt>
                  <span className={styles.dot} style={{ backgroundColor: part.color }} />
                  {part.label}
                </dt>
                <dd>
                  <span className={styles.amount} title={formatCostExact(part.value)}>
                    {formatCost(part.value)}
                  </span>
                  <span className={styles.percent}>{formatPercent(share)}</span>
                </dd>
              </div>
            )
          })}
        </dl>

        <p className={styles.note}>
          Reasoning tokens are counted in token totals; the schema records no separate reasoning
          cost.
        </p>
      </PanelState>
    </Panel>
  )
}

function CostSkeleton() {
  return (
    <div className={styles.skeleton}>
      <Skeleton lines={1} height={8} />
      <Skeleton lines={4} height={12} />
    </div>
  )
}
