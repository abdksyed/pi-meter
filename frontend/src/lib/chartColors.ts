/* Chart colour helpers. All values resolve to tokens in tokens.css. */

export type TokenSeriesKey =
  | 'inputTokens'
  | 'outputTokens'
  | 'reasoningTokens'
  | 'cacheReadTokens'
  | 'cacheWriteTokens'

export interface TokenSeries {
  key: TokenSeriesKey
  label: string
  color: string
}

export const TOKEN_SERIES: TokenSeries[] = [
  { key: 'inputTokens', label: 'Input', color: 'var(--chart-input)' },
  { key: 'outputTokens', label: 'Output', color: 'var(--chart-output)' },
  { key: 'reasoningTokens', label: 'Reasoning', color: 'var(--chart-reasoning)' },
  { key: 'cacheReadTokens', label: 'Cache read', color: 'var(--chart-cache-read)' },
  { key: 'cacheWriteTokens', label: 'Cache write', color: 'var(--chart-cache-write)' },
]

export type CostSegmentKey =
  | 'costOutput'
  | 'costInput'
  | 'costCacheWrite'
  | 'costCacheRead'

export interface CostSegment {
  key: CostSegmentKey
  label: string
  color: string
}

export const COST_SEGMENTS: CostSegment[] = [
  { key: 'costInput', label: 'Input', color: 'var(--chart-input)' },
  { key: 'costOutput', label: 'Output', color: 'var(--chart-output)' },
  { key: 'costCacheRead', label: 'Cache read', color: 'var(--chart-cache-read)' },
  { key: 'costCacheWrite', label: 'Cache write', color: 'var(--chart-cache-write)' },
]

const PROJECT_COLORS = [
  'var(--bar-project-1)',
  'var(--bar-project-2)',
  'var(--bar-project-3)',
  'var(--bar-project-4)',
]

export function projectColor(cwd: string): string {
  let hash = 0
  for (let i = 0; i < cwd.length; i += 1) {
    hash = (hash * 31 + cwd.charCodeAt(i)) | 0
  }
  return PROJECT_COLORS[Math.abs(hash) % PROJECT_COLORS.length]
}
