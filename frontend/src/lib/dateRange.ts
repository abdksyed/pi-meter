export type RangeKey = 'today' | '7d' | '30d' | 'all' | 'custom'
export type GroupBy = 'hour' | 'day' | 'week' | 'month'

export const RANGE_KEYS: RangeKey[] = ['today', '7d', '30d', 'all', 'custom']
export const GROUP_KEYS: GroupBy[] = ['hour', 'day', 'week', 'month']

export const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'all', label: 'All time' },
]

export interface RangeState {
  range: RangeKey
  from?: string
  to?: string
}

export interface RangeApiParams {
  range?: RangeKey
  from?: string
  to?: string
}

export function isRangeKey(value: string | null | undefined): value is RangeKey {
  return !!value && (RANGE_KEYS as string[]).includes(value)
}

export function isGroupBy(value: string | null | undefined): value is GroupBy {
  return !!value && (GROUP_KEYS as string[]).includes(value)
}

export function isIsoDate(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function isValidCustomRange(from?: string, to?: string): boolean {
  return isIsoDate(from) && isIsoDate(to) && from <= to
}

export function rangeApiParams(range: RangeKey, from?: string, to?: string): RangeApiParams {
  if (range === 'custom' && isValidCustomRange(from, to)) {
    return { range: 'custom', from, to }
  }
  return { range }
}

export function defaultGroupBy(range: RangeKey, from?: string, to?: string): GroupBy {
  if (range === 'today') return 'hour'
  if (range === 'all') return 'week'
  if (range === 'custom') {
    if (from && to) {
      const days = (Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`)) / 86_400_000
      return days > 45 ? 'week' : 'day'
    }
    return 'day'
  }
  return 'day'
}

function shortDate(value: string): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function rangeLabel(range: RangeKey, from?: string, to?: string): string {
  switch (range) {
    case 'today':
      return 'Today'
    case '7d':
      return 'Last 7 days'
    case '30d':
      return 'Last 30 days'
    case 'all':
      return 'All time'
    case 'custom':
      if (isIsoDate(from) && isIsoDate(to)) return `${shortDate(from)} – ${shortDate(to)}`
      return 'Custom range'
  }
}

export function rangeEyebrow(range: RangeKey, from?: string, to?: string): string {
  if (range === 'custom') return rangeLabel(range, from, to).toUpperCase()
  return rangeLabel(range, from, to).toUpperCase()
}

export function formatBucket(bucket: string, groupBy: GroupBy): string {
  if (!bucket) return ''

  const dayMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucket)
  if (dayMatch) {
    const date = new Date(Number(dayMatch[1]), Number(dayMatch[2]) - 1, Number(dayMatch[3]))
    if (groupBy === 'month') {
      return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
    }
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  const monthMatch = /^(\d{4})-(\d{2})$/.exec(bucket)
  if (monthMatch) {
    const date = new Date(Number(monthMatch[1]), Number(monthMatch[2]) - 1, 1)
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }

  const weekMatch = /^(\d{4})-W(\d{1,2})$/.exec(bucket)
  if (weekMatch) return `W${weekMatch[2]}`

  const parsed = new Date(bucket)
  if (!Number.isNaN(parsed.getTime())) {
    if (groupBy === 'hour') {
      return parsed.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    }
    return parsed.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  }

  return bucket
}

export function groupLabel(groupBy: GroupBy): string {
  switch (groupBy) {
    case 'hour':
      return 'Hourly'
    case 'day':
      return 'Daily'
    case 'week':
      return 'Weekly'
    case 'month':
      return 'Monthly'
  }
}
