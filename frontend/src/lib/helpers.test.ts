/** Small pure helpers: entry classification, query keys, chart colours, anchors. */

import { describe, expect, it, vi } from 'vitest'

import { classifyEntry, defaultOpenFor, isAssistantKind, isErrorKind, isToolResultKind, isUserKind } from './entryKind'
import { queryKeys } from './queryKeys'
import { COST_SEGMENTS, TOKEN_SERIES, projectColor } from './chartColors'
import { entryAnchor, prefersReducedMotion, scrollToAnchor, scrollToElement } from './anchors'
import { cn } from './cn'

describe('classifyEntry', () => {
  it('classifies message roles', () => {
    expect(classifyEntry('message', 'user', false)).toBe('user')
    expect(classifyEntry('message', 'assistant', false)).toBe('assistant')
    expect(classifyEntry('message', 'toolResult', false)).toBe('tool-result')
    expect(classifyEntry('message', 'tool_result', false)).toBe('tool-result')
    expect(classifyEntry('message', 'system', false)).toBe('system')
    expect(classifyEntry('message', 'system', true)).toBe('system-prompt')
    expect(classifyEntry('message', 'custom', false)).toBe('custom-message')
    expect(classifyEntry('message', 'unknown-role', false)).toBe('unknown')
  })

  it('classifies event types, including snake_case aliases', () => {
    expect(classifyEntry('model_change', undefined, false)).toBe('model-change')
    expect(classifyEntry('thinking_level_change', undefined, false)).toBe('thinking-level-change')
    expect(classifyEntry('branch_summary', undefined, false)).toBe('branch-summary')
    expect(classifyEntry('custom_message', undefined, false)).toBe('custom-message')
    expect(classifyEntry('system', undefined, false)).toBe('system')
    expect(classifyEntry('system', undefined, true)).toBe('system-prompt')
    expect(classifyEntry('who_knows', undefined, false)).toBe('unknown')
  })

  it('is case-sensitive: camelCase event types are not recognized (known gap)', () => {
    expect(classifyEntry('modelChange', undefined, false)).toBe('unknown')
    expect(classifyEntry('customMessage', undefined, false)).toBe('unknown')
  })
})

describe('kind predicates', () => {
  it('answers per kind', () => {
    expect(isUserKind('user')).toBe(true)
    expect(isUserKind('assistant')).toBe(false)
    expect(isAssistantKind('assistant')).toBe(true)
    expect(isToolResultKind('tool-result')).toBe(true)
    // The helper is documented as tool-result only, despite its name.
    expect(isErrorKind('tool-result')).toBe(true)
    expect(isErrorKind('assistant')).toBe(false)
  })

  it('starts every collapsible kind closed by default', () => {
    expect(defaultOpenFor('compaction')).toBe(false)
    expect(defaultOpenFor('system-prompt')).toBe(false)
    expect(defaultOpenFor('user')).toBe(false)
  })
})

describe('queryKeys', () => {
  it('produces stable keys that include params', () => {
    expect(queryKeys.health()).toEqual(['health'])
    expect(queryKeys.filters()).toEqual(['filters'])
    expect(queryKeys.summary({ range: '7d' })).toEqual(['summary', { range: '7d' }])
    expect(queryKeys.timeseries({ range: '7d' })).toEqual(['timeseries', { range: '7d' }])
    expect(queryKeys.byModel()).toEqual(['by-model', {}])
    expect(queryKeys.byProject()).toEqual(['by-project', {}])
    expect(queryKeys.sessions({ page: 2 })).toEqual(['sessions', { page: 2 }])
    expect(queryKeys.session('abc')).toEqual(['session', 'abc'])
    expect(queryKeys.sessionEntries('abc', { page: 1 })).toEqual(['session-entries', 'abc', { page: 1 }])
  })
})

describe('chartColors', () => {
  it('keeps the documented token series order', () => {
    expect(TOKEN_SERIES.map((series) => series.key)).toEqual([
      'inputTokens',
      'outputTokens',
      'reasoningTokens',
      'cacheReadTokens',
      'cacheWriteTokens',
    ])
    expect(TOKEN_SERIES.every((series) => series.color.startsWith('var(--chart-'))).toBe(true)
  })

  it('keeps the cost segment order (output, input, cache write, cache read)', () => {
    expect(COST_SEGMENTS.map((segment) => segment.key)).toEqual([
      'costInput',
      'costOutput',
      'costCacheRead',
      'costCacheWrite',
    ])
  })

  it('assigns a deterministic colour per working directory', () => {
    expect(projectColor('/work/alpha')).toBe(projectColor('/work/alpha'))
    expect(projectColor('/work/alpha')).toMatch(/^var\(--bar-project-[1-4]\)$/)
  })
})

describe('anchors', () => {
  it('derives entry anchors', () => {
    expect(entryAnchor(3)).toBe('entry-3')
  })

  it('returns null for unknown anchors', () => {
    expect(scrollToAnchor('does-not-exist')).toBeNull()
  })

  it('scrolls to and focuses a known anchor', () => {
    const element = document.createElement('div')
    element.id = 'entry-1'
    element.tabIndex = -1
    element.scrollIntoView = vi.fn()
    document.body.appendChild(element)

    expect(scrollToAnchor('entry-1', { smooth: false })).toBe(element)
    expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })
    expect(document.activeElement).toBe(element)

    scrollToAnchor('entry-1', { smooth: true, focus: false })
    expect(element.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center' })
    element.remove()
  })

  it('ignores a null element and scrolls real ones to the end', () => {
    expect(() => scrollToElement(null)).not.toThrow()
    const element = document.createElement('div')
    element.scrollIntoView = vi.fn()
    scrollToElement(element, { smooth: false })
    expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'end' })
  })

  it('honours reduced motion when no smooth option is given', () => {
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia
    const element = document.createElement('div')
    element.id = 'entry-2'
    element.scrollIntoView = vi.fn()
    document.body.appendChild(element)

    scrollToAnchor('entry-2', { focus: false })
    expect(element.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'center' })

    scrollToElement(element)
    expect(element.scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'end' })

    window.matchMedia = original
    element.remove()
  })

  it('reports reduced motion from matchMedia', () => {
    // The shared setup stubs matchMedia with matches: false.
    expect(prefersReducedMotion()).toBe(false)
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: true })) as unknown as typeof window.matchMedia
    expect(prefersReducedMotion()).toBe(true)
    window.matchMedia = original
  })
})

describe('cn', () => {
  it('joins truthy class names', () => {
    expect(cn('a', false, undefined, null, 'b')).toBe('a b')
    expect(cn()).toBe('')
  })
})
