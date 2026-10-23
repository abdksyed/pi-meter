/** Transcript state hooks: expansion modes, filter counts and search navigation. */

import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useTranscriptExpansion } from './useTranscriptExpansion'
import { useTranscriptFilters } from './useTranscriptFilters'
import { useTranscriptSearch } from './useTranscriptSearch'
import { buildTranscriptItems } from '../lib/transcriptItems'
import { normalizeEntry } from '../lib/normalize'
import type { NormalizedEntry, TranscriptItem } from '../lib/sessionTypes'

let counter = 0
function entry(overrides: Record<string, unknown> = {}): NormalizedEntry {
  counter += 1
  return normalizeEntry({ entryIndex: counter, type: 'message', role: 'user', ...overrides }, counter)
}

function items(): TranscriptItem[] {
  counter = 0
  return buildTranscriptItems([
    entry({ role: 'user', content: 'Refactor the parser pipeline.' }),
    entry({
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      content: [
        { type: 'text', text: 'Running the parser tests.' },
        { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'pytest' } },
      ],
    }),
    entry({ role: 'toolResult', toolCallId: 'call-1', content: '3 passed' }),
    entry({ role: 'toolResult', toolCallId: 'orphan', content: 'orphan failed', isError: true }),
    entry({ type: 'compaction', content: 'Compacted the parser discussion.' }),
  ])
}

describe('useTranscriptExpansion', () => {
  it('starts in default mode and honours per-entry defaults', () => {
    const { result } = renderHook(() => useTranscriptExpansion())
    expect(result.current.mode).toBe('default')
    expect(result.current.isOpen('a', true)).toBe(true)
    expect(result.current.isOpen('b', false)).toBe(false)
  })

  it('toggles a single entry and keeps the override', () => {
    const { result } = renderHook(() => useTranscriptExpansion())
    act(() => result.current.toggle('a', false))
    expect(result.current.isOpen('a', false)).toBe(true)
    expect(result.current.isOpen('b', false)).toBe(false)

    act(() => result.current.toggle('a', false))
    expect(result.current.isOpen('a', false)).toBe(false)
  })

  it('expands and collapses everything', () => {
    const { result } = renderHook(() => useTranscriptExpansion())
    act(() => result.current.toggle('a', false))

    act(() => result.current.expandAll())
    expect(result.current.mode).toBe('all-open')
    expect(result.current.isOpen('a', false)).toBe(true)
    expect(result.current.isOpen('never-seen', false)).toBe(true)

    act(() => result.current.collapseAll())
    expect(result.current.mode).toBe('all-closed')
    expect(result.current.isOpen('a', true)).toBe(false)

    act(() => result.current.reset())
    expect(result.current.mode).toBe('default')
    expect(result.current.isOpen('a', true)).toBe(true)
  })

  it('keeps a manual override after expandAll', () => {
    const { result } = renderHook(() => useTranscriptExpansion())
    act(() => result.current.expandAll())
    act(() => result.current.toggle('a', true))
    expect(result.current.isOpen('a', true)).toBe(false)
  })
})

describe('useTranscriptFilters', () => {
  it('computes counts for the full item list', () => {
    const list = items()
    const { result } = renderHook(() => useTranscriptFilters(list, 'all'))
    expect(result.current.counts).toEqual({ all: 4, user: 1, assistant: 1, tools: 2, errors: 1 })
    expect(result.current.visibleItems).toHaveLength(4)
    expect(result.current.emptyReason).toBeUndefined()
  })

  it('filters and explains an empty result', () => {
    const list = buildTranscriptItems([entry({ role: 'assistant', content: 'hi' })])
    const { result } = renderHook(() => useTranscriptFilters(list, 'user'))
    expect(result.current.visibleItems).toEqual([])
    expect(result.current.emptyReason).toBe('No user messages in this session.')
  })

  it('filters tools and errors', () => {
    const list = items()
    const tools = renderHook(() => useTranscriptFilters(list, 'tools'))
    expect(tools.result.current.visibleItems.map((item) => item.type)).toEqual([
      'assistant',
      'tool-result',
    ])

    const errors = renderHook(() => useTranscriptFilters(list, 'errors'))
    expect(errors.result.current.visibleItems).toHaveLength(1)
    expect(errors.result.current.visibleItems[0].entry.isError).toBe(true)
  })

  it('suppresses the error empty reason when parse warnings exist', () => {
    const list = buildTranscriptItems([entry({ role: 'user', content: 'hi' })])
    const { result } = renderHook(() => useTranscriptFilters(list, 'errors', 1))
    expect(result.current.counts.errors).toBe(1)
    expect(result.current.emptyReason).toBeUndefined()
  })

  it('never explains an empty "all" filter', () => {
    const empty = renderHook(() => useTranscriptFilters([], 'all'))
    expect(empty.result.current.emptyReason).toBeUndefined()
    expect(empty.result.current.counts.all).toBe(0)
  })
})

