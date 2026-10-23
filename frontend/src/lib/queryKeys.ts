/** React Query key factory. Keep every key in one place so invalidation stays predictable. */

export type QueryKeyParams = object

export const queryKeys = {
  health: () => ['health'] as const,
  filters: () => ['filters'] as const,
  summary: (params: QueryKeyParams = {}) => ['summary', params] as const,
  timeseries: (params: QueryKeyParams = {}) => ['timeseries', params] as const,
  byModel: (params: QueryKeyParams = {}) => ['by-model', params] as const,
  byProject: (params: QueryKeyParams = {}) => ['by-project', params] as const,
  sessions: (params: QueryKeyParams = {}) => ['sessions', params] as const,
  session: (sessionId: string) => ['session', sessionId] as const,
  sessionEntries: (sessionId: string, params: QueryKeyParams = {}) =>
    ['session-entries', sessionId, params] as const,
}
