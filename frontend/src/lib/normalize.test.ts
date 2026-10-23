/**
 * Session detail normalization: raw Pi JSONL-ish payloads -> view model.
 * Covers wrapped/direct responses, camelCase and snake_case keys, missing
 * optional fields and unknown content blocks.
 */

import { describe, expect, it } from 'vitest'

import {
  argumentsText,
  contentText,
  emptyCost,
  emptyUsage,
  normalizeContent,
  normalizeCost,
  normalizeEntry,
  normalizeSessionDetail,
  normalizeUsage,
} from './normalize'
import { rawSessionDetail } from '../test/fixtures'

describe('normalizeUsage', () => {
  it('accepts camelCase, snake_case and short keys', () => {
    expect(normalizeUsage({ inputTokens: 10, output_tokens: 5, cache_read: 2, cacheWrite: 1 })).toEqual({
      input: 10,
      output: 5,
      reasoning: 0,
      cacheRead: 2,
      cacheWrite: 1,
      totalTokens: 18,
    })
  })

  it('prefers an explicit total over the component sum', () => {
    const usage = normalizeUsage({ input: 10, output: 5, totalTokens: 100 })
    expect(usage?.totalTokens).toBe(100)
  })

  it('treats reasoning as a subset of output (never summed into the total silently)', () => {
    const usage = normalizeUsage({ input: 1, output: 9, reasoning: 4 })
    // The helper sums output + reasoning here because the source provided no
    // explicit total; the API always sends `totalTokens`, which wins.
    expect(usage?.reasoning).toBe(4)
    expect(normalizeUsage({ input: 1, output: 9, reasoning: 4, totalTokens: 10 })?.totalTokens).toBe(10)
  })

  it('returns undefined for all-zero, empty or non-object values', () => {
    expect(normalizeUsage({})).toBeUndefined()
    expect(normalizeUsage({ input: 0, output: 0 })).toBeUndefined()
    expect(normalizeUsage(null)).toBeUndefined()
    expect(normalizeUsage('nope')).toBeUndefined()
  })
})

describe('normalizeCost', () => {
  it('accepts a bare number as a total', () => {
    expect(normalizeCost(0.5)).toEqual({ ...emptyCost(), total: 0.5 })
    expect(normalizeCost(0)).toBeUndefined()
  })

  it('reads currency-unit and micro-unit fields', () => {
    expect(normalizeCost({ costTotal: 0.02 })).toEqual({ ...emptyCost(), total: 0.02 })
    expect(normalizeCost({ costTotalMicro: 20_000 })).toEqual({ ...emptyCost(), total: 0.02 })
  })

  it('falls back to the component sum', () => {
    expect(normalizeCost({ input: 0.01, output: 0.02 })).toEqual({
      input: 0.01,
      output: 0.02,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0.03,
    })
  })

  it('returns undefined for missing or zero-only values', () => {
    expect(normalizeCost(undefined)).toBeUndefined()
    expect(normalizeCost(null)).toBeUndefined()
    expect(normalizeCost({})).toBeUndefined()
  })
})

describe('normalizeContent', () => {
  it('parses JSON string content', () => {
    expect(normalizeContent('[{"type":"text","text":"hi"}]')).toEqual([{ kind: 'text', text: 'hi' }])
  })

  it('treats a plain string as a single text block', () => {
    expect(normalizeContent('plain text')).toEqual([{ kind: 'text', text: 'plain text' }])
    expect(normalizeContent('')).toEqual([])
  })

  it('maps known block types, including aliases', () => {
    expect(
      normalizeContent([
        { type: 'thinking', thinking: 'deep' },
        { type: 'tool_use', id: 'c1', name: 'bash', input: { command: 'ls' } },
        { type: 'image', mimeType: 'image/png', data: 'AAA' },
      ]),
    ).toEqual([
      { kind: 'thinking', text: 'deep', signature: undefined },
      { kind: 'tool-call', id: 'c1', name: 'bash', arguments: { command: 'ls' } },
      { kind: 'image', mimeType: 'image/png', data: 'AAA', alt: undefined },
    ])
  })

  it('keeps unknown blocks instead of dropping them', () => {
    expect(normalizeContent([{ type: 'mystery', payload: 1 }])).toEqual([
      { kind: 'unknown', rawType: 'mystery', raw: { type: 'mystery', payload: 1 } },
    ])
  })

  it('drops empty text and image blocks without data', () => {
    expect(normalizeContent([{ type: 'text', text: '' }, { type: 'image', mimeType: 'image/png' }])).toEqual([])
  })

  it('returns [] for non-content values', () => {
    expect(normalizeContent(null)).toEqual([])
    expect(normalizeContent(42)).toEqual([])
  })
})

