/** Transcript search: match counting, minimum query length and highlight splitting. */

import { describe, expect, it } from 'vitest'

import { buildSearchUnits, countOccurrences, findMatches, splitHighlight } from './search'
import type { TranscriptItem } from './sessionTypes'
import { entryAnchor } from './anchors'

function item(partial: Partial<TranscriptItem> & { key: string }): TranscriptItem {
  return {
    type: 'user',
    entry: { key: partial.key, index: 0, type: 'message', kind: 'user', isError: false, content: [], readFiles: [], modifiedFiles: [], raw: {} },
    anchor: partial.key,
    executions: [],
    searchText: '',
    ...partial,
  }
}

const ITEMS: TranscriptItem[] = [
  item({ key: 'entry-0', searchText: 'Refactor the parser pipeline.' }),
  item({ key: 'entry-1', searchText: 'parser parser parser' }),
  item({ key: 'entry-2', type: 'system-prompt', searchText: 'hidden system prompt parser' }),
  item({ key: 'entry-3', searchText: '' }),
]

describe('buildSearchUnits', () => {
  it('skips system prompts and empty search text', () => {
    expect(buildSearchUnits(ITEMS).map((unit) => unit.key)).toEqual(['entry-0', 'entry-1'])
  })
})

describe('countOccurrences', () => {
  it('counts case-insensitive, non-overlapping matches', () => {
    expect(countOccurrences('Parser parser PARSER', 'parser')).toBe(3)
    expect(countOccurrences('aaaa', 'aa')).toBe(2)
    expect(countOccurrences('nothing here', 'zzz')).toBe(0)
    expect(countOccurrences('anything', '')).toBe(0)
  })
})

describe('findMatches', () => {
  it('requires at least two characters of query', () => {
    expect(findMatches(buildSearchUnits(ITEMS), '')).toEqual([])
    expect(findMatches(buildSearchUnits(ITEMS), 'p')).toEqual([])
    expect(findMatches(buildSearchUnits(ITEMS), '  p  ')).toEqual([])
  })

  it('returns one match per matching unit with occurrence counts', () => {
    expect(findMatches(buildSearchUnits(ITEMS), 'parser')).toEqual([
      { key: 'entry-0', anchor: 'entry-0', count: 1 },
      { key: 'entry-1', anchor: 'entry-1', count: 3 },
    ])
  })

  it('trims the query before matching', () => {
    expect(findMatches(buildSearchUnits(ITEMS), '  pipeline  ')).toEqual([
      { key: 'entry-0', anchor: 'entry-0', count: 1 },
    ])
  })

  it('never matches the excluded system prompt', () => {
    expect(findMatches(buildSearchUnits(ITEMS), 'hidden')).toEqual([])
  })
})

describe('splitHighlight', () => {
  it('returns a single plain segment without a query', () => {
    expect(splitHighlight('hello', '')).toEqual([{ text: 'hello', hit: false }])
    expect(splitHighlight('hello', '   ')).toEqual([{ text: 'hello', hit: false }])
  })

  it('marks every hit and keeps the surrounding text', () => {
    expect(splitHighlight('a parser b parser c', 'parser')).toEqual([
      { text: 'a ', hit: false },
      { text: 'parser', hit: true },
      { text: ' b ', hit: false },
      { text: 'parser', hit: true },
      { text: ' c', hit: false },
    ])
  })

  it('handles a match at the start and at the end', () => {
    expect(splitHighlight('parser!', 'parser')).toEqual([
      { text: 'parser', hit: true },
      { text: '!', hit: false },
    ])
    expect(splitHighlight('!parser', 'parser')).toEqual([
      { text: '!', hit: false },
      { text: 'parser', hit: true },
    ])
  })

  it('preserves the original casing of hits', () => {
    expect(splitHighlight('PARSER', 'parser')).toEqual([{ text: 'PARSER', hit: true }])
  })

  it('renders text as plain markup-free content (no HTML interpretation)', () => {
    const segments = splitHighlight('<img src=x onerror=alert(1)> parser', '<img')
    expect(segments.map((segment) => segment.text).join('')).toBe(
      '<img src=x onerror=alert(1)> parser',
    )
    expect(segments.filter((segment) => segment.hit)).toHaveLength(1)
  })
})

describe('entryAnchor', () => {
  it('derives stable anchors from the entry index', () => {
    expect(entryAnchor(0)).toBe('entry-0')
    expect(entryAnchor(42)).toBe('entry-42')
  })
})
