/**
 * URL-backed filter hooks for the dashboard and sessions list.
 * Covers defaults, URL parsing, reset behaviour and debounced search sync.
 */

import { describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useSearchParams } from 'react-router-dom'

import { useDashboardFilters } from './useDashboardFilters'
import { useSessionFilters } from './useSessionFilters'
import { wrapperFor } from '../test/helpers'

/** Mount a hook and expose the live query string alongside its state. */
function renderDashboard(route = '/') {
  return renderHook(
    () => {
      const [params] = useSearchParams()
      return { ...useDashboardFilters(), params: params.toString() }
    },
    { wrapper: wrapperFor(undefined, route) },
  )
}

function renderSessionFilters(route = '/sessions') {
  return renderHook(
    () => {
      const [params] = useSearchParams()
      return { ...useSessionFilters(), params: params.toString() }
    },
    { wrapper: wrapperFor(undefined, route) },
  )
}

describe('useDashboardFilters', () => {
  it('defaults to the 7-day range, cost chart and daily buckets', () => {
    const { result } = renderDashboard()
    expect(result.current.range).toBe('7d')
    expect(result.current.chart).toBe('cost')
    expect(result.current.groupBy).toBe('day')
    expect(result.current.hasFilters).toBe(false)
    expect(result.current.rangeLabel).toBe('Last 7 days')
    expect(result.current.queryParams).toEqual({ range: '7d' })
  })

  it('parses range, chart, group and filters from the URL', () => {
    const { result } = renderDashboard(
      '/?range=30d&chart=tokens&group=week&cwd=%2Fwork%2Falpha&model=gpt-5.1',
    )
    expect(result.current.range).toBe('30d')
    expect(result.current.chart).toBe('tokens')
    expect(result.current.groupBy).toBe('week')
    expect(result.current.cwd).toBe('/work/alpha')
    expect(result.current.model).toBe('gpt-5.1')
    expect(result.current.hasFilters).toBe(true)
    expect(result.current.queryParams).toEqual({
      range: '30d',
      cwd: '/work/alpha',
      model: 'gpt-5.1',
    })
  })

  it('falls back to defaults for invalid values', () => {
    const { result } = renderDashboard('/?range=nope&group=year&chart=banana')
    expect(result.current.range).toBe('7d')
    expect(result.current.groupBy).toBe('day')
    expect(result.current.chart).toBe('cost')
  })

  it('reads a valid custom range and derives its payload and grouping', () => {
    const { result } = renderDashboard('/?range=custom&from=2026-01-01&to=2026-01-15')
    expect(result.current.range).toBe('custom')
    expect(result.current.apiRange).toEqual({
      range: 'custom',
      from: '2026-01-01',
      to: '2026-01-15',
    })
    expect(result.current.groupBy).toBe('day')
    expect(result.current.rangeLabel).toMatch(/–/)
  })

  it('ignores an invalid custom range', () => {
    const { result } = renderDashboard('/?range=custom&from=2026-01-15')
    expect(result.current.range).toBe('7d')
    expect(result.current.apiRange).toEqual({ range: '7d' })
  })

  it('writes range changes to the URL and drops stale group/custom bounds', () => {
    const { result } = renderDashboard('/?range=custom&from=2026-01-01&to=2026-01-15&group=day')
    act(() => result.current.setRange('30d'))

    const params = new URLSearchParams(result.current.params)
    expect(params.get('range')).toBe('30d')
    expect(params.has('from')).toBe(false)
    expect(params.has('to')).toBe(false)
    expect(params.has('group')).toBe(false)
    expect(result.current.range).toBe('30d')
  })

  it('writes custom ranges', () => {
    const { result } = renderDashboard()
    act(() => result.current.setCustomRange('2026-01-01', '2026-01-05'))
    const params = new URLSearchParams(result.current.params)
    expect(params.get('range')).toBe('custom')
    expect(params.get('from')).toBe('2026-01-01')
    expect(params.get('to')).toBe('2026-01-05')
  })

  it('sets the chart and omits the default cost value', () => {
    const { result } = renderDashboard()
    act(() => result.current.setChart('tokens'))
    expect(new URLSearchParams(result.current.params).get('chart')).toBe('tokens')
    expect(result.current.chart).toBe('tokens')

    act(() => result.current.setChart('cost'))
    expect(new URLSearchParams(result.current.params).has('chart')).toBe(false)
    expect(result.current.chart).toBe('cost')
  })

  it('sets the grouping', () => {
    const { result } = renderDashboard()
    act(() => result.current.setGroup('month'))
    expect(result.current.groupBy).toBe('month')
  })

  it('sets and clears cwd/model filters', () => {
    const { result } = renderDashboard()
    act(() => result.current.setCwd('/work/beta'))
    act(() => result.current.setModel('gpt-5.1'))
    expect(result.current.cwd).toBe('/work/beta')
    expect(result.current.model).toBe('gpt-5.1')
    expect(result.current.hasFilters).toBe(true)

    act(() => result.current.clearFilters())
    expect(result.current.cwd).toBeUndefined()
    expect(result.current.model).toBeUndefined()
    expect(result.current.hasFilters).toBe(false)
    expect(new URLSearchParams(result.current.params).has('cwd')).toBe(false)
  })
})

