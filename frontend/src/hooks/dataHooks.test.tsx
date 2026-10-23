/**
 * Query hooks: request parameters, normalization, loading/error states and the
 * absence of any polling (data changes only after a manual refresh).
 */

import { describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'

import {
  FIXTURE_NOW,
  filtersFixture,
  healthFixture,
  modelBreakdownFixture,
  projectBreakdownFixture,
  sessionsResponseFixture,
  summaryFixture,
  timeseriesFixture,
} from '../test/fixtures'
import { createTestQueryClient, deferred, jsonResponse, mockApi, wrapperFor } from '../test/helpers'
import { useHealth } from './useHealth'
import { useSummary } from './useSummary'
import { useUsageTimeseries } from './useUsageTimeseries'
import { useModelBreakdown } from './useModelBreakdown'
import { useProjectBreakdown } from './useProjectBreakdown'
import { useSessions } from './useSessions'
import { useFilters } from './useFilters'
import { useRefresh } from './useRefresh'
import { queryKeys } from '../lib/queryKeys'

describe('useHealth', () => {
  it('loads and normalizes /api/health', async () => {
    const api = mockApi({ 'GET /api/health': healthFixture() })
    const { result } = renderHook(() => useHealth(), { wrapper: wrapperFor() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toEqual(healthFixture())
    expect(api.calls).toHaveLength(1)
  })

  it('surfaces an ApiError when the endpoint fails', async () => {
    mockApi({ 'GET /api/health': jsonResponse({ detail: 'database unavailable' }, 500) })
    const { result } = renderHook(() => useHealth(), { wrapper: wrapperFor() })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(result.current.error).toMatchObject({ status: 500, message: 'database unavailable' })
  })
})

describe('useSummary', () => {
  it('sends range params and caches under the query key', async () => {
    const api = mockApi({ 'GET /api/summary': summaryFixture() })
    const queryClient = createTestQueryClient()
    const params = { range: '7d' as const, cwd: '/work/alpha' }
    const { result } = renderHook(() => useSummary(params), { wrapper: wrapperFor(queryClient) })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const url = new URL(api.calls[0].url)
    expect(url.searchParams.get('range')).toBe('7d')
    expect(url.searchParams.get('cwd')).toBe('/work/alpha')
    expect(queryClient.getQueryData(queryKeys.summary(params))).toEqual(summaryFixture())
  })

  it('shows an empty-range payload without erroring', async () => {
    mockApi({ 'GET /api/summary': summaryFixture({ sessionCount: 0, costTotal: 0, totalTokens: 0, mostUsedModel: null }) })
    const { result } = renderHook(() => useSummary({ range: 'today' }), { wrapper: wrapperFor() })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.sessionCount).toBe(0)
    expect(result.current.data?.mostUsedModel).toBeNull()
  })
})

describe('range breakdown hooks', () => {
  it('loads timeseries with the grouping params', async () => {
    const api = mockApi({ 'GET /api/usage/timeseries': timeseriesFixture() })
    const { result } = renderHook(
      () => useUsageTimeseries({ range: '30d', groupBy: 'day' }),
      { wrapper: wrapperFor() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(2)
    expect(new URL(api.calls[0].url).searchParams.get('groupBy')).toBe('day')
  })

  it('loads model breakdown', async () => {
    mockApi({ 'GET /api/usage/by-model': modelBreakdownFixture() })
    const { result } = renderHook(() => useModelBreakdown({ range: '7d' }), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.map((row) => row.model)).toEqual(['claude-sonnet-4-5', 'gpt-5.1'])
  })

  it('loads project breakdown', async () => {
    mockApi({ 'GET /api/usage/by-project': projectBreakdownFixture() })
    const { result } = renderHook(() => useProjectBreakdown({ range: 'all' }), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.[0].cwd).toBe('/work/alpha')
  })

  it('keeps previous data while a new range loads', async () => {
    const second = deferred<unknown>()
    let call = 0
    const api = mockApi({
      'GET /api/usage/by-project': () => {
        call += 1
        if (call === 1) return projectBreakdownFixture()
        return second.promise as Promise<Response>
      },
    })
    const queryClient = createTestQueryClient()
    const { result, rerender } = renderHook(
      ({ range }: { range: '7d' | '30d' }) => useProjectBreakdown({ range }),
      { wrapper: wrapperFor(queryClient), initialProps: { range: '7d' } as { range: '7d' | '30d' } },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))

    rerender({ range: '30d' })
    await waitFor(() => expect(result.current.isFetching).toBe(true))
    // Placeholder data survives the transition instead of flashing empty.
    expect(result.current.data).toEqual(projectBreakdownFixture())
    expect(api.calls).toHaveLength(2)
  })
})

describe('useSessions', () => {
  it('sends paging, sorting and search params', async () => {
    const api = mockApi({ 'GET /api/sessions': sessionsResponseFixture() })
    const { result } = renderHook(
      () => useSessions({ range: '30d', q: 'parser', sort: 'cost', dir: 'desc', page: 2, pageSize: 50 }),
      { wrapper: wrapperFor() },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    const params = new URL(api.calls[0].url).searchParams
    expect(params.get('q')).toBe('parser')
    expect(params.get('sort')).toBe('cost')
    expect(params.get('dir')).toBe('desc')
    expect(params.get('page')).toBe('2')
    expect(params.get('pageSize')).toBe('50')
  })

  it('exposes the derived totals and paging metadata', async () => {
    mockApi({ 'GET /api/sessions': sessionsResponseFixture() })
    const { result } = renderHook(() => useSessions({ range: '30d' }), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.totals.costTotal).toBe(0.019409)
    expect(result.current.data?.totalPages).toBe(1)
    expect(result.current.data?.items).toHaveLength(1)
  })
})

describe('useFilters', () => {
  it('loads filter options', async () => {
    mockApi({ 'GET /api/filters': filtersFixture() })
    const { result } = renderHook(() => useFilters(), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.workingDirectories).toHaveLength(2)
    expect(result.current.data?.dateBounds.maxLastActivityAt).toBe('2026-01-15T09:02:40.000Z')
  })
})

describe('useRefresh', () => {
  it('posts /api/refresh and invalidates every cached query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = mockApi({
      'GET /api/summary': summaryFixture(),
      'GET /api/health': healthFixture(),
      'POST /api/refresh': {
        filesSeen: 3,
        filesAdded: 1,
        filesUpdated: 1,
        filesRemoved: 0,
        filesFailed: 0,
        durationMs: 42,
      },
    })
    const queryClient = createTestQueryClient()
    const wrapper = wrapperFor(queryClient)

    const summary = renderHook(() => useSummary({ range: '7d' }), { wrapper })
    await waitFor(() => expect(summary.result.current.isSuccess).toBe(true))
    expect(api.calls).toHaveLength(1)

    const refresh = renderHook(() => useRefresh(), { wrapper })
    await act(async () => {
      await refresh.result.current.mutateAsync({})
    })

    // The mutation invalidates caches, so the summary is refetched exactly once.
    await waitFor(() => expect(api.calls.filter((call) => call.method === 'POST')).toHaveLength(1))
    await waitFor(() => expect(api.calls.filter((call) => call.url.includes('/api/summary'))).toHaveLength(2))
    expect(queryClient.getQueryState(queryKeys.summary({ range: '7d' }))?.isInvalidated).toBe(false)
  })

  it('never polls: data only changes after a manual refresh', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = mockApi({ 'GET /api/health': healthFixture() })
    const { result } = renderHook(() => useHealth(), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(api.calls).toHaveLength(1)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 60_000)
    })
    expect(api.calls).toHaveLength(1)
  })
})
