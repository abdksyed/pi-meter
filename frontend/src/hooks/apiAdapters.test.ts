/**
 * API adapters: camelCase/snake_case tolerance, wrapped vs direct payloads,
 * derived totals and missing optional fields.
 */

import { describe, expect, it } from 'vitest'

import {
  normalizeFilters,
  normalizeHealth,
  normalizeModelBreakdown,
  normalizeProjectBreakdown,
  normalizeSessions,
  normalizeSummary,
  normalizeTimeseries,
} from './apiAdapters'
import {
  filtersFixture,
  healthFixture,
  modelBreakdownFixture,
  projectBreakdownFixture,
  sessionListItemFixture,
  sessionsResponseFixture,
  summaryFixture,
  timeseriesFixture,
} from '../test/fixtures'

describe('normalizeHealth', () => {
  it('passes through the contract shape', () => {
    expect(normalizeHealth(healthFixture())).toEqual(healthFixture())
  })

  it('accepts snake_case and nested lastSync fields', () => {
    expect(
      normalizeHealth({
        status: 'degraded',
        sessions_dir: '/tmp/s',
        last_sync: { finished_at: '2026-01-15T08:00:00.000Z' },
        session_count: 4,
      }),
    ).toEqual({
      status: 'degraded',
      database: 'ok',
      sessionsDirectory: '/tmp/s',
      lastRefreshAt: '2026-01-15T08:00:00.000Z',
      sessionCount: 4,
    })
  })

  it('maps databaseOk=false to an error status', () => {
    expect(normalizeHealth({ databaseOk: false }).database).toBe('error')
  })

  it('returns safe defaults for junk input', () => {
    expect(normalizeHealth(null)).toEqual({
      status: 'ok',
      database: 'ok',
      sessionsDirectory: '',
      lastRefreshAt: null,
      sessionCount: 0,
    })
  })
})

describe('normalizeSummary', () => {
  it('passes through the contract shape', () => {
    expect(normalizeSummary(summaryFixture())).toEqual(summaryFixture())
  })

  it('unwraps nested range metadata and a model object', () => {
    const summary = normalizeSummary({
      range: { range: '30d', start: '2026-01-01T00:00:00.000Z', end: '2026-01-31T00:00:00.000Z', timezone: 'UTC' },
      most_used_model: { model: 'claude-sonnet-4-5' },
      cost_total: 1.5,
      previous: { cost_total: 1, total_tokens: 5, session_count: 1 },
    })
    expect(summary.range).toBe('30d')
    expect(summary.from).toBe('2026-01-01')
    expect(summary.to).toBe('2026-01-31')
    expect(summary.timezone).toBe('UTC')
    expect(summary.mostUsedModel).toBe('claude-sonnet-4-5')
    expect(summary.costTotal).toBe(1.5)
    expect(summary.previous).toEqual({ costTotal: 1, totalTokens: 5, sessionCount: 1 })
  })

  it('derives total tokens from the components when absent', () => {
    const summary = normalizeSummary({ inputTokens: 10, outputTokens: 5, reasoningTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3 })
    expect(summary.totalTokens).toBe(21)
    expect(summary.range).toBe('7d')
    expect(summary.mostUsedModel).toBeNull()
  })

  it('returns zeroed defaults for junk input', () => {
    const summary = normalizeSummary(undefined)
    expect(summary.costTotal).toBe(0)
    expect(summary.sessionCount).toBe(0)
    expect(summary.previous).toBeUndefined()
  })
})

describe('normalizeTimeseries', () => {
  it('passes through an array payload', () => {
    expect(normalizeTimeseries(timeseriesFixture())).toEqual(timeseriesFixture())
  })

  it('accepts a wrapped `points` payload and snake_case keys', () => {
    const points = normalizeTimeseries({
      points: [{ bucket: '2026-01-15', input_tokens: 10, output_tokens: 5, cost_total: 0.5, session_count: 2 }],
    })
    expect(points).toEqual([
      {
        bucket: '2026-01-15',
        inputTokens: 10,
        outputTokens: 5,
        reasoningTokens: 0,
        cacheReadTokens: 0,
        totalTokens: 15,
        costTotal: 0.5,
        sessionCount: 2,
      },
    ])
  })

  it('returns [] for junk input', () => {
    expect(normalizeTimeseries(null)).toEqual([])
  })
})

describe('normalizeModelBreakdown', () => {
  it('passes through an array payload', () => {
    expect(normalizeModelBreakdown(modelBreakdownFixture())).toEqual(modelBreakdownFixture())
  })

  it('accepts a wrapped `models` payload', () => {
    const rows = normalizeModelBreakdown({ models: [{ provider: 'anthropic', model: 'x', input_tokens: 1, output_tokens: 2 }] })
    expect(rows[0]).toMatchObject({ provider: 'anthropic', model: 'x', inputTokens: 1, outputTokens: 2, totalTokens: 3 })
  })
})