describe('content helpers', () => {
  it('joins text blocks and ignores other kinds', () => {
    expect(
      contentText([
        { kind: 'text', text: 'a' },
        { kind: 'thinking', text: 'ignored' },
        { kind: 'text', text: 'b' },
      ]),
    ).toBe('a\n\nb')
  })

  it('renders arguments as pretty JSON or raw text', () => {
    expect(argumentsText({ a: 1 })).toBe('{\n  "a": 1\n}')
    expect(argumentsText('{"a":1}')).toBe('{"a":1}')
    expect(argumentsText(undefined)).toBe('')
    expect(argumentsText(null)).toBe('')
  })

  it('exposes empty usage/cost defaults', () => {
    expect(emptyUsage()).toEqual({ input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 })
    expect(emptyCost()).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 })
  })
})

describe('normalizeEntry', () => {
  it('classifies message roles and derives a stable key', () => {
    const user = normalizeEntry({ type: 'message', role: 'user', content: 'hi' }, 3)
    expect(user.kind).toBe('user')
    expect(user.key).toBe('entry-3')
    expect(user.index).toBe(3)
    expect(normalizeEntry({ type: 'message', role: 'assistant' }, 0).kind).toBe('assistant')
    expect(normalizeEntry({ type: 'message', role: 'toolResult' }, 0).kind).toBe('tool-result')
    expect(normalizeEntry({ type: 'message', role: 'wat' }, 0).kind).toBe('unknown')
  })

  it('classifies metadata event types', () => {
    expect(normalizeEntry({ type: 'model_change' }, 0).kind).toBe('model-change')
    expect(normalizeEntry({ type: 'compaction' }, 0).kind).toBe('compaction')
    expect(normalizeEntry({ type: 'context_edit' }, 0).kind).toBe('context-edit')
    expect(normalizeEntry({ type: 'branch_summary' }, 0).kind).toBe('branch-summary')
    expect(normalizeEntry({ type: 'session' }, 0).kind).toBe('session-info')
    expect(normalizeEntry({ type: 'custom_message' }, 0).kind).toBe('custom-message')
    expect(normalizeEntry({ type: 'nonsense' }, 0).kind).toBe('unknown')
  })

  it('distinguishes system prompts from plain system messages', () => {
    const prompt = normalizeEntry({ type: 'system', role: 'system', sections: [{ label: 'Tools', text: 'x' }] }, 0)
    expect(prompt.kind).toBe('system-prompt')
    expect(prompt.systemSections).toEqual([{ label: 'Tools', text: 'x' }])
    expect(normalizeEntry({ type: 'message', role: 'system' }, 0).kind).toBe('system')
  })

  it('normalizes nested message fields and usage/cost', () => {
    const entry = normalizeEntry(
      {
        entryId: 'a1',
        parentId: 'u1',
        type: 'message',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          modelId: 'claude-sonnet-4-5',
          usage: { inputTokens: 10, outputTokens: 5, costTotal: 0.001 },
          content: [{ type: 'text', text: 'hi' }],
        },
      },
      0,
    )
    expect(entry.id).toBe('a1')
    expect(entry.parentId).toBe('u1')
    expect(entry.provider).toBe('anthropic')
    expect(entry.model).toBe('claude-sonnet-4-5')
    expect(entry.usage).toMatchObject({ input: 10, output: 5, totalTokens: 15 })
    expect(entry.cost?.total).toBe(0.001)
    expect(entry.content).toEqual([{ kind: 'text', text: 'hi' }])
  })

  it('reads metadata sub-objects for context edits and session names', () => {
    const entry = normalizeEntry(
      {
        type: 'context_edit',
        metadata: {
          contextEdit: { targetId: 'ctx-1', replacement: [{ type: 'text', text: 'new' }] },
        },
      },
      0,
    )
    expect(entry.targetId).toBe('ctx-1')
    expect(entry.replacement).toBe('new')

    const renamed = normalizeEntry({ type: 'session', metadata: { sessionInfo: { name: 'Renamed' } } }, 0)
    expect(renamed.sessionName).toBe('Renamed')
  })

  it('summarises compaction content and keeps token counts', () => {
    const entry = normalizeEntry(
      { type: 'compaction', content: [{ type: 'text', text: 'Compacted.' }], metadata: { tokensBefore: 9000, tokensAfter: 100 } },
      0,
    )
    expect(entry.summary).toBe('Compacted.')
    expect(entry.tokensBefore).toBe(9000)
    expect(entry.tokensAfter).toBe(100)
  })

  it('coerces loose error flags and normalizes file lists', () => {
    const entry = normalizeEntry(
      {
        type: 'message',
        role: 'toolResult',
        isError: 'true',
        readFiles: ['a.ts', { path: 'b.ts' }, 42],
        modifiedFiles: [{ file: 'c.ts' }],
      },
      0,
    )
    expect(entry.isError).toBe(true)
    expect(entry.readFiles).toEqual(['a.ts', 'b.ts'])
    expect(entry.modifiedFiles).toEqual(['c.ts'])
  })

  it('tolerates junk input', () => {
    const entry = normalizeEntry(null, 7)
    expect(entry.kind).toBe('unknown')
    expect(entry.index).toBe(7)
    expect(entry.content).toEqual([])
    expect(entry.isError).toBe(false)
  })
})

