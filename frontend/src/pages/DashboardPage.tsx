import { PageHeader } from '../components/PageHeader'
import { RefreshButton } from '../components/RefreshButton'
import { SyncStatus } from '../components/SyncStatus'
import { CostBreakdown } from '../components/dashboard/CostBreakdown'
import { DateRangeSelector } from '../components/dashboard/DateRangeSelector'
import { MetricStrip } from '../components/dashboard/MetricStrip'
import { ModelBreakdown } from '../components/dashboard/ModelBreakdown'
import { ProjectBreakdown } from '../components/dashboard/ProjectBreakdown'
import { RecentSessions } from '../components/dashboard/RecentSessions'
import { SummaryHero } from '../components/dashboard/SummaryHero'
import { UsageChart } from '../components/dashboard/UsageChart'
import { EmptyState } from '../components/EmptyState'
import { FilterChips } from '../components/sessions/FilterChips'
import { useDashboardFilters } from '../hooks/useDashboardFilters'
import { useHealth } from '../hooks/useHealth'
import { useModelBreakdown } from '../hooks/useModelBreakdown'
import { useProjectBreakdown } from '../hooks/useProjectBreakdown'
import { useSessions } from '../hooks/useSessions'
import { useSummary } from '../hooks/useSummary'
import { useUsageTimeseries } from '../hooks/useUsageTimeseries'
import { projectSlug } from '../lib/format'
import styles from './DashboardPage.module.css'

function messageOf(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

export function DashboardPage() {
  const filters = useDashboardFilters()
  const health = useHealth()

  const summary = useSummary(filters.queryParams)
  const timeseries = useUsageTimeseries({
    ...filters.apiRange,
    groupBy: filters.groupBy,
    cwd: filters.cwd,
    model: filters.model,
  })
  const models = useModelBreakdown({ ...filters.apiRange, cwd: filters.cwd })
  const projects = useProjectBreakdown({ ...filters.apiRange, model: filters.model })
  const recent = useSessions({
    ...filters.apiRange,
    cwd: filters.cwd,
    model: filters.model,
    sort: 'lastActivity',
    dir: 'desc',
    page: 1,
    pageSize: 6,
  })

  const rangeState = { range: filters.range, from: filters.from, to: filters.to }
  const isGlobalEmpty =
    summary.data !== undefined && summary.data.sessionCount === 0 && !filters.hasFilters

  const chips = [
    ...(filters.cwd
      ? [
          {
            key: 'cwd',
            label: 'Project',
            value: projectSlug(filters.cwd),
            onRemove: () => filters.setCwd(undefined),
          },
        ]
      : []),
    ...(filters.model
      ? [
          {
            key: 'model',
            label: 'Model',
            value: filters.model,
            onRemove: () => filters.setModel(undefined),
          },
        ]
      : []),
  ]

  return (
    <div className={styles.page}>
      <PageHeader
        title="Usage overview"
        meta={health.data?.sessionsDirectory ?? 'Local Pi session index'}
        actions={
          <>
            <SyncStatus />
            <DateRangeSelector
              range={filters.range}
              from={filters.from}
              to={filters.to}
              onChange={filters.setRange}
              onCustomRange={filters.setCustomRange}
            />
            <RefreshButton />
          </>
        }
      />

      {chips.length > 0 && (
        <FilterChips chips={chips} onClearAll={filters.clearFilters} />
      )}

      {isGlobalEmpty ? (
        <div className={styles.empty}>
          <EmptyState
            eyebrow="No sessions indexed"
            title="No Pi sessions found yet"
            description={
              <>
                Pi Meter reads session files from{' '}
                <code>{health.data?.sessionsDirectory ?? '~/.pi/agent/sessions'}</code>. Add
                sessions there, then refresh the local index.
              </>
            }
            action={<RefreshButton label="Refresh index" />}
          />
        </div>
      ) : (
        <div className={styles.grid}>
          <div className={styles.hero}>
            <SummaryHero
              summary={summary.data}
              rangeLabel={filters.rangeLabel}
              isLoading={summary.isPending}
              isError={summary.isError}
              errorMessage={messageOf(summary.error)}
              onRetry={() => void summary.refetch()}
            />
          </div>

          <div className={styles.composition}>
            <CostBreakdown
              summary={summary.data}
              rangeLabel={filters.rangeLabel}
              isLoading={summary.isPending}
              isError={summary.isError}
              errorMessage={messageOf(summary.error)}
              onRetry={() => void summary.refetch()}
            />
          </div>

          <div className={styles.metrics}>
            <MetricStrip summary={summary.data} isLoading={summary.isPending} />
          </div>

          <div className={styles.chart}>
            <UsageChart
              points={timeseries.data}
              chart={filters.chart}
              groupBy={filters.groupBy}
              rangeLabel={filters.rangeLabel}
              timezone={summary.data?.timezone}
              isLoading={timeseries.isPending}
              isError={timeseries.isError}
              errorMessage={messageOf(timeseries.error)}
              onChartChange={filters.setChart}
              onRetry={() => void timeseries.refetch()}
            />
          </div>

          <div className={styles.model}>
            <ModelBreakdown
              rows={models.data}
              range={rangeState}
              isLoading={models.isPending}
              isError={models.isError}
              errorMessage={messageOf(models.error)}
              onRetry={() => void models.refetch()}
            />
          </div>

          <div className={styles.project}>
            <ProjectBreakdown
              rows={projects.data}
              range={rangeState}
              isLoading={projects.isPending}
              isError={projects.isError}
              errorMessage={messageOf(projects.error)}
              onRetry={() => void projects.refetch()}
            />
          </div>

          <div className={styles.recent}>
            <RecentSessions
              data={recent.data}
              range={rangeState}
              isLoading={recent.isPending}
              isError={recent.isError}
              errorMessage={messageOf(recent.error)}
              onRetry={() => void recent.refetch()}
            />
          </div>
        </div>
      )}
    </div>
  )
}
