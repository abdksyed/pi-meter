import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TooltipContentProps } from 'recharts'
import type { ChartMetric, TimeseriesPoint } from '../../lib/api.types'
import { TOKEN_SERIES } from '../../lib/chartColors'
import type { TokenSeriesKey } from '../../lib/chartColors'
import { cn } from '../../lib/cn'
import type { GroupBy } from '../../lib/dateRange'
import { formatBucket, groupLabel } from '../../lib/dateRange'
import {
  formatCost,
  formatCostExact,
  formatNumber,
  formatTokens,
  formatTokensExact,
} from '../../lib/format'
import { EmptyState } from '../EmptyState'
import { ErrorState } from '../ErrorState'
import { Panel } from '../Panel'
import { PanelState } from '../PanelState'
import { Skeleton } from '../Skeleton'
import styles from './UsageChart.module.css'

export type UsageChartProps = {
  points?: TimeseriesPoint[]
  chart: ChartMetric
  groupBy: GroupBy
  rangeLabel: string
  timezone?: string
  isLoading?: boolean
  isError?: boolean
  errorMessage?: string
  onChartChange: (chart: ChartMetric) => void
  onRetry?: () => void
}

type ChartRow = TimeseriesPoint & { label: string; cacheWriteTokens: number }

const ALL_SERIES: Record<TokenSeriesKey, boolean> = {
  inputTokens: true,
  outputTokens: true,
  reasoningTokens: true,
  cacheReadTokens: true,
  cacheWriteTokens: true,
}