describe('useSessionFilters', () => {
  it('defaults to 30 days, last-activity sort and page 1', () => {
    const { result } = renderSessionFilters()
    expect(result.current.range).toBe('30d')
    expect(result.current.sort).toBe('lastActivity')
    expect(result.current.dir).toBe('desc')
    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(25)
    expect(result.current.q).toBe('')
    expect(result.current.hasFilters).toBe(false)
    expect(result.current.queryParams).toEqual({
      range: '30d',
      sort: 'lastActivity',
      dir: 'desc',
      page: 1,
      pageSize: 25,
    })
  })

  it('parses filters, sorting and paging from the URL', () => {
    const { result } = renderSessionFilters(
      '/sessions?range=7d&cwd=%2Fwork%2Falpha&model=gpt-5.1&q=parser&minCost=0.5&sort=cost&dir=asc&page=3&pageSize=50',
    )
    expect(result.current).toMatchObject({
      range: '7d',
      cwd: '/work/alpha',
      model: 'gpt-5.1',
      q: 'parser',
      searchInput: 'parser',
      minCost: '0.5',
      sort: 'cost',
      dir: 'asc',
      page: 3,
      pageSize: 50,
      hasFilters: true,
    })
    expect(result.current.queryParams).toEqual({
      range: '7d',
      cwd: '/work/alpha',
      model: 'gpt-5.1',
      q: 'parser',
      search: 'parser',
      minCost: '0.5',
      sort: 'cost',
      dir: 'asc',
      page: 3,
      pageSize: 50,
    })
  })

  it('ignores invalid sort dir, page, page size and min cost values', () => {
    const { result } = renderSessionFilters('/sessions?sort=nope&dir=sideways&page=-4&pageSize=7&minCost=abc')
    expect(result.current.sort).toBe('lastActivity')
    expect(result.current.dir).toBe('desc')
    expect(result.current.page).toBe(1)
    expect(result.current.pageSize).toBe(25)
    expect(result.current.minCost).toBeUndefined()
    expect(result.current.hasFilters).toBe(false)
  })

  it('debounces search input into the URL and resets the page', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderSessionFilters('/sessions?page=4')

    act(() => result.current.setSearchInput('parser'))
    expect(result.current.searchInput).toBe('parser')
    // Not committed yet.
    expect(new URLSearchParams(result.current.params).has('q')).toBe(false)

    act(() => {
      vi.advanceTimersByTime(250)
    })
    const params = new URLSearchParams(result.current.params)
    expect(params.get('q')).toBe('parser')
    expect(params.has('page')).toBe(false)
  })

  // Known defect D4 (`SessionsPage.test.tsx` holds the product-level failing
  // regressions): `useSessionFilters` keeps a pending debounced value that is
  // older than the URL, so the effect below re-writes stale query text after a
  // clear and can also drop an externally-set query. The assertions here pin
  // down the current hook behaviour so the fix is visible in one place.
  it('documents D4: stale debounced text survives clearSearch', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderSessionFilters('/sessions?q=parser&page=2')

    act(() => result.current.clearSearch())
    const params = new URLSearchParams(result.current.params)
    // `page` is reset by the patch...
    expect(params.has('page')).toBe(false)
    // ...but the stale debounce puts the cleared query straight back.
    expect(params.get('q')).toBe('parser')
    expect(result.current.q).toBe('parser')
    expect(result.current.searchInput).toBe('parser')
  })

  it('documents D4: clearing filters keeps the stale query text', () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { result } = renderSessionFilters(
      '/sessions?cwd=%2Fwork%2Falpha&model=gpt-5.1&q=parser&minCost=1&sort=cost&dir=asc&page=2',
    )

    act(() => result.current.clearFilters())
    const params = new URLSearchParams(result.current.params)
    for (const key of ['cwd', 'model', 'minCost', 'sort', 'dir', 'page']) {
      expect(params.has(key)).toBe(false)
    }
    expect(params.get('q')).toBe('parser')
    expect(result.current.searchInput).toBe('parser')
  })

  it('hydrates the search box from the URL on mount', () => {
    const { result } = renderSessionFilters('/sessions?q=migration')
    expect(result.current.searchInput).toBe('migration')
    expect(result.current.q).toBe('migration')
    expect(result.current.hasFilters).toBe(true)
  })

  it('toggles sort direction for the same field and switches fields', () => {
    const { result } = renderSessionFilters()

    // Switching fields keeps the current direction (desc).
    act(() => result.current.setSort('cost'))
    expect(result.current.sort).toBe('cost')
    expect(result.current.dir).toBe('desc')

    // Pressing the same field toggles the direction.
    act(() => result.current.setSort('cost'))
    expect(result.current.dir).toBe('asc')

    act(() => result.current.setSort('lastActivity'))
    expect(result.current.sort).toBe('lastActivity')
    // The default sort is dropped from the URL.
    expect(new URLSearchParams(result.current.params).has('sort')).toBe(false)
  })

  it('writes page and page size while trimming defaults', () => {
    const { result } = renderSessionFilters('/sessions?page=3')

    act(() => result.current.setPage(1))
    expect(result.current.page).toBe(1)
    expect(new URLSearchParams(result.current.params).has('page')).toBe(false)

    act(() => result.current.setPage(5))
    expect(result.current.page).toBe(5)

    act(() => result.current.setPageSize(100))
    expect(result.current.pageSize).toBe(100)
    expect(new URLSearchParams(result.current.params).has('page')).toBe(false)

    act(() => result.current.setPageSize(25))
    expect(result.current.pageSize).toBe(25)
    expect(new URLSearchParams(result.current.params).has('pageSize')).toBe(false)
  })

  it('sets cwd, model and min cost filters and resets the page', () => {
    const { result } = renderSessionFilters('/sessions?page=2')

    act(() => result.current.setCwd('/work/beta'))
    expect(result.current.cwd).toBe('/work/beta')
    expect(result.current.page).toBe(1)

    act(() => result.current.setModel('gpt-5.1'))
    expect(result.current.model).toBe('gpt-5.1')

    act(() => result.current.setMinCost('0.25'))
    expect(result.current.minCost).toBe('0.25')
    expect(result.current.queryParams.minCost).toBe('0.25')

    act(() => result.current.setCwd(undefined))
    expect(result.current.cwd).toBeUndefined()
  })

  it('writes ranges and custom ranges', () => {
    const { result } = renderSessionFilters('/sessions?range=30d')

    act(() => result.current.setRange('all'))
    expect(result.current.range).toBe('all')
    expect(new URLSearchParams(result.current.params).get('range')).toBe('all')

    act(() => result.current.setCustomRange('2026-01-01', '2026-01-10'))
    const params = new URLSearchParams(result.current.params)
    expect(params.get('from')).toBe('2026-01-01')
    expect(params.get('to')).toBe('2026-01-10')
  })
})
