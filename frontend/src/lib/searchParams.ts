import type { URLSearchParamsInit } from 'react-router-dom'
import { defaultGroupBy, isGroupBy, isIsoDate, isRangeKey, isValidCustomRange } from './dateRange'
import type { GroupBy, RangeKey, RangeState } from './dateRange'

export type ParamValue = string | number | boolean | null | undefined

export function applyParamPatch(
  current: URLSearchParams,
  patch: Record<string, ParamValue>,
): URLSearchParams {
  const next = new URLSearchParams(current)
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || value === null || value === '' || value === false) {
      next.delete(key)
    } else {
      next.set(key, String(value))
    }
  }
  return next
}

export function parseEnum<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback
}

export function parsePositiveInt(value: string | null | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

export function parsePageSize(
  value: string | null | undefined,
  fallback: 25 | 50 | 100 = 25,
): 25 | 50 | 100 {
  const parsed = Number.parseInt(value ?? '', 10)
  return parsed === 50 || parsed === 100 ? parsed : fallback
}

export function parseMinCost(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) && parsed >= 0 ? value : undefined
}

export function readRangeState(params: URLSearchParams, fallback: RangeKey): RangeState {
  const range = isRangeKey(params.get('range')) ? (params.get('range') as RangeKey) : fallback
  const from = params.get('from') ?? undefined
  const to = params.get('to') ?? undefined
  if (range === 'custom' && !isValidCustomRange(from, to)) {
    return { range: fallback }
  }
  if (range === 'custom') return { range, from, to }
  return { range }
}

export function readGroupBy(
  params: URLSearchParams,
  range: RangeKey,
  from?: string,
  to?: string,
): GroupBy {
  const value = params.get('group')
  return isGroupBy(value) ? value : defaultGroupBy(range, from, to)
}

export function withRange(
  current: URLSearchParams,
  state: RangeState,
  options: { keepGroup?: boolean } = {},
): URLSearchParams {
  const patch: Record<string, ParamValue> = {
    range: state.range,
    from: state.range === 'custom' && isIsoDate(state.from) ? state.from : null,
    to: state.range === 'custom' && isIsoDate(state.to) ? state.to : null,
  }
  if (!options.keepGroup) patch.group = null
  return applyParamPatch(current, patch)
}

export function rangeInit(
  range: RangeKey,
  from?: string,
  to?: string,
): URLSearchParamsInit {
  return {
    range,
    ...(range === 'custom' && from && to ? { from, to } : {}),
  }
}

/** Cross-page link that preserves the active range and adds optional filters. */
export function buildSessionsHref(
  range: RangeState,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams()
  params.set('range', range.range)
  if (range.range === 'custom' && range.from && range.to) {
    params.set('from', range.from)
    params.set('to', range.to)
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value)
  }
  return `/sessions?${params.toString()}`
}