export function UsageChart({
  points,
  chart,
  groupBy,
  rangeLabel,
  timezone,
  isLoading,
  isError,
  errorMessage,
  onChartChange,
  onRetry,
}: UsageChartProps) {
  const [visible, setVisible] = useState<Record<TokenSeriesKey, boolean>>(ALL_SERIES)

  const rows: ChartRow[] = (points ?? []).map((point) => ({
    ...point,
    label: formatBucket(point.bucket, groupBy),
    cacheWriteTokens: Math.max(
      0,
      point.totalTokens -
        point.inputTokens -
        point.outputTokens -
        point.reasoningTokens -
        point.cacheReadTokens,
    ),
  }))

  const isEmpty =
    rows.length === 0 || rows.every((row) => row.totalTokens === 0 && row.costTotal === 0)
  const status = isLoading ? 'loading' : isError ? 'error' : isEmpty ? 'empty' : 'ready'

  const visibleSeries = TOKEN_SERIES.filter((series) => visible[series.key])

  const toggleSeries = (key: TokenSeriesKey) => {
    setVisible((current) => {
      const next = { ...current, [key]: !current[key] }
      if (!TOKEN_SERIES.some((series) => next[series.key])) return current
      return next
    })
  }

  const title = chart === 'cost' ? `${groupLabel(groupBy)} cost` : `${groupLabel(groupBy)} tokens`

  return (
    <Panel
      title={title}
      meta={`${rangeLabel}${timezone ? ` · ${timezone}` : ''}`}
      className={styles.panel}
      bodyClassName={styles.body}
      actions={
        <div className={styles.metricToggle} role="group" aria-label="Chart metric">
          <button
            type="button"
            className={cn(styles.metricButton, chart === 'cost' && styles.metricActive)}
            aria-pressed={chart === 'cost'}
            onClick={() => onChartChange('cost')}
          >
            Cost
          </button>
          <button
            type="button"
            className={cn(styles.metricButton, chart === 'tokens' && styles.metricActive)}
            aria-pressed={chart === 'tokens'}
            onClick={() => onChartChange('tokens')}
          >
            Tokens
          </button>
        </div>
      }
      footer={
        status === 'ready' ? (
          <span>
            {rows.length} {rows.length === 1 ? 'bucket' : 'buckets'} ·{' '}
            {chart === 'cost'
              ? `${formatCost(rows.reduce((sum, row) => sum + row.costTotal, 0))} total`
              : `${formatTokens(rows.reduce((sum, row) => sum + row.totalTokens, 0))} tokens`}
          </span>
        ) : undefined
      }
    >
      <PanelState
        status={status}
        skeleton={<ChartSkeleton />}
        error={
          <ErrorState title="Could not load the usage chart" message={errorMessage} onRetry={onRetry} />
        }
        empty={
          <EmptyState
            title="No usage in this range"
            description="Try a wider date range or refresh the session index."
          />
        }
      >
        <div className={styles.chartFrame}>
          <div
            className={styles.chart}
            role="img"
            aria-label={`${title} for ${rangeLabel}. ${
              chart === 'cost'
                ? `Total cost ${formatCost(rows.reduce((sum, row) => sum + row.costTotal, 0))}.`
                : `Total tokens ${formatTokensExact(rows.reduce((sum, row) => sum + row.totalTokens, 0))}.`
            }`}
          >
            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
              {chart === 'cost' ? (
                <LineChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                    tickFormatter={formatCostAxis}
                  />
                  <Tooltip
                    content={<ChartTooltipContent chart={chart} />}
                    cursor={{ stroke: 'var(--color-border-strong)' }}
                  />
                  <Line
                    type="linear"
                    dataKey="costTotal"
                    name="Cost"
                    stroke="var(--color-ink)"
                    strokeWidth={1.5}
                    dot={{ r: 2.5, fill: 'var(--color-surface)', stroke: 'var(--color-ink)', strokeWidth: 1.5 }}
                    activeDot={{ r: 4, fill: 'var(--color-surface)', stroke: 'var(--color-ink)', strokeWidth: 1.5 }}
                    isAnimationActive={false}
                  />
                </LineChart>
              ) : (
                <BarChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={28}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={AXIS_TICK}
                    tickLine={false}
                    axisLine={false}
                    width={58}
                    tickFormatter={(value: number) => formatTokens(value)}
                  />
                  <Tooltip
                    content={<ChartTooltipContent chart={chart} />}
                    cursor={{ fill: 'var(--color-surface-subtle)' }}
                  />
                  {visibleSeries.map((series) => (
                    <Bar
                      key={series.key}
                      dataKey={series.key}
                      name={series.label}
                      stackId="tokens"
                      fill={series.color}
                      isAnimationActive={false}
                    />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {chart === 'cost' ? (
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.lineSwatch} aria-hidden="true" />
              Cost
            </span>
          </div>
        ) : (
          <div className={styles.legend} role="group" aria-label="Visible token series">
            {TOKEN_SERIES.map((series) => (
              <button
                key={series.key}
                type="button"
                className={cn(styles.legendItem, !visible[series.key] && styles.legendOff)}
                aria-pressed={visible[series.key]}
                onClick={() => toggleSeries(series.key)}
              >
                <span
                  className={styles.swatch}
                  style={{ backgroundColor: series.color }}
                  aria-hidden="true"
                />
                {series.label}
              </button>
            ))}
          </div>
        )}

        <details className={styles.dataTable}>
          <summary>View data table</summary>
          <div className={styles.tableScroll}>
            <table className="pm-table">
              <caption className="pm-visually-hidden">
                {title} by {groupBy} for {rangeLabel}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Bucket</th>
                  <th scope="col" className="pm-cell-num">
                    Input
                  </th>
                  <th scope="col" className="pm-cell-num">
                    Output
                  </th>
                  <th scope="col" className="pm-cell-num">
                    Reasoning
                  </th>
                  <th scope="col" className="pm-cell-num">
                    Cache read
                  </th>
                  <th scope="col" className="pm-cell-num">
                    Cache write
                  </th>
                  <th scope="col" className="pm-cell-num">
                    Cost
                  </th>
                  <th scope="col" className="pm-cell-num">
                    Sessions
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.bucket}>
                    <td>{row.label}</td>
                    <td className="pm-cell-num">{formatNumber(row.inputTokens)}</td>
                    <td className="pm-cell-num">{formatNumber(row.outputTokens)}</td>
                    <td className="pm-cell-num">{formatNumber(row.reasoningTokens)}</td>
                    <td className="pm-cell-num">{formatNumber(row.cacheReadTokens)}</td>
                    <td className="pm-cell-num">{formatNumber(row.cacheWriteTokens)}</td>
                    <td className="pm-cell-num">{formatCost(row.costTotal)}</td>
                    <td className="pm-cell-num">{formatNumber(row.sessionCount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </PanelState>
    </Panel>
  )
}

const AXIS_TICK = {
  fontSize: 10.5,
  fontFamily: 'var(--font-mono)',
  fill: 'var(--chart-axis)',
}

function formatCostAxis(value: number): string {
  if (value === 0) return '$0'
  if (value >= 0.01) return `$${value.toFixed(2)}`
  return `$${value.toFixed(3)}`
}

function ChartTooltipContent({
  active,
  payload,
}: Partial<TooltipContentProps<number, string>> & { chart: ChartMetric }) {
  if (!active || !payload || payload.length === 0) return null
  const row = payload[0]?.payload as ChartRow | undefined
  if (!row) return null

  return (
    <div className={styles.tooltip}>
      <p className={styles.tooltipTitle}>{row.label}</p>
      <dl className={styles.tooltipRows}>
        {TOKEN_SERIES.map((series) => (
          <div key={series.key} className={styles.tooltipRow}>
            <dt>
              <span
                className={styles.tooltipDot}
                style={{ backgroundColor: series.color }}
                aria-hidden="true"
              />
              {series.label}
            </dt>
            <dd>{formatNumber(row[series.key])}</dd>
          </div>
        ))}
        <div className={cn(styles.tooltipRow, styles.tooltipTotal)}>
          <dt>Total tokens</dt>
          <dd>{formatTokensExact(row.totalTokens)}</dd>
        </div>
        <div className={cn(styles.tooltipRow, styles.tooltipTotal)}>
          <dt>Cost</dt>
          <dd title={formatCostExact(row.costTotal)}>{formatCost(row.costTotal)}</dd>
        </div>
        <div className={styles.tooltipRow}>
          <dt>Sessions</dt>
          <dd>{formatNumber(row.sessionCount)}</dd>
        </div>
      </dl>
    </div>
  )
}

function ChartSkeleton() {
  return (
    <div className={styles.chartFrame} aria-hidden="true">
      <Skeleton lines={6} height={24} />
    </div>
  )
}
