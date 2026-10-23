/**
 * Formatting helpers: cost, tokens, percent, duration, relative time, paths.
 * Raw values are never rounded before aggregation, so formatting must keep the
 * documented precision tiers.
 */

import { describe, expect, it } from 'vitest'

import {
  formatCost,
  formatCostExact,
  formatDateTime,
  formatDuration,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTokens,
  formatTokensExact,
  projectSlug,
  shortenPath,
} from './format'

const EM_DASH = '\u2014'
const NOW = Date.parse('2026-01-15T09:00:00.000Z')

describe('formatCost', () => {
  it('uses precision tiers from dollars down to micro-dollars', () => {
    expect(formatCost(1.2345)).toBe('$1.23')
    expect(formatCost(0.019409)).toBe('$0.0194')
    expect(formatCost(0.000004)).toBe('$0.000004')
    expect(formatCost(0)).toBe('$0.000000')
  })

  it('formats negative values by magnitude', () => {
    expect(formatCost(-2.5)).toBe('$-2.50')
    expect(formatCost(-0.5)).toBe('$-0.5000')
  })

  it('returns an em dash for missing or non-finite values', () => {
    expect(formatCost(null)).toBe(EM_DASH)
    expect(formatCost(undefined)).toBe(EM_DASH)
    expect(formatCost(Number.NaN)).toBe(EM_DASH)
    expect(formatCost(Number.POSITIVE_INFINITY)).toBe(EM_DASH)
  })

  it('formats exact cost with six decimals', () => {
    expect(formatCostExact(0.019409)).toBe('$0.019409')
    expect(formatCostExact(null)).toBe(EM_DASH)
  })
})

describe('formatTokens', () => {
  it('switches between raw, K and M units', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1_000)).toBe('1.0K')
    expect(formatTokens(10_725)).toBe('10.7K')
    expect(formatTokens(1_500_000)).toBe('1.50M')
  })

  it('returns an em dash for missing values', () => {
    expect(formatTokens(undefined)).toBe(EM_DASH)
    expect(formatTokens(Number.NaN)).toBe(EM_DASH)
  })

  it('formats exact tokens with grouped digits', () => {
    expect(formatTokensExact(10_725)).toBe('10,725')
    expect(formatTokensExact(undefined)).toBe(EM_DASH)
    expect(formatNumber(1_234)).toBe('1,234')
    expect(formatNumber(null)).toBe(EM_DASH)
  })
})

describe('formatPercent', () => {
  it('treats the input as a 0..1 ratio', () => {
    expect(formatPercent(0.024)).toBe('2.4%')
    expect(formatPercent(1)).toBe('100.0%')
    expect(formatPercent(0.1234, 2)).toBe('12.34%')
  })

  it('returns an em dash for missing values', () => {
    expect(formatPercent(undefined)).toBe(EM_DASH)
  })
})

describe('formatDuration', () => {
  it('formats ms, seconds and minutes', () => {
    expect(formatDuration(420)).toBe('420 ms')
    expect(formatDuration(1_500)).toBe('1.5 s')
    expect(formatDuration(160_000)).toBe('2m 40s')
    expect(formatDuration(0)).toBe('0 ms')
  })

  it('returns an em dash for missing values', () => {
    expect(formatDuration(null)).toBe(EM_DASH)
  })
})

describe('formatRelativeTime', () => {
  const cases: [string, string][] = [
    ['2026-01-15T08:59:57.000Z', 'just now'],
    ['2026-01-15T08:59:40.000Z', '20s ago'],
    ['2026-01-15T08:55:00.000Z', '5m ago'],
    ['2026-01-15T06:00:00.000Z', '3h ago'],
    ['2026-01-14T09:00:00.000Z', 'Yesterday'],
    ['2026-01-12T09:00:00.000Z', '3d ago'],
  ]

  it.each(cases)('formats %s as %s', (iso, expected) => {
    expect(formatRelativeTime(iso, NOW)).toBe(expected)
  })

  it('falls back to a short date for anything older than a week', () => {
    const formatted = formatRelativeTime('2025-12-01T09:00:00.000Z', NOW)
    expect(formatted).not.toMatch(/ago|Yesterday/)
    expect(formatted).toMatch(/Dec|12/)
  })

  it('returns an em dash for missing or invalid timestamps', () => {
    expect(formatRelativeTime(null, NOW)).toBe(EM_DASH)
    expect(formatRelativeTime('not-a-date', NOW)).toBe(EM_DASH)
  })
})

describe('formatDateTime', () => {
  it('formats a valid timestamp with explicit options', () => {
    const formatted = formatDateTime('2026-01-15T09:00:00.000Z', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      timeZone: 'UTC',
    })
    expect(formatted).toContain('2026')
    expect(formatted).toMatch(/\d{2}\D\d{2}/)
  })

  it('returns an em dash for missing or invalid timestamps', () => {
    expect(formatDateTime(null)).toBe(EM_DASH)
    expect(formatDateTime('nope')).toBe(EM_DASH)
  })
})

describe('path helpers', () => {
  it('derives the last path segment, ignoring trailing slashes', () => {
    expect(projectSlug('/work/alpha/')).toBe('alpha')
    expect(projectSlug('/')).toBe('/')
    expect(projectSlug(null)).toBe(EM_DASH)
  })

  it('shortens long paths while keeping the leaf directory', () => {
    const path = '/very/long/working/directory/tree/that/keeps/going/leaf-dir'
    const shortened = shortenPath(path, 20)
    expect(shortened.length).toBe(20)
    expect(shortened).toContain('\u2026')
    expect(shortened.endsWith('leaf-dir')).toBe(true)
    expect(shortenPath('/short', 20)).toBe('/short')
    expect(shortenPath(undefined)).toBe(EM_DASH)
  })
})
