import { useEffect } from 'react'
import { PageHeader } from '../components/PageHeader'
import { RefreshButton } from '../components/RefreshButton'
import { SyncStatus } from '../components/SyncStatus'
import { EmptyState } from '../components/EmptyState'
import { Pagination } from '../components/sessions/Pagination'
import { SessionFilters } from '../components/sessions/SessionFilters'
import { SessionList } from '../components/sessions/SessionList'
import { SessionTable } from '../components/sessions/SessionTable'
import { SessionsSummary } from '../components/sessions/SessionsSummary'
import { useFilters } from '../hooks/useFilters'
import { useHealth } from '../hooks/useHealth'
import { useMediaQuery } from '../hooks/useMediaQuery'
import { useProjectBreakdown } from '../hooks/useProjectBreakdown'
import { useSessionFilters } from '../hooks/useSessionFilters'
import { useSessions } from '../hooks/useSessions'
import { useSummary } from '../hooks/useSummary'
import styles from './SessionsPage.module.css'

function messageOf(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined
}

export function SessionsPage() {
  const filters = useSessionFilters()
  const filtersData = useFilters()
  const health = useHealth()
  const sessions = useSessions(filters.queryParams)
  const summary = useSummary({
    ...filters.apiRange,
    cwd: filters.cwd,
    model: filters.model,
  })
  const projects = useProjectBreakdown({ ...filters.apiRange, model: filters.model })
  const isMobile = useMediaQuery('(max-width: 899px)')

  useEffect(() => {
    if (sessions.data && sessions.data.totalPages > 0 && filters.page > sessions.data.totalPages) {
      filters.setPage(sessions.data.totalPages)
    }
  }, [sessions.data, filters.page, filters.setPage])

  const total = sessions.data?.total
  const isEmptyIndex = filtersData.data?.sessionCount === 0
  const isFiltered = filters.hasFilters

  return (
    <div className={styles.page}>
      <PageHeader
        title="Sessions"
        count={total !== undefined ? `${total.toLocaleString()} sessions` : undefined}
        meta={health.data?.sessionsDirectory ?? 'Local Pi session index'}
        actions={
          <>
            <SyncStatus />
            <RefreshButton />
          </>
        }
      />

      <SessionFilters
        range={filters.range}
        from={filters.from}
        to={filters.to}
        cwd={filters.cwd}
        model={filters.model}
        searchInput={filters.searchInput}
        minCost={filters.minCost}
        filtersData={filtersData.data}
        resultCount={total}
        hasFilters={isFiltered}
        onChangeRange={filters.setRange}
        onChangeCustomRange={filters.setCustomRange}
        onChangeCwd={filters.setCwd}
        onChangeModel={filters.setModel}
        onChangeSearch={filters.setSearchInput}
        onClearSearch={filters.clearSearch}
        onChangeMinCost={filters.setMinCost}
        onClearFilters={filters.clearFilters}
      />

      {isEmptyIndex ? (
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
        <div className={styles.layout}>
          <div className={styles.summary}>
            <SessionsSummary
              data={sessions.data}
              summary={summary.data}
              projects={projects.data}
              rangeLabel={filters.rangeLabel}
              cwd={filters.cwd}
              isLoading={sessions.isPending || summary.isPending}
            />
          </div>

          <div className={styles.main}>
            {isMobile ? (
              <SessionList
                data={sessions.data}
                isFiltered={isFiltered}
                isLoading={sessions.isPending}
                isError={sessions.isError}
                errorMessage={messageOf(sessions.error)}
                onRetry={() => void sessions.refetch()}
                onClearFilters={filters.clearFilters}
              />
            ) : (
              <SessionTable
                data={sessions.data}
                sort={filters.sort}
                dir={filters.dir}
                isFiltered={isFiltered}
                isLoading={sessions.isPending}
                isError={sessions.isError}
                errorMessage={messageOf(sessions.error)}
                onRetry={() => void sessions.refetch()}
                onSort={filters.setSort}
                onClearFilters={filters.clearFilters}
              />
            )}

            <Pagination
              page={sessions.data?.page ?? filters.page}
              totalPages={sessions.data?.totalPages ?? 1}
              total={sessions.data?.total ?? 0}
              pageSize={filters.pageSize}
              onPage={filters.setPage}
              onPageSize={filters.setPageSize}
              isLoading={sessions.isFetching}
            />
          </div>
        </div>
      )}
    </div>
  )
}
