import type { SummaryResponse } from '../../lib/api.types'
import { formatCost, formatNumber, formatPercent, formatTokens, formatTokensExact } from '../../lib/format'
import { MetricCard } from './MetricCard'
import styles from './MetricStrip.module.css'

export type MetricStripProps = {
  summary?: SummaryResponse
  isLoading?: boolean
}

export function MetricStrip({ summary, isLoading }: MetricStripProps) {
  const placeholder = '—'

  return (
    <dl className={styles.strip} aria-label="Usage metrics" aria-busy={isLoading || undefined}>
      <MetricCard
        label="Sessions"
        value={summary ? formatNumber(summary.sessionCount) : placeholder}
        detail={summary ? `${formatNumber(summary.userMessageCount)} user messages` : undefined}
      />
      <MetricCard
        label="Assistant responses"
        value={summary ? formatNumber(summary.assistantMessageCount) : placeholder}
        detail={summary ? `${formatNumber(summary.toolCallCount)} tool calls` : undefined}
      />
      <MetricCard
        label="Tokens"
        value={summary ? formatTokens(summary.totalTokens) : placeholder}
        detail={summary ? `${formatPercent(ratio(summary.reasoningTokens, summary.totalTokens))} reasoning` : undefined}
        title={summary ? `${formatTokensExact(summary.totalTokens)} tokens` : undefined}
      />
      <MetricCard
        label="Avg session cost"
        value={summary ? formatCost(summary.averageSessionCost) : placeholder}
        detail={summary ? `${formatCost(summary.costTotal)} total` : undefined}
        title={summary ? `Exact average ${formatCost(summary.averageSessionCost)}` : undefined}
        emphasis="lead"
      />
    </dl>
  )
}

function ratio(part: number, total: number): number {
  return total > 0 ? part / total : 0
}