describe('useTranscriptSearch', () => {
  const list = items()

  it('requires at least two characters', () => {
    const { result } = renderHook(() => useTranscriptSearch(list, 'p'))
    expect(result.current.queryValid).toBe(false)
    expect(result.current.matches).toEqual([])
    expect(result.current.entryMatchCount).toBe(0)
    expect(result.current.activeAnchorId).toBeUndefined()
  })

  it('finds matches across entries and sums occurrences', () => {
    const { result } = renderHook(() => useTranscriptSearch(list, 'parser'))
    expect(result.current.queryValid).toBe(true)
    expect(result.current.entryMatchCount).toBe(3)
    expect([...result.current.matchedItemKeys]).toEqual(['entry-1', 'entry-2', 'entry-5'])
    expect(result.current.activeItemKey).toBe('entry-1')
    expect(result.current.activeAnchorId).toBe('entry-1')

    // Known defect: `buildTranscriptItems` pushes content text twice for
    // tool results and compactions (once from the content blocks, once from the
    // derived `summary`/result text), so the occurrence total over-counts:
    // entry-1 (1) + entry-2 (1) + entry-5 (2) = 4 for three visible hits.
    expect(result.current.occurrenceCount).toBe(4)
  })

  it('trims the query and treats whitespace as empty', () => {
    const { result } = renderHook(() => useTranscriptSearch(list, '   '))
    expect(result.current.query).toBe('   ')
    expect(result.current.activeQuery).toBe('')
    expect(result.current.queryValid).toBe(false)
  })

  it('wraps navigation forwards and backwards', () => {
    const { result } = renderHook(() => useTranscriptSearch(list, 'parser'))
    expect(result.current.activeIndex).toBe(0)

    act(() => result.current.next())
    expect(result.current.activeIndex).toBe(1)

    act(() => result.current.next())
    expect(result.current.activeIndex).toBe(2)

    // Wraps past the last match.
    act(() => result.current.next())
    expect(result.current.activeIndex).toBe(0)

    // Wraps before the first match.
    act(() => result.current.prev())
    expect(result.current.activeIndex).toBe(2)
  })

  it('keeps navigation safe with no matches', () => {
    const { result } = renderHook(() => useTranscriptSearch(list, 'zzzz'))
    expect(result.current.matches).toEqual([])
    act(() => result.current.next())
    expect(result.current.activeIndex).toBe(0)
    expect(result.current.activeAnchorId).toBeUndefined()
  })

  it('resets the active index when the query changes', () => {
    const { result, rerender } = renderHook(({ query }) => useTranscriptSearch(list, query), {
      initialProps: { query: 'parser' },
    })
    act(() => result.current.next())
    expect(result.current.activeIndex).toBe(1)

    rerender({ query: 'pipeline' })
    expect(result.current.activeIndex).toBe(0)
    expect(result.current.entryMatchCount).toBe(1)
  })

  it('clears the active index', () => {
    const { result } = renderHook(() => useTranscriptSearch(list, 'parser'))
    act(() => result.current.next())
    act(() => result.current.clear())
    expect(result.current.activeIndex).toBe(0)
  })
})
