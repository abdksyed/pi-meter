import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ChartMetric } from '../lib/api.types'
import type { GroupBy, RangeKey } from '../lib/dateRange'
import { rangeApiParams, rangeLabel } from '../lib/dateRange'
import { applyParamPatch, readGroupBy, readRangeState, withRange } from '../lib/searchParams'

const CHARTS: ChartMetric[] = ['cost', 'tokens']

export function useDashboardFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const rangeState = readRangeState(searchParams, '7d')
  const range = rangeState.range
  const from = rangeState.from
  const to = rangeState.to

  const chart: ChartMetric = searchParams.get('chart') === 'tokens' ? 'tokens' : 'cost'
  const groupBy = readGroupBy(searchParams, range, from, to)
  const cwd = searchParams.get('cwd') ?? undefined
  const model = searchParams.get('model') ?? undefined

  const apiRange = useMemo(() => rangeApiParams(range, from, to), [range, from, to])
  const queryParams = useMemo(
    () => ({ ...apiRange, ...(cwd ? { cwd } : {}), ...(model ? { model } : {}) }),
    [apiRange, cwd, model],
  )

  const setRange = useCallback(
    (next: RangeKey) => {
      setSearchParams(withRange(searchParams, { range: next }))
    },
    [searchParams, setSearchParams],
  )

  const setCustomRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      setSearchParams(withRange(searchParams, { range: 'custom', from: nextFrom, to: nextTo }))
    },
    [searchParams, setSearchParams],
  )

  const setChart = useCallback(
    (next: ChartMetric) => {
      setSearchParams(applyParamPatch(searchParams, { chart: next === 'cost' ? null : next }), {
        replace: true,
      })
    },
    [searchParams, setSearchParams],
  )

  const setGroup = useCallback(
    (next: GroupBy) => {
      setSearchParams(applyParamPatch(searchParams, { group: next }))
    },
    [searchParams, setSearchParams],
  )

  const setCwd = useCallback(
    (next?: string) => {
      setSearchParams(applyParamPatch(searchParams, { cwd: next ?? null }))
    },
    [searchParams, setSearchParams],
  )

  const setModel = useCallback(
    (next?: string) => {
      setSearchParams(applyParamPatch(searchParams, { model: next ?? null }))
    },
    [searchParams, setSearchParams],
  )

  const clearFilters = useCallback(() => {
    setSearchParams(applyParamPatch(searchParams, { cwd: null, model: null }))
  }, [searchParams, setSearchParams])

  return {
    range,
    from,
    to,
    chart,
    groupBy: groupBy as GroupBy,
    cwd,
    model,
    apiRange,
    queryParams,
    rangeLabel: rangeLabel(range, from, to),
    hasFilters: Boolean(cwd || model),
    setRange,
    setCustomRange,
    setChart,
    setGroup,
    setCwd,
    setModel,
    clearFilters,
  }
}

export type DashboardFilters = ReturnType<typeof useDashboardFilters>

export { CHARTS }
