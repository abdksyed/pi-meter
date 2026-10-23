/* Canonical camelCase API contract for Pi Meter.
   Costs are decimal currency units (the API converts stored micro-units).
   Timestamps are ISO 8601 strings. */

export type DateRangePreset = 'today' | '7d' | '30d' | 'all' | 'custom'
export type BucketGroup = 'hour' | 'day' | 'week' | 'month'
export type ChartMetric = 'cost' | 'tokens'
export type SessionSortField = 'lastActivity' | 'started' | 'cost' | 'tokens' | 'title'
export type SortDirection = 'asc' | 'desc'
export type ParseStatus = 'ok' | 'warning' | 'error'

/** Shared range query parameters. Presets send `range`; custom ranges send `from`/`to`. */
export interface RangeParams {
  range?: DateRangePreset
  from?: string
  to?: string
}

export interface ApiErrorBody {
  detail?: string | { msg?: string; loc?: (string | number)[] }[]
}

export interface HealthResponse {
  status: string
  database: string
  sessionsDirectory: string
  lastRefreshAt: string | null
  sessionCount: number
}

export interface RefreshResponse {
  filesSeen: number
  filesAdded: number
  filesUpdated: number
  filesRemoved: number
  filesFailed: number
  durationMs: number
}

export interface SummaryPrevious {
  costTotal: number
  totalTokens: number
  sessionCount: number
}

export interface SummaryResponse {
  range: string
  from: string | null
  to: string | null
  timezone: string
  sessionCount: number
  costTotal: number
  costInput: number
  costOutput: number
  costCacheRead: number
  costCacheWrite: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  userMessageCount: number
  assistantMessageCount: number
  toolCallCount: number
  averageSessionCost: number
  mostUsedModel: string | null
  mostActiveProject: string | null
  previous?: SummaryPrevious
}

export interface TimeseriesPoint {
  bucket: string
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  totalTokens: number
  costTotal: number
  sessionCount: number
}

export interface ModelBreakdownRow {
  provider: string
  model: string
  sessionCount: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costInput: number
  costOutput: number
  costCacheRead: number
  costCacheWrite: number
  costTotal: number
}

export interface ProjectBreakdownRow {
  cwd: string
  sessionCount: number
  totalTokens: number
  costTotal: number
  inputTokens: number
  outputTokens: number
}

export interface SessionModelRef {
  provider: string
  model: string
}

export interface SessionListItem {
  sessionId: string
  sessionName: string | null
  firstUserMessage: string | null
  cwd: string
  startedAt: string
  lastActivityAt: string
  models: SessionModelRef[]
  entryCount: number
  messageCount: number
  userMessageCount: number
  assistantMessageCount: number
  toolCallCount: number
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  totalTokens: number
  costTotal: number
  parseStatus: ParseStatus
  parseError: string | null
  fileSize: number
}

export interface SessionTotals {
  sessionCount: number
  costTotal: number
  totalTokens: number
  averageSessionCost: number
}

export interface SessionsResponse {
  items: SessionListItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
  timezone: string
  range: string
  totals: SessionTotals
}

export interface WorkingDirectoryFilter {
  cwd: string
  sessionCount: number
}

export interface ModelFilter {
  provider: string
  model: string
  sessionCount: number
}

export interface ProviderFilter {
  provider: string
  sessionCount: number
}

export interface FiltersResponse {
  workingDirectories: WorkingDirectoryFilter[]
  models: ModelFilter[]
  providers: ProviderFilter[]
  dateBounds: { minStartedAt: string | null; maxLastActivityAt: string | null }
  sessionCount: number
}
