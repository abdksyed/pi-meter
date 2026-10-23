/**
 * Deterministic API fixtures for frontend tests.
 *
 * These mirror the *production* API contract (camelCase keys, ISO-8601 UTC
 * timestamps, costs as decimal currency units). Values are small and add up by
 * hand so UI assertions can compare against independent arithmetic.
 *
 * Fixture timestamps are all inside January 2026; tests that need `7d`/`30d`
 * ranges must set the clock with `vi.setSystemTime(new Date('2026-01-15T09:00:00.000Z'))`.
 */

import type {
  FiltersResponse,
  HealthResponse,
  ModelBreakdownRow,
  ProjectBreakdownRow,
  SessionListItem,
  SessionsResponse,
  SummaryResponse,
  TimeseriesPoint,
} from '../lib/api.types'
import type { NormalizedSessionDetail } from '../lib/sessionTypes'

export const FIXTURE_NOW = '2026-01-15T09:00:00.000Z'
export const FIXTURE_TIMEZONE = 'UTC'

export const SESSION_IDS = {
  main: '11111111-1111-4111-8111-111111111111',
  beta: '22222222-2222-4222-8222-222222222222',
  parent: '01a16174-80c5-7088-aefb-de5e5b743c5f',
  child: '01a162e4-2f54-72b8-a3ae-9ac22276c51e',
} as const

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export function healthFixture(overrides: Partial<HealthResponse> = {}): HealthResponse {
  return {
    status: 'ok',
    database: 'ok',
    sessionsDirectory: '/tmp/pi-meter-tests/sessions',
    lastRefreshAt: '2026-01-15T08:59:00.000Z',
    sessionCount: 2,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export const SUMMARY_COST_TOTAL = 0.019409
export const SUMMARY_TOKENS = {
  input: 4210,
  output: 1015,
  reasoning: 260,
  cacheRead: 4000,
  cacheWrite: 1500,
}
export const SUMMARY_TOTAL_TOKENS = 10725

export function summaryFixture(overrides: Partial<SummaryResponse> = {}): SummaryResponse {
  return {
    range: '7d',
    from: '2026-01-09',
    to: '2026-01-15',
    timezone: FIXTURE_TIMEZONE,
    sessionCount: 2,
    costTotal: SUMMARY_COST_TOTAL,
    costInput: 0.0073,
    costOutput: 0.0089,
    costCacheRead: 0.0004,
    costCacheWrite: 0.00237,
    inputTokens: SUMMARY_TOKENS.input,
    outputTokens: SUMMARY_TOKENS.output,
    reasoningTokens: SUMMARY_TOKENS.reasoning,
    cacheReadTokens: SUMMARY_TOKENS.cacheRead,
    cacheWriteTokens: SUMMARY_TOKENS.cacheWrite,
    totalTokens: SUMMARY_TOTAL_TOKENS,
    userMessageCount: 3,
    assistantMessageCount: 5,
    toolCallCount: 4,
    averageSessionCost: SUMMARY_COST_TOTAL / 2,
    mostUsedModel: 'claude-sonnet-4-5',
    mostActiveProject: '/work/alpha',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Timeseries / breakdowns
// ---------------------------------------------------------------------------

export function timeseriesFixture(): TimeseriesPoint[] {
  return [
    {
      bucket: '2026-01-14',
      inputTokens: 600,
      outputTokens: 140,
      reasoningTokens: 20,
      cacheReadTokens: 0,
      totalTokens: 760,
      costTotal: 0.0017,
      sessionCount: 1,
    },
    {
      bucket: '2026-01-15',
      inputTokens: 4210,
      outputTokens: 1015,
      reasoningTokens: 260,
      cacheReadTokens: 4000,
      totalTokens: 10725,
      costTotal: SUMMARY_COST_TOTAL,
      sessionCount: 2,
    },
  ]
}

export function modelBreakdownFixture(): ModelBreakdownRow[] {
  return [
    {
      provider: 'anthropic',
      model: 'claude-sonnet-4-5',
      sessionCount: 1,
      inputTokens: 4100,
      outputTokens: 960,
      reasoningTokens: 260,
      cacheReadTokens: 4000,
      cacheWriteTokens: 1500,
      totalTokens: 10560,
      costInput: 0.0063,
      costOutput: 0.0069,
      costCacheRead: 0.0004,
      costCacheWrite: 0.00187,
      costTotal: 0.01547,
    },
    {
      provider: 'openai',
      model: 'gpt-5.1',
      sessionCount: 1,
      inputTokens: 110,
      outputTokens: 55,
      reasoningTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      totalTokens: 165,
      costInput: 0.001,
      costOutput: 0.002,
      costCacheRead: 0,
      costCacheWrite: 0.0005,
      costTotal: 0.00394,
    },
  ]
}

export function projectBreakdownFixture(): ProjectBreakdownRow[] {
  return [
    {
      cwd: '/work/alpha',
      sessionCount: 1,
      totalTokens: 10560,
      costTotal: 0.01547,
      inputTokens: 4100,
      outputTokens: 960,
    },
    {
      cwd: '/work/beta',
      sessionCount: 1,
      totalTokens: 165,
      costTotal: 0.00394,
      inputTokens: 110,
      outputTokens: 55,
    },
  ]
}

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

export function sessionListItemFixture(
  overrides: Partial<SessionListItem> = {},
): SessionListItem {
  return {
    sessionId: SESSION_IDS.main,
    sessionName: 'Refactor parser pipeline',
    firstUserMessage: 'Please refactor the parser pipeline.',
    cwd: '/work/alpha',
    startedAt: '2026-01-15T09:00:00.000Z',
    lastActivityAt: '2026-01-15T09:02:40.000Z',
    models: [{ provider: 'anthropic', model: 'claude-sonnet-4-5' }],
    entryCount: 18,
    messageCount: 7,
    userMessageCount: 1,
    assistantMessageCount: 3,
    toolCallCount: 2,
    inputTokens: 4210,
    outputTokens: 1015,
    reasoningTokens: 260,
    cacheReadTokens: 4000,
    cacheWriteTokens: 1500,
    totalTokens: 10725,
    costTotal: SUMMARY_COST_TOTAL,
    parseStatus: 'ok',
    parseError: null,
    fileSize: 12_345,
    ...overrides,
  }
}

export function sessionsResponseFixture(
  overrides: Partial<SessionsResponse> = {},
): SessionsResponse {
  const items = [sessionListItemFixture()]
  return {
    items,
    page: 1,
    pageSize: 25,
    total: items.length,
    totalPages: 1,
    timezone: FIXTURE_TIMEZONE,
    range: '30d',
    totals: {
      sessionCount: items.length,
      costTotal: SUMMARY_COST_TOTAL,
      totalTokens: SUMMARY_TOTAL_TOKENS,
      averageSessionCost: SUMMARY_COST_TOTAL,
    },
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export function filtersFixture(overrides: Partial<FiltersResponse> = {}): FiltersResponse {
  return {
    workingDirectories: [
      { cwd: '/work/alpha', sessionCount: 1 },
      { cwd: '/work/beta', sessionCount: 1 },
    ],
    models: [
      { provider: 'anthropic', model: 'claude-sonnet-4-5', sessionCount: 1 },
      { provider: 'openai', model: 'gpt-5.1', sessionCount: 1 },
    ],
    providers: [
      { provider: 'anthropic', sessionCount: 1 },
      { provider: 'openai', sessionCount: 1 },
    ],
    dateBounds: {
      minStartedAt: '2026-01-14T08:00:00.000Z',
      maxLastActivityAt: '2026-01-15T09:02:40.000Z',
    },
    sessionCount: 2,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Session detail (normalized transcript shape consumed by components)
// ---------------------------------------------------------------------------

/** Raw entry payloads as the API returns them (``EntryOut`` camelCase). */
export function rawEntry(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    entryIndex: 0,
    entryId: 'entry-1',
    parentId: null,
    type: 'message',
    role: 'user',
    timestamp: '2026-01-15T09:00:00.000Z',
    provider: null,
    model: null,
    thinkingLevel: null,
    toolName: null,
    toolCallId: null,
    isError: false,
    durationMs: null,
    usagePresent: false,
    usage: null,
    content: [{ type: 'text', text: 'Please refactor the parser pipeline.' }],
    metadata: { isError: false },
    ...overrides,
  }
}

/** Raw ``/api/sessions/{id}`` detail payload. */
export function rawSessionDetail(): Record<string, unknown> {
  return {
    session: sessionListItemFixture(),
    totals: {
      inputTokens: SUMMARY_TOKENS.input,
      outputTokens: SUMMARY_TOKENS.output,
      reasoningTokens: SUMMARY_TOKENS.reasoning,
      cacheReadTokens: SUMMARY_TOKENS.cacheRead,
      cacheWriteTokens: SUMMARY_TOKENS.cacheWrite,
      totalTokens: SUMMARY_TOTAL_TOKENS,
      costInput: 0.0073,
      costOutput: 0.0089,
      costCacheRead: 0.0004,
      costCacheWrite: 0.00237,
      costTotal: SUMMARY_COST_TOTAL,
    },
    models: modelBreakdownFixture(),
    entries: [
      rawEntry({ entryIndex: 0, entryId: 'u1' }),
      rawEntry({
        entryIndex: 1,
        entryId: 'a1',
        parentId: 'u1',
        role: 'assistant',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        usagePresent: true,
        usage: {
          inputTokens: 1200,
          outputTokens: 340,
          reasoningTokens: 60,
          cacheReadTokens: 4000,
          cacheWriteTokens: 500,
          totalTokens: 6040,
          costInput: 0.0036,
          costOutput: 0.0051,
          costCacheRead: 0.0004,
          costCacheWrite: 0.00187,
          costTotal: 0.01097,
        },
        content: [
          { type: 'thinking', thinking: 'I will inspect the parser first.' },
          { type: 'text', text: 'Inspecting the parser.' },
          { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'pytest' } },
        ],
      }),
      rawEntry({
        entryIndex: 2,
        entryId: 'r1',
        parentId: 'a1',
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        content: [{ type: 'text', text: '3 passed in 0.42s' }],
      }),
      rawEntry({
        entryIndex: 3,
        entryId: 'mc1',
        type: 'model_change',
        role: null,
        content: null,
        metadata: { modelChange: { provider: 'openai', modelId: 'gpt-5.1' } },
      }),
      rawEntry({
        entryIndex: 4,
        entryId: 'cmp1',
        type: 'compaction',
        role: null,
        content: [{ type: 'text', text: 'Compacted the early exploration.' }],
        metadata: { tokensBefore: 9000 },
      }),
    ],
    entriesTotal: 5,
    relatedSessions: [
      {
        sessionId: SESSION_IDS.child,
        title: 'Mapped child 1',
        costTotal: 0.02,
        totalTokens: 150,
      },
    ],
    relatedCostTotal: 0.02,
    combinedCostTotal: SUMMARY_COST_TOTAL + 0.02,
  }
}

/** Normalized detail used by page/component tests that skip `normalizeSessionDetail`. */
export function normalizedSessionDetailFixture(): NormalizedSessionDetail {
  return {
    session: {
      id: SESSION_IDS.main,
      sessionId: SESSION_IDS.main,
      title: 'Refactor parser pipeline',
      cwd: '/work/alpha',
      startedAt: '2026-01-15T09:00:00.000Z',
      lastActivityAt: '2026-01-15T09:02:40.000Z',
      durationMs: 160_000,
      models: [{ model: 'claude-sonnet-4-5', provider: 'anthropic' }],
      primaryModel: 'claude-sonnet-4-5',
      counts: {
        entries: 5,
        userMessages: 1,
        assistantMessages: 1,
        toolCalls: 1,
        toolResults: 1,
        errors: 0,
        compactions: 1,
        contextEdits: 0,
        modelChanges: 1,
      },
      usage: {
        input: SUMMARY_TOKENS.input,
        output: SUMMARY_TOKENS.output,
        reasoning: SUMMARY_TOKENS.reasoning,
        cacheRead: SUMMARY_TOKENS.cacheRead,
        cacheWrite: SUMMARY_TOKENS.cacheWrite,
        totalTokens: SUMMARY_TOTAL_TOKENS,
      },
      cost: {
        input: 0.0073,
        output: 0.0089,
        cacheRead: 0.0004,
        cacheWrite: 0.00237,
        total: SUMMARY_COST_TOTAL,
      },
      parseStatus: 'ok',
    },
    entries: [
      {
        key: 'entry-0',
        index: 0,
        id: 'u1',
        type: 'message',
        kind: 'user',
        role: 'user',
        timestamp: '2026-01-15T09:00:00.000Z',
        isError: false,
        content: [{ kind: 'text', text: 'Please refactor the parser pipeline.' }],
        readFiles: [],
        modifiedFiles: [],
        raw: {},
      },
      {
        key: 'entry-1',
        index: 1,
        id: 'a1',
        parentId: 'u1',
        type: 'message',
        kind: 'assistant',
        role: 'assistant',
        provider: 'anthropic',
        model: 'claude-sonnet-4-5',
        timestamp: '2026-01-15T09:00:04.000Z',
        isError: false,
        content: [
          { kind: 'thinking', text: 'I will inspect the parser first.' },
          { kind: 'text', text: 'Inspecting the parser.' },
          { kind: 'tool-call', id: 'call-1', name: 'bash', arguments: { command: 'pytest' } },
        ],
        usage: {
          input: 1200,
          output: 340,
          reasoning: 60,
          cacheRead: 4000,
          cacheWrite: 500,
          totalTokens: 6040,
        },
        cost: {
          input: 0.0036,
          output: 0.0051,
          cacheRead: 0.0004,
          cacheWrite: 0.00187,
          total: 0.01097,
        },
        readFiles: [],
        modifiedFiles: [],
        raw: {},
      },
      {
        key: 'entry-2',
        index: 2,
        id: 'r1',
        parentId: 'a1',
        type: 'message',
        kind: 'tool-result',
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        timestamp: '2026-01-15T09:00:05.000Z',
        isError: false,
        content: [{ kind: 'text', text: '3 passed in 0.42s' }],
        readFiles: [],
        modifiedFiles: [],
        raw: {},
      },
    ],
    warnings: [],
    relatedSessions: [
      {
        sessionId: SESSION_IDS.child,
        title: 'Mapped child 1',
        costTotal: 0.02,
        totalTokens: 150,
      },
    ],
    relatedCostTotal: 0.02,
    combinedCostTotal: SUMMARY_COST_TOTAL + 0.02,
  }
}

/** Long, unbroken tool output for overflow/collapse tests. */
export function longToolOutput(chars = 5_000): string {
  return 'x'.repeat(chars)
}
