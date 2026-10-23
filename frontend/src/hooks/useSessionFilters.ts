import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SessionSortField, SortDirection } from '../lib/api.types'
import type { RangeKey } from '../lib/dateRange'
import { rangeApiParams, rangeLabel } from '../lib/dateRange'
import {
  applyParamPatch,
  parseEnum,
  parseMinCost,
  parsePageSize,
  parsePositiveInt,
  readRangeState,
  withRange,
} from '../lib/searchParams'
import { useDebouncedValue } from './useDebouncedValue'

const SORTS: SessionSortField[] = ['lastActivity', 'started', 'cost', 'tokens', 'title']
const DIRECTIONS: SortDirection[] = ['asc', 'desc']

export function useSessionFilters() {
  const [searchParams, setSearchParams] = useSearchParams()

  const rangeState = readRangeState(searchParams, '30d')
  const range = rangeState.range
  const from = rangeState.from
  const to = rangeState.to

  const cwd = searchParams.get('cwd') ?? undefined
  const model = searchParams.get('model') ?? undefined
  const q = searchParams.get('q') ?? ''
  const minCost = parseMinCost(searchParams.get('minCost'))
  const sort = parseEnum(searchParams.get('sort'), SORTS, 'lastActivity')
  const dir = parseEnum(searchParams.get('dir'), DIRECTIONS, 'desc')
  const page = parsePositiveInt(searchParams.get('page'), 1)
  const pageSize = parsePageSize(searchParams.get('pageSize'))

  const [searchInput, setSearchInput] = useState(q)
  const debouncedSearch = useDebouncedValue(searchInput, 250)

  useEffect(() => {
    setSearchInput(q)
  }, [q])

  useEffect(() => {
    if (debouncedSearch === q) return
    setSearchParams(
      applyParamPatch(searchParams, { q: debouncedSearch || null, page: null }),
      { replace: true },
    )
  }, [debouncedSearch, q, searchParams, setSearchParams])

  const apiRange = useMemo(() => rangeApiParams(range, from, to), [range, from, to])

  const queryParams = useMemo(
    () => ({
      ...apiRange,
      ...(cwd ? { cwd } : {}),
      ...(model ? { model } : {}),
      ...(q ? { q, search: q } : {}),
      ...(minCost ? { minCost } : {}),
      sort,
      dir,
      page,
      pageSize,
    }),
    [apiRange, cwd, model, q, minCost, sort, dir, page, pageSize],
  )

  const patch = useCallback(
    (changes: Parameters<typeof applyParamPatch>[1]) => {
      setSearchParams(applyParamPatch(searchParams, changes))
    },
    [searchParams, setSearchParams],
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

  const setCwd = useCallback(
    (next?: string) => patch({ cwd: next ?? null, page: null }),
    [patch],
  )

  const setModel = useCallback(
    (next?: string) => patch({ model: next ?? null, page: null }),
    [patch],
  )

  const setMinCost = useCallback(
    (next?: string) => patch({ minCost: next ?? null, page: null }),
    [patch],
  )

  const clearSearch = useCallback(() => {
    setSearchInput('')
    patch({ q: null, page: null })
  }, [patch])

  const setSort = useCallback(
    (field: SessionSortField) => {
      const nextDir: SortDirection = sort === field && dir === 'desc' ? 'asc' : 'desc'
      patch({ sort: field === 'lastActivity' ? null : field, dir: nextDir, page: null })
    },
    [patch, sort, dir],
  )

  const setPage = useCallback(
    (next: number) => patch({ page: next <= 1 ? null : next }),
    [patch],
  )

  const setPageSize = useCallback(
    (next: 25 | 50 | 100) => patch({ pageSize: next === 25 ? null : next, page: null }),
    [patch],
  )

  const clearFilters = useCallback(() => {
    setSearchInput('')
    patch({
      cwd: null,
      model: null,
      q: null,
      minCost: null,
      sort: null,
      dir: null,
      page: null,
    })
  }, [patch])

  const hasFilters = Boolean(cwd || model || q || minCost)

  return {
    range,
    from,
    to,
    cwd,
    model,
    q,
    searchInput,
    minCost,
    sort,
    dir,
    page,
    pageSize,
    apiRange,
    queryParams,
    rangeLabel: rangeLabel(range, from, to),
    hasFilters,
    setSearchInput,
    clearSearch,
    setRange,
    setCustomRange,
    setCwd,
    setModel,
    setMinCost,
    setSort,
    setPage,
    setPageSize,
    clearFilters,
  }
}

export type SessionFilters = ReturnType<typeof useSessionFilters>
