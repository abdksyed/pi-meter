/**
 * Smoke checks for the shared frontend test infrastructure (Worker 1).
 *
 * Proves that `src/test/setup.ts`, `src/test/helpers.tsx` and
 * `src/test/fixtures.ts` work in jsdom before the component workers rely on
 * them. Feature behaviour is intentionally *not* covered here.
 */

import { describe, expect, it, vi } from 'vitest'
import { renderHook, screen, waitFor } from '@testing-library/react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'

import {
  createTestQueryClient,
  deferred,
  jsonResponse,
  mockApi,
  renderAppRoutes,
  renderWithProviders,
  renderWithRoute,
  wrapperFor,
} from './helpers'
import {
  FIXTURE_NOW,
  SESSION_IDS,
  filtersFixture,
  healthFixture,
  modelBreakdownFixture,
  normalizedSessionDetailFixture,
  projectBreakdownFixture,
  rawSessionDetail,
  sessionListItemFixture,
  sessionsResponseFixture,
  summaryFixture,
  timeseriesFixture,
} from './fixtures'
import { queryKeys } from '../lib/queryKeys'
import { apiGet } from '../lib/api'
import { normalizeSessionDetail } from '../lib/normalize'

function Probe() {
  return <p>probe rendered</p>
}

function ParamsProbe() {
  const { sessionId } = useParams()
  return <p>session {sessionId}</p>
}

describe('render helpers', () => {
  it('provides a query client and user-event instance', () => {
    const view = renderWithProviders(<Probe />)
    expect(view.queryClient).toBeDefined()
    expect(screen.getByText('probe rendered')).toBeInTheDocument()
  })

  it('mounts an element at a route pattern with useParams', () => {
    renderWithRoute(<ParamsProbe />, {
      path: '/sessions/:sessionId',
      route: `/sessions/${SESSION_IDS.main}`,
    })
    expect(screen.getByText(`session ${SESSION_IDS.main}`)).toBeInTheDocument()
  })

  it('renders a full route table through a memory router', () => {
    renderAppRoutes(
      [
        { path: '/', element: <Probe /> },
        { path: '/sessions/:sessionId', element: <ParamsProbe /> },
      ],
      { route: `/sessions/${SESSION_IDS.beta}` },
    )
    expect(screen.getByText(`session ${SESSION_IDS.beta}`)).toBeInTheDocument()
  })

  it('creates isolated query clients per call', () => {
    expect(createTestQueryClient()).not.toBe(createTestQueryClient())
  })
})

describe('mockApi', () => {
  it('matches by method and path prefix, including query strings', async () => {
    const api = mockApi({ 'GET /api/summary': summaryFixture() })
    const result = await apiGet<{ totalTokens: number }>('/summary', { range: '7d' })
    expect(result.totalTokens).toBe(summaryFixture().totalTokens)
    api.expectCalled('GET /api/summary')
    expect(api.calls[0].url).toContain('/api/summary?range=7d')
  })

  it('supports function handlers and explicit responses', async () => {
    const api = mockApi({
      'GET /api/health': () => jsonResponse(healthFixture(), 200),
      'POST /api/refresh': () => jsonResponse({ filesSeen: 2 }, 200),
    })
    expect(await apiGet('/health')).toEqual(healthFixture())
    api.expectCalled('GET /api/health')
  })

  it('rejects unexpected requests', async () => {
    const api = mockApi({ 'GET /api/summary': summaryFixture() })
    // lib/api.ts normalizes transport errors, so the cause is the fetch mock.
    await expect(apiGet('/sessions')).rejects.toThrow('Could not reach the local Pi Meter server.')
    expect(api.calls.map((request) => new URL(request.url).pathname)).toContain('/api/sessions')
  })
})

describe('query helpers', () => {
  it('wraps a hook and resolves deferred data', async () => {
    const pending = deferred<Response>()
    mockApi({ 'GET /api/summary': () => pending.promise })

    const { result } = renderHook(
      () =>
        useQuery({
          queryKey: queryKeys.summary({ range: '7d' }),
          queryFn: () => apiGet<{ value: number }>('/summary', { range: '7d' }),
        }),
      { wrapper: wrapperFor(createTestQueryClient()) },
    )

    expect(result.current.isLoading).toBe(true)
    pending.resolve(jsonResponse({ value: 42 }))
    await waitFor(() => expect(result.current.data).toEqual({ value: 42 }))
  })
})

describe('fixtures', () => {
  it('keeps summary cost and token totals self-consistent', () => {
    const summary = summaryFixture()
    expect(
      summary.inputTokens +
        summary.outputTokens +
        summary.cacheReadTokens +
        summary.cacheWriteTokens,
    ).toBe(summary.totalTokens)
    // The synthetic corpus contains one record whose recorded total differs from
    // its components, so `costTotal` is the recorded total (0.019409) while the
    // component sum is 0.018970. Both are intentional and documented.
    expect(
      summary.costInput + summary.costOutput + summary.costCacheRead + summary.costCacheWrite,
    ).toBeCloseTo(0.01897, 10)
    expect(summary.costTotal).toBeCloseTo(0.019409, 10)
  })

  it('keeps session list and sessions response aligned', () => {
    const sessions = sessionsResponseFixture()
    const item = sessionListItemFixture()
    expect(sessions.items[0]).toEqual(item)
    expect(sessions.totals.costTotal).toBeCloseTo(item.costTotal, 10)
    expect(sessions.totals.totalTokens).toBe(item.totalTokens)
  })

  it('provides breakdowns, filters and a deterministic clock value', () => {
    expect(timeseriesFixture()).toHaveLength(2)
    expect(timeseriesFixture()[1].totalTokens).toBe(summaryFixture().totalTokens)
    expect(modelBreakdownFixture()).toHaveLength(2)
    expect(projectBreakdownFixture()).toHaveLength(2)
    expect(filtersFixture().sessionCount).toBe(2)
    expect(vi.isFakeTimers()).toBe(false)
    expect(Date.parse(FIXTURE_NOW)).toBe(1768467600000)
  })

  it('normalizes the raw detail payload into the component contract', () => {
    const detail = normalizeSessionDetail(rawSessionDetail())
    expect(detail.session.sessionId).toBe(SESSION_IDS.main)
    expect(detail.entries).toHaveLength(5)
    expect(detail.relatedSessions[0].sessionId).toBe(SESSION_IDS.child)
    expect(detail.combinedCostTotal).toBeCloseTo(
      normalizedSessionDetailFixture().combinedCostTotal,
      10,
    )
  })

  it('starts each test with an empty query cache, storage and rejecting fetch', async () => {
    expect(window.localStorage.length).toBe(0)
    await expect(fetch('/api/anything')).rejects.toThrow(/unexpected fetch/)
  })
})
