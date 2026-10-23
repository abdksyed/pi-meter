/* Presentation formatting. Raw values are never rounded before aggregation. */

const EM_DASH = '\u2014'

export function formatCost(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH
  const abs = Math.abs(value)
  if (abs >= 1) return `$${value.toFixed(2)}`
  if (abs >= 0.01) return `$${value.toFixed(4)}`
  return `$${value.toFixed(6)}`
}

export function formatCostExact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH
  return `$${value.toFixed(6)}`
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH
  const abs = Math.abs(value)
  if (abs < 1_000) return String(Math.round(value))
  if (abs < 1_000_000) return `${(value / 1_000).toFixed(1)}K`
  return `${(value / 1_000_000).toFixed(2)}M`
}

export function formatTokensExact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH
  return Math.round(value).toLocaleString()
}

/** `value` is a ratio between 0 and 1. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH
  return `${(value * 100).toFixed(digits)}%`
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return EM_DASH
  if (ms < 1_000) return `${Math.round(ms)} ms`
  if (ms < 60_000) return `${(ms / 1_000).toFixed(1)} s`
  const minutes = Math.floor(ms / 60_000)
  const seconds = Math.round((ms % 60_000) / 1_000)
  return `${minutes}m ${seconds}s`
}

export function formatRelativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return EM_DASH
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return EM_DASH

  const seconds = Math.round((now - time) / 1_000)
  if (seconds < 10) return 'just now'
  if (seconds < 60) return `${seconds}s ago`

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`

  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`

  return formatDateTime(iso, { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string | null | undefined, options?: Intl.DateTimeFormatOptions): string {
  if (!iso) return EM_DASH
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return EM_DASH
  return new Intl.DateTimeFormat(undefined, options ?? { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return EM_DASH
  return value.toLocaleString()
}

/** Last path segment, used as a project label. */
export function projectSlug(cwd: string | null | undefined): string {
  if (!cwd) return EM_DASH
  const parts = cwd.replace(/\/+$/, '').split('/')
  return parts[parts.length - 1] || cwd
}

/** Middle-truncates a long path so the leaf directory stays readable. */
export function shortenPath(path: string | null | undefined, maxChars = 44): string {
  if (!path) return EM_DASH
  if (path.length <= maxChars) return path
  const head = path.slice(0, Math.max(4, Math.floor(maxChars / 3)))
  const tail = path.slice(-(maxChars - head.length - 1))
  return `${head}\u2026${tail}`
}
