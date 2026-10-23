/** URL state parsing/patching shared by the dashboard and sessions filters. */

import { describe, expect, it } from 'vitest'

import {
  applyParamPatch,
  buildSessionsHref,
  parseEnum,
  parseMinCost,
  parsePageSize,
  parsePositiveInt,
  rangeInit,
  readGroupBy,
  readRangeState,
  withRange,
} from './searchParams'

describe('applyParamPatch', () => {
  it('sets truthy values and deletes empty ones', () => {
    const current = new URLSearchParams('range=7d&cwd=%2Fwork%2Falpha')
    const next = applyParamPatch(current, {
      range: '30d',
      cwd: null,
      model: undefined,
      q: '',
      minCost: false,
      page: 2,
      ignored: 0,
    })
    expect(next.get('range')).toBe('30d')
    expect(next.has('cwd')).toBe(false)
    expect(next.has('model')).toBe(false)
    expect(next.has('q')).toBe(false)
    expect(next.has('minCost')).toBe(false)
    expect(next.get('page')).toBe('2')
    expect(next.get('ignored')).toBe('0')
  })

  it('does not mutate the input params', () => {
    const current = new URLSearchParams('range=7d')
    applyParamPatch(current, { range: 'all' })
    expect(current.get('range')).toBe('7d')
  })
})

describe('scalar parsers', () => {
  it('parses enums with a fallback', () => {
    expect(parseEnum('cost', ['cost', 'tokens'] as const, 'cost')).toBe('cost')
    expect(parseEnum('bogus', ['cost', 'tokens'] as const, 'cost')).toBe('cost')
    expect(parseEnum(null, ['cost', 'tokens'] as const, 'tokens')).toBe('tokens')
  })

  it('parses positive integers', () => {
    expect(parsePositiveInt('3', 1)).toBe(3)
    expect(parsePositiveInt('0', 1)).toBe(1)
    expect(parsePositiveInt('-2', 1)).toBe(1)
    expect(parsePositiveInt('abc', 1)).toBe(1)
    expect(parsePositiveInt(null, 1)).toBe(1)
  })

  it('parses page size', () => {
    expect(parsePageSize('50')).toBe(50)
    expect(parsePageSize('100')).toBe(100)
    expect(parsePageSize('37')).toBe(25)
    expect(parsePageSize(undefined)).toBe(25)
  })

  it('parses minimum cost', () => {
    expect(parseMinCost('0.5')).toBe('0.5')
    expect(parseMinCost('0')).toBe('0')
    expect(parseMinCost('-1')).toBeUndefined()
    expect(parseMinCost('abc')).toBeUndefined()
    expect(parseMinCost('')).toBeUndefined()
  })
})

describe('readRangeState', () => {
  it('reads a preset range', () => {
    expect(readRangeState(new URLSearchParams('range=30d'), '7d')).toEqual({ range: '30d' })
  })

  it('falls back for unknown ranges', () => {
    expect(readRangeState(new URLSearchParams('range=year'), '7d')).toEqual({ range: '7d' })
    expect(readRangeState(new URLSearchParams(), '30d')).toEqual({ range: '30d' })
  })

  it('keeps valid custom ranges and rejects invalid ones', () => {
    expect(
      readRangeState(new URLSearchParams('range=custom&from=2026-01-01&to=2026-01-15'), '7d'),
    ).toEqual({ range: 'custom', from: '2026-01-01', to: '2026-01-15' })
    expect(readRangeState(new URLSearchParams('range=custom&from=2026-01-15'), '7d')).toEqual({
      range: '7d',
    })
    expect(
      readRangeState(new URLSearchParams('range=custom&from=2026-02-01&to=2026-01-01'), '7d'),
    ).toEqual({ range: '7d' })
  })

  it('drops from/to for preset ranges', () => {
    expect(
      readRangeState(new URLSearchParams('range=7d&from=2026-01-01&to=2026-01-02'), '30d'),
    ).toEqual({ range: '7d' })
  })
})

describe('readGroupBy', () => {
  it('honours an explicit group and otherwise derives it', () => {
    expect(readGroupBy(new URLSearchParams('group=month'), '7d')).toBe('month')
    expect(readGroupBy(new URLSearchParams('group=year'), 'today')).toBe('hour')
    expect(readGroupBy(new URLSearchParams(), 'all')).toBe('week')
    expect(readGroupBy(new URLSearchParams(), 'custom', '2026-01-01', '2026-03-01')).toBe('week')
  })
})

describe('withRange', () => {
  it('writes preset ranges and clears custom bounds', () => {
    const next = withRange(
      new URLSearchParams('range=custom&from=2026-01-01&to=2026-01-15&group=day'),
      { range: '7d' },
    )
    expect(next.get('range')).toBe('7d')
    expect(next.has('from')).toBe(false)
    expect(next.has('to')).toBe(false)
    expect(next.has('group')).toBe(false)
  })

  it('writes valid custom bounds and keeps group when asked', () => {
    const next = withRange(new URLSearchParams('group=day'), {
      range: 'custom',
      from: '2026-01-01',
      to: '2026-01-15',
    }, { keepGroup: true })
    expect(next.get('range')).toBe('custom')
    expect(next.get('from')).toBe('2026-01-01')
    expect(next.get('to')).toBe('2026-01-15')
    expect(next.get('group')).toBe('day')
  })

  it('omits invalid custom bounds', () => {
    const next = withRange(new URLSearchParams(), {
      range: 'custom',
      from: 'yesterday',
      to: 'today',
    })
    expect(next.get('range')).toBe('custom')
    expect(next.has('from')).toBe(false)
  })
})

describe('rangeInit', () => {
  it('includes bounds only for custom ranges', () => {
    expect(rangeInit('7d')).toEqual({ range: '7d' })
    expect(rangeInit('custom', '2026-01-01', '2026-01-15')).toEqual({
      range: 'custom',
      from: '2026-01-01',
      to: '2026-01-15',
    })
  })
})

describe('buildSessionsHref', () => {
  it('preserves the active range and appends filters', () => {
    expect(buildSessionsHref({ range: '7d' })).toBe('/sessions?range=7d')
    expect(buildSessionsHref({ range: '7d' }, { cwd: '/work/alpha', model: undefined })).toBe(
      '/sessions?range=7d&cwd=%2Fwork%2Falpha',
    )
    expect(buildSessionsHref({ range: 'custom', from: '2026-01-01', to: '2026-01-15' })).toBe(
      '/sessions?range=custom&from=2026-01-01&to=2026-01-15',
    )
  })
})
