/* Normalize API payloads into the camelCase frontend contract.
   Accepts both the flat contract and the nested/`range`-metadata shape. */

import type {
  FiltersResponse,
  HealthResponse,
  ModelBreakdownRow,
  ParseStatus,
  ProjectBreakdownRow,
  SessionListItem,
  SessionsResponse,
  SummaryResponse,
  TimeseriesPoint,
} from '../lib/api.types'

type Obj = Record<string, unknown>

function obj(value: unknown): Obj | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Obj)
    : undefined
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function pick(source: Obj | undefined, ...keys: string[]): unknown {
  if (!source) return undefined
  for (const key of keys) {
    const value = source[key]
    if (value !== undefined && value !== null) return value
  }
  return undefined
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function pickString(source: Obj | undefined, ...keys: string[]): string | undefined {
  return str(pick(source, ...keys))
}

function pickNumber(source: Obj | undefined, ...keys: string[]): number | undefined {
  return num(pick(source, ...keys))
}

function sumTokens(source: Obj): number {
  return (
    (pickNumber(source, 'inputTokens', 'input_tokens') ?? 0) +
    (pickNumber(source, 'outputTokens', 'output_tokens') ?? 0) +
    (pickNumber(source, 'reasoningTokens', 'reasoning_tokens') ?? 0) +
    (pickNumber(source, 'cacheReadTokens', 'cache_read_tokens') ?? 0) +
    (pickNumber(source, 'cacheWriteTokens', 'cache_write_tokens') ?? 0)
  )
}

function rangeFields(source: Obj | undefined): {
  range: string
  from: string | null
  to: string | null
  timezone: string
} {
  const rangeObj = obj(pick(source, 'range'))
  const range =
    (typeof pick(source, 'range') === 'string' ? str(pick(source, 'range')) : undefined) ??
    pickString(rangeObj, 'range', 'range_') ??
    '7d'
  const start = pickString(source, 'from') ?? pickString(rangeObj, 'start', 'from')
  const end = pickString(source, 'to') ?? pickString(rangeObj, 'end', 'to')
  return {
    range,
    from: start ? start.slice(0, 10) : null,
    to: end ? end.slice(0, 10) : null,
    timezone: pickString(source, 'timezone') ?? pickString(rangeObj, 'timezone') ?? '',
  }
}

export function normalizeHealth(raw: unknown): HealthResponse {
  const source = obj(raw) ?? {}
  const sync = obj(pick(source, 'lastSync', 'last_sync'))
  return {
    status: pickString(source, 'status') ?? 'ok',
    database:
      pickString(source, 'database') ??
      (pick(source, 'databaseOk', 'database_ok') === false ? 'error' : 'ok'),
    sessionsDirectory:
      pickString(source, 'sessionsDirectory', 'sessionsDir', 'sessions_dir') ?? '',
    lastRefreshAt:
      pickString(source, 'lastRefreshAt', 'last_refresh_at') ??
      pickString(sync, 'finishedAt', 'finished_at') ??
      null,
    sessionCount: pickNumber(source, 'sessionCount', 'session_count') ?? 0,
  }
}

export function normalizeSummary(raw: unknown): SummaryResponse {
  const source = obj(raw) ?? {}
  const { range, from, to, timezone } = rangeFields(source)
  const modelRef = obj(pick(source, 'mostUsedModel', 'most_used_model'))
  const previous = obj(pick(source, 'previous'))
  const inputTokens = pickNumber(source, 'inputTokens', 'input_tokens') ?? 0
  const outputTokens = pickNumber(source, 'outputTokens', 'output_tokens') ?? 0
  const reasoningTokens = pickNumber(source, 'reasoningTokens', 'reasoning_tokens') ?? 0
  const cacheReadTokens = pickNumber(source, 'cacheReadTokens', 'cache_read_tokens') ?? 0
  const cacheWriteTokens = pickNumber(source, 'cacheWriteTokens', 'cache_write_tokens') ?? 0

  return {
    range,
    from,
    to,
    timezone,
    sessionCount: pickNumber(source, 'sessionCount', 'session_count') ?? 0,
    costTotal: pickNumber(source, 'costTotal', 'cost_total') ?? 0,
    costInput: pickNumber(source, 'costInput', 'cost_input') ?? 0,
    costOutput: pickNumber(source, 'costOutput', 'cost_output') ?? 0,
    costCacheRead: pickNumber(source, 'costCacheRead', 'cost_cache_read') ?? 0,
    costCacheWrite: pickNumber(source, 'costCacheWrite', 'cost_cache_write') ?? 0,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens:
      pickNumber(source, 'totalTokens', 'total_tokens') ??
      inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens,
    userMessageCount: pickNumber(source, 'userMessageCount', 'user_message_count') ?? 0,
    assistantMessageCount:
      pickNumber(source, 'assistantMessageCount', 'assistant_message_count') ?? 0,
    toolCallCount: pickNumber(source, 'toolCallCount', 'tool_call_count') ?? 0,
    averageSessionCost:
      pickNumber(source, 'averageSessionCost', 'avgSessionCost', 'average_session_cost') ?? 0,
    mostUsedModel:
      pickString(source, 'mostUsedModel') ?? pickString(modelRef, 'model') ?? null,
    mostActiveProject:
      pickString(source, 'mostActiveProject', 'most_active_project') ?? null,
    previous: previous
      ? {
          costTotal: pickNumber(previous, 'costTotal', 'cost_total') ?? 0,
          totalTokens: pickNumber(previous, 'totalTokens', 'total_tokens') ?? 0,
          sessionCount: pickNumber(previous, 'sessionCount', 'session_count') ?? 0,
        }
      : undefined,
  }
}

export function normalizeTimeseries(raw: unknown): TimeseriesPoint[] {
  const points = Array.isArray(raw) ? raw : arr(pick(obj(raw), 'points'))
  return points.map((item) => {
    const point = obj(item) ?? {}
    const inputTokens = pickNumber(point, 'inputTokens', 'input_tokens') ?? 0
    const outputTokens = pickNumber(point, 'outputTokens', 'output_tokens') ?? 0
    const reasoningTokens = pickNumber(point, 'reasoningTokens', 'reasoning_tokens') ?? 0
    const cacheReadTokens = pickNumber(point, 'cacheReadTokens', 'cache_read_tokens') ?? 0
    return {
      bucket: pickString(point, 'bucket') ?? '',
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheReadTokens,
      totalTokens:
        pickNumber(point, 'totalTokens', 'total_tokens') ??
        inputTokens + outputTokens + reasoningTokens + cacheReadTokens,
      costTotal: pickNumber(point, 'costTotal', 'cost_total') ?? 0,
      sessionCount: pickNumber(point, 'sessionCount', 'session_count') ?? 0,
    }
  })
}

export function normalizeModelBreakdown(raw: unknown): ModelBreakdownRow[] {
  const rows = Array.isArray(raw) ? raw : arr(pick(obj(raw), 'models'))
  return rows.map((item) => {
    const row = obj(item) ?? {}
    const inputTokens = pickNumber(row, 'inputTokens', 'input_tokens') ?? 0
    const outputTokens = pickNumber(row, 'outputTokens', 'output_tokens') ?? 0
    const reasoningTokens = pickNumber(row, 'reasoningTokens', 'reasoning_tokens') ?? 0
    const cacheReadTokens = pickNumber(row, 'cacheReadTokens', 'cache_read_tokens') ?? 0
    const cacheWriteTokens = pickNumber(row, 'cacheWriteTokens', 'cache_write_tokens') ?? 0
    return {
      provider: pickString(row, 'provider') ?? '',
      model: pickString(row, 'model') ?? '',
      sessionCount: pickNumber(row, 'sessionCount', 'session_count') ?? 0,
      inputTokens,
      outputTokens,
      reasoningTokens,
      cacheReadTokens,
      cacheWriteTokens,
      totalTokens:
        pickNumber(row, 'totalTokens', 'total_tokens') ??
        inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens,
      costInput: pickNumber(row, 'costInput', 'cost_input') ?? 0,
      costOutput: pickNumber(row, 'costOutput', 'cost_output') ?? 0,
      costCacheRead: pickNumber(row, 'costCacheRead', 'cost_cache_read') ?? 0,
      costCacheWrite: pickNumber(row, 'costCacheWrite', 'cost_cache_write') ?? 0,
      costTotal: pickNumber(row, 'costTotal', 'cost_total') ?? 0,
    }
  })
}

export function normalizeProjectBreakdown(raw: unknown): ProjectBreakdownRow[] {
  const rows = Array.isArray(raw) ? raw : arr(pick(obj(raw), 'projects'))
  return rows.map((item) => {
    const row = obj(item) ?? {}
    const inputTokens = pickNumber(row, 'inputTokens', 'input_tokens') ?? 0
    const outputTokens = pickNumber(row, 'outputTokens', 'output_tokens') ?? 0
    return {
      cwd: pickString(row, 'cwd') ?? '',
      sessionCount: pickNumber(row, 'sessionCount', 'session_count') ?? 0,
      totalTokens: pickNumber(row, 'totalTokens', 'total_tokens') ?? sumTokens(row),
      costTotal: pickNumber(row, 'costTotal', 'cost_total') ?? 0,
      inputTokens,
      outputTokens,
    }
  })
}

function parseStatus(value: unknown): ParseStatus {
  if (value === 'error') return 'error'
  if (value === 'warning' || value === 'partial') return 'warning'
  return 'ok'
}

function normalizeSession(item: unknown): SessionListItem {
  const row = obj(item) ?? {}
  const inputTokens = pickNumber(row, 'inputTokens', 'input_tokens') ?? 0
  const outputTokens = pickNumber(row, 'outputTokens', 'output_tokens') ?? 0
  const reasoningTokens = pickNumber(row, 'reasoningTokens', 'reasoning_tokens') ?? 0
  const cacheReadTokens = pickNumber(row, 'cacheReadTokens', 'cache_read_tokens') ?? 0
  const cacheWriteTokens = pickNumber(row, 'cacheWriteTokens', 'cache_write_tokens') ?? 0
  const models = arr(pick(row, 'models')).map((model) => {
    const ref = obj(model) ?? {}
    return {
      provider: pickString(ref, 'provider') ?? '',
      model: pickString(ref, 'model') ?? '',
    }
  })

  return {
    sessionId: pickString(row, 'sessionId', 'session_id', 'id') ?? '',
    sessionName:
      pickString(row, 'sessionName', 'session_name') ?? pickString(row, 'title') ?? null,
    firstUserMessage:
      pickString(row, 'firstUserMessage', 'first_user_message') ?? null,
    cwd: pickString(row, 'cwd') ?? '',
    startedAt: pickString(row, 'startedAt', 'started_at') ?? '',
    lastActivityAt:
      pickString(row, 'lastActivityAt', 'last_activity_at') ??
      pickString(row, 'startedAt', 'started_at') ??
      '',
    models: models.filter((model) => model.model),
    entryCount: pickNumber(row, 'entryCount', 'entry_count') ?? 0,
    messageCount: pickNumber(row, 'messageCount', 'message_count') ?? 0,
    userMessageCount: pickNumber(row, 'userMessageCount', 'user_message_count') ?? 0,
    assistantMessageCount:
      pickNumber(row, 'assistantMessageCount', 'assistant_message_count') ?? 0,
    toolCallCount: pickNumber(row, 'toolCallCount', 'tool_call_count') ?? 0,
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens:
      pickNumber(row, 'totalTokens', 'total_tokens') ??
      inputTokens + outputTokens + reasoningTokens + cacheReadTokens + cacheWriteTokens,
    costTotal: pickNumber(row, 'costTotal', 'cost_total') ?? 0,
    parseStatus: parseStatus(pick(row, 'parseStatus', 'parse_status')),
    parseError: pickString(row, 'parseError', 'parse_error') ?? null,
    fileSize: pickNumber(row, 'fileSize', 'file_size') ?? 0,
  }
}

export function normalizeSessions(raw: unknown): SessionsResponse {
  const source = obj(raw) ?? {}
  const items = arr(pick(source, 'items', 'sessions')).map(normalizeSession)
  const pageSize = pickNumber(source, 'pageSize', 'page_size') ?? 25
  const total = pickNumber(source, 'total') ?? items.length
  const page = pickNumber(source, 'page') ?? 1
  const totals = obj(pick(source, 'totals'))
  const totalCost = items.reduce((sum, item) => sum + item.costTotal, 0)
  const totalTokens = items.reduce((sum, item) => sum + item.totalTokens, 0)
  const { range, timezone } = rangeFields(source)

  return {
    items,
    page,
    pageSize,
    total,
    totalPages:
      pickNumber(source, 'totalPages', 'total_pages') ??
      Math.max(1, Math.ceil(total / Math.max(1, pageSize))),
    timezone,
    range,
    totals: totals
      ? {
          sessionCount: pickNumber(totals, 'sessionCount', 'session_count') ?? total,
          costTotal: pickNumber(totals, 'costTotal', 'cost_total') ?? totalCost,
          totalTokens: pickNumber(totals, 'totalTokens', 'total_tokens') ?? totalTokens,
          averageSessionCost:
            pickNumber(totals, 'averageSessionCost', 'avgSessionCost') ??
            (items.length > 0 ? totalCost / items.length : 0),
        }
      : {
          sessionCount: total,
          costTotal: totalCost,
          totalTokens,
          averageSessionCost: items.length > 0 ? totalCost / items.length : 0,
        },
  }
}

export function normalizeFilters(raw: unknown): FiltersResponse {
  const source = obj(raw) ?? {}
  const directories = arr(pick(source, 'workingDirectories', 'cwds'))
  const models = arr(pick(source, 'models'))
  const providers = arr(pick(source, 'providers'))
  const bounds = obj(pick(source, 'dateBounds'))

  return {
    workingDirectories: directories.map((item) => {
      if (typeof item === 'string') return { cwd: item, sessionCount: 0 }
      const directory = obj(item) ?? {}
      return {
        cwd: pickString(directory, 'cwd', 'path') ?? '',
        sessionCount: pickNumber(directory, 'sessionCount', 'session_count') ?? 0,
      }
    }),
    models: models.map((item) => {
      const model = obj(item) ?? {}
      return {
        provider: pickString(model, 'provider') ?? '',
        model: pickString(model, 'model') ?? '',
        sessionCount: pickNumber(model, 'sessionCount', 'session_count') ?? 0,
      }
    }),
    providers: providers.map((item) => {
      if (typeof item === 'string') return { provider: item, sessionCount: 0 }
      const provider = obj(item) ?? {}
      return {
        provider: pickString(provider, 'provider') ?? '',
        sessionCount: pickNumber(provider, 'sessionCount', 'session_count') ?? 0,
      }
    }),
    dateBounds: {
      minStartedAt:
        pickString(bounds, 'minStartedAt', 'min_started_at') ??
        pickString(source, 'firstSessionAt', 'first_session_at') ??
        null,
      maxLastActivityAt:
        pickString(bounds, 'maxLastActivityAt', 'max_last_activity_at') ??
        pickString(source, 'lastSessionAt', 'last_session_at') ??
        null,
    },
    sessionCount: pickNumber(source, 'sessionCount', 'session_count') ?? 0,
  }
}
