/** Range keys, custom-range validation, grouping defaults and bucket labels. */

import { describe, expect, it } from 'vitest'

import {
  GROUP_KEYS,
  RANGE_KEYS,
  RANGE_OPTIONS,
  defaultGroupBy,
  formatBucket,
  groupLabel,
  isGroupBy,
  isIsoDate,
  isRangeKey,
  isValidCustomRange,
  rangeApiParams,
  rangeEyebrow,
  rangeLabel,
} from './dateRange'

describe('range key guards', () => {
  it('accepts only supported keys', () => {
    for (const key of RANGE_KEYS) expect(isRangeKey(key)).toBe(true)
    expect(isRangeKey('30days')).toBe(false)
    expect(isRangeKey(null)).toBe(false)
    expect(isRangeKey('')).toBe(false)
    for (const key of GROUP_KEYS) expect(isGroupBy(key)).toBe(true)
    expect(isGroupBy('year')).toBe(false)
  })

  it('exposes four selectable presets (custom is URL-only)', () => {
    expect(RANGE_OPTIONS.map((option) => option.value)).toEqual(['today', '7d', '30d', 'all'])
  })
})

describe('custom range validation', () => {
  it('requires both ISO dates and from <= to', () => {
    expect(isIsoDate('2026-01-15')).toBe(true)
    expect(isIsoDate('2026-1-5')).toBe(false)
    expect(isValidCustomRange('2026-01-01', '2026-01-15')).toBe(true)
    expect(isValidCustomRange('2026-01-15', '2026-01-01')).toBe(false)
    expect(isValidCustomRange(undefined, '2026-01-15')).toBe(false)
  })

  it('sends from/to only for valid custom ranges', () => {
    expect(rangeApiParams('7d')).toEqual({ range: '7d' })
    expect(rangeApiParams('custom', '2026-01-01', '2026-01-15')).toEqual({
      range: 'custom',
      from: '2026-01-01',
      to: '2026-01-15',
    })
    // Reversed range falls back to the preset-only payload.
    expect(rangeApiParams('custom', '2026-01-15', '2026-01-01')).toEqual({ range: 'custom' })
  })
})

describe('defaultGroupBy', () => {
  it('maps presets to buckets', () => {
    expect(defaultGroupBy('today')).toBe('hour')
    expect(defaultGroupBy('7d')).toBe('day')
    expect(defaultGroupBy('30d')).toBe('day')
    expect(defaultGroupBy('all')).toBe('week')
  })

  it('uses the span for custom ranges', () => {
    expect(defaultGroupBy('custom', '2026-01-01', '2026-01-10')).toBe('day')
    expect(defaultGroupBy('custom', '2026-01-01', '2026-03-01')).toBe('week')
    // Missing bounds fall back to day.
    expect(defaultGroupBy('custom')).toBe('day')
  })
})

describe('labels', () => {
  it('labels presets and custom ranges', () => {
    expect(rangeLabel('today')).toBe('Today')
    expect(rangeLabel('7d')).toBe('Last 7 days')
    expect(rangeLabel('30d')).toBe('Last 30 days')
    expect(rangeLabel('all')).toBe('All time')
    expect(rangeLabel('custom')).toBe('Custom range')
    expect(rangeLabel('custom', '2026-01-01', '2026-01-15')).toMatch(/–/)
  })

  it('uppercases the eyebrow for every range', () => {
    expect(rangeEyebrow('7d')).toBe('LAST 7 DAYS')
    expect(rangeEyebrow('custom', '2026-01-01', '2026-01-15')).toBe(
      rangeLabel('custom', '2026-01-01', '2026-01-15').toUpperCase(),
    )
  })

  it('labels groupings', () => {
    expect(groupLabel('hour')).toBe('Hourly')
    expect(groupLabel('day')).toBe('Daily')
    expect(groupLabel('week')).toBe('Weekly')
    expect(groupLabel('month')).toBe('Monthly')
  })
})

describe('formatBucket', () => {
  it('formats day, month and week buckets', () => {
    expect(formatBucket('', 'day')).toBe('')
    expect(formatBucket('2026-01-15', 'day')).toMatch(/15/)
    expect(formatBucket('2026-01-15', 'month')).toContain('2026')
    expect(formatBucket('2026-01', 'day')).toContain('2026')
    expect(formatBucket('2026-W03', 'week')).toBe('W03')
  })

  it('formats full ISO timestamps per grouping', () => {
    const hourly = formatBucket('2026-01-15T09:00:00.000Z', 'hour')
    expect(hourly).toMatch(/\d/)
    expect(hourly).toContain(':')
    const daily = formatBucket('2026-01-15T09:00:00.000Z', 'day')
    expect(daily).not.toContain(':')
  })

  it('passes unknown buckets through unchanged', () => {
    expect(formatBucket('not-a-bucket', 'day')).toBe('not-a-bucket')
  })
})