describe('normalizeProjectBreakdown', () => {
  it('passes through an array payload', () => {
    expect(normalizeProjectBreakdown(projectBreakdownFixture())).toEqual(projectBreakdownFixture())
  })

  it('sums token components when the total is missing', () => {
    const rows = normalizeProjectBreakdown({
      projects: [{ cwd: '/w', input_tokens: 3, output_tokens: 4, reasoning_tokens: 1, cache_read_tokens: 1, cache_write_tokens: 1 }],
    })
    expect(rows[0].totalTokens).toBe(10)
  })
})

describe('normalizeSessions', () => {
  it('passes through the contract shape', () => {
    expect(normalizeSessions(sessionsResponseFixture())).toEqual(sessionsResponseFixture())
  })

  it('accepts a `sessions` payload with snake_case rows', () => {
    const response = normalizeSessions({
      sessions: [
        {
          id: 's1',
          title: 'Renamed session',
          session_name: null,
          first_user_message: 'hello',
          started_at: '2026-01-15T09:00:00.000Z',
          entry_count: 3,
          cost_total: 0.5,
          parse_status: 'partial',
          models: [{ provider: 'anthropic', model: 'claude-sonnet-4-5' }, { model: '' }],
        },
      ],
      page: 2,
      page_size: 50,
      total: 120,
      ranges: {},
    })
    const item = response.items[0]
    expect(item.sessionId).toBe('s1')
    expect(item.sessionName).toBe('Renamed session')
    expect(item.firstUserMessage).toBe('hello')
    // lastActivityAt falls back to startedAt
    expect(item.lastActivityAt).toBe('2026-01-15T09:00:00.000Z')
    expect(item.entryCount).toBe(3)
    expect(item.costTotal).toBe(0.5)
    expect(item.parseStatus).toBe('warning')
    // Empty model names are filtered out.
    expect(item.models).toEqual([{ provider: 'anthropic', model: 'claude-sonnet-4-5' }])
    expect(response.page).toBe(2)
    expect(response.pageSize).toBe(50)
    expect(response.totalPages).toBe(3)
  })

  it('derives totals from the rows when the API omits them', () => {
    const response = normalizeSessions({
      items: [
        sessionListItemFixture({ sessionId: 'a', costTotal: 0.02, totalTokens: 100 }),
        sessionListItemFixture({ sessionId: 'b', costTotal: 0.03, totalTokens: 200 }),
      ],
    })
    expect(response.totals).toEqual({
      sessionCount: 2,
      costTotal: 0.05,
      totalTokens: 300,
      averageSessionCost: 0.025,
    })
    expect(response.total).toBe(2)
    expect(response.totalPages).toBe(1)
  })

  it('returns an empty, stable shape', () => {
    expect(normalizeSessions(undefined)).toEqual({
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
      totalPages: 1,
      timezone: '',
      range: '7d',
      totals: { sessionCount: 0, costTotal: 0, totalTokens: 0, averageSessionCost: 0 },
    })
  })

  it('keeps an explicit parse error', () => {
    const response = normalizeSessions({ items: [{ sessionId: 'x', parseStatus: 'error', parseError: 'bad json' }] })
    expect(response.items[0].parseStatus).toBe('error')
    expect(response.items[0].parseError).toBe('bad json')
  })
})

describe('normalizeFilters', () => {
  it('passes through the contract shape', () => {
    expect(normalizeFilters(filtersFixture())).toEqual(filtersFixture())
  })

  it('accepts plain string lists and snake_case bounds', () => {
    expect(
      normalizeFilters({
        cwds: ['/work/alpha'],
        providers: ['anthropic'],
        models: [{ provider: 'anthropic', model: 'm', session_count: 2 }],
        first_session_at: '2026-01-01T00:00:00.000Z',
        last_session_at: '2026-01-15T00:00:00.000Z',
      }),
    ).toEqual({
      workingDirectories: [{ cwd: '/work/alpha', sessionCount: 0 }],
      models: [{ provider: 'anthropic', model: 'm', sessionCount: 2 }],
      providers: [{ provider: 'anthropic', sessionCount: 0 }],
      dateBounds: {
        minStartedAt: '2026-01-01T00:00:00.000Z',
        maxLastActivityAt: '2026-01-15T00:00:00.000Z',
      },
      sessionCount: 0,
    })
  })

  it('returns empty lists and null bounds for junk input', () => {
    expect(normalizeFilters(null)).toEqual({
      workingDirectories: [],
      models: [],
      providers: [],
      dateBounds: { minStartedAt: null, maxLastActivityAt: null },
      sessionCount: 0,
    })
  })
})