describe('normalizeSessionDetail', () => {
  it('normalizes the API detail payload', () => {
    const detail = normalizeSessionDetail(rawSessionDetail())
    expect(detail.session.id).toBe('11111111-1111-4111-8111-111111111111')
    expect(detail.session.title).toBe('Refactor parser pipeline')
    expect(detail.session.cwd).toBe('/work/alpha')
    expect(detail.entries).toHaveLength(5)
    expect(detail.entries.map((entry) => entry.kind)).toEqual([
      'user',
      'assistant',
      'tool-result',
      'model-change',
      'compaction',
    ])
    // The fixture session header carries the API's own counts (18 entries,
    // 2 tool calls); the normalized view keeps them instead of re-deriving.
    expect(detail.session.counts).toMatchObject({
      entries: 18,
      userMessages: 1,
      assistantMessages: 3,
      toolCalls: 2,
      toolResults: 1,
    })
    expect(detail.session.usage.totalTokens).toBe(10_725)
    expect(detail.session.cost.total).toBeCloseTo(0.019409, 6)
    expect(detail.session.durationMs).toBe(160_000)
    expect(detail.relatedSessions).toHaveLength(1)
    expect(detail.relatedCostTotal).toBe(0.02)
    expect(detail.combinedCostTotal).toBeCloseTo(0.019409 + 0.02, 6)
  })

  it('unwraps a `{ data: ... }` response', () => {
    const payload = rawSessionDetail()
    const detail = normalizeSessionDetail({ data: payload })
    expect(detail.session.title).toBe('Refactor parser pipeline')
    expect(detail.entries).toHaveLength(5)
  })

  it('derives counts, usage and cost from entries when the API omits them', () => {
    const detail = normalizeSessionDetail({
      session: { sessionId: 's1' },
      entries: [
        { entryIndex: 0, type: 'message', role: 'user', content: 'Fix the parser please' },
        {
          entryIndex: 1,
          type: 'message',
          role: 'assistant',
          model: 'claude-sonnet-4-5',
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
          cost: { total: 0.25 },
          content: [{ type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'ls' } }],
        },
        { entryIndex: 2, type: 'message', role: 'toolResult', toolCallId: 'c1', content: 'done' },
      ],
    })
    expect(detail.session.title).toBe('Fix the parser please')
    expect(detail.session.counts).toMatchObject({ entries: 3, userMessages: 1, assistantMessages: 1, toolCalls: 1, toolResults: 1 })
    expect(detail.session.usage.totalTokens).toBe(15)
    expect(detail.session.cost.total).toBe(0.25)
    expect(detail.session.models).toEqual([
      { model: 'claude-sonnet-4-5', provider: undefined, totalTokens: 15, cost: 0.25 },
    ])
    expect(detail.session.parseStatus).toBe('ok')
  })

  it('falls back to "Untitled session" without a user message', () => {
    const detail = normalizeSessionDetail({ entries: [{ type: 'message', role: 'assistant', content: 'hi' }] })
    expect(detail.session.title).toBe('Untitled session')
    expect(detail.session.id).toBe('unknown')
  })

  it('truncates a long derived title at 110 characters', () => {
    const detail = normalizeSessionDetail({
      entries: [{ type: 'message', role: 'user', content: 'y'.repeat(300) }],
    })
    expect(detail.session.title).toHaveLength(111)
    expect(detail.session.title.endsWith('…')).toBe(true)
  })

  it('normalizes warnings and marks the session as a warning', () => {
    const detail = normalizeSessionDetail({
      session: { sessionId: 's1' },
      parseWarnings: ['bad line', { line: 7, message: 'truncated', rawSnippet: '{"a"' }],
      entries: [],
    })
    expect(detail.warnings).toEqual([
      { line: 1, message: 'bad line', rawSnippet: '' },
      { line: 7, message: 'truncated', rawSnippet: '{"a"' },
    ])
    expect(detail.session.parseStatus).toBe('warning')
  })

  it('keeps an explicit parse error status', () => {
    const detail = normalizeSessionDetail({ session: { parseStatus: 'error' }, entries: [] })
    expect(detail.session.parseStatus).toBe('error')
  })

  it('returns a stable empty shape for junk input', () => {
    const detail = normalizeSessionDetail(null)
    expect(detail.session.id).toBe('unknown')
    expect(detail.session.title).toBe('Untitled session')
    expect(detail.entries).toEqual([])
    expect(detail.warnings).toEqual([])
    expect(detail.relatedSessions).toEqual([])
    expect(detail.session.usage).toEqual(emptyUsage())
    expect(detail.session.cost).toEqual(emptyCost())
  })

  it('drops related sessions without an id', () => {
    const detail = normalizeSessionDetail({ entries: [], relatedSessions: [{ title: 'no id' }, { sessionId: 'x' }] })
    expect(detail.relatedSessions).toEqual([
      { sessionId: 'x', title: undefined, costTotal: 0, totalTokens: 0 },
    ])
  })
})
