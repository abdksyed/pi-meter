/**
 * Transcript item building: ordering, tool-call/result pairing (no duplicate
 * DOM rows for paired results, orphan results retained), counts and filters.
 */

import { describe, expect, it } from 'vitest'

import {
  buildTranscriptItems,
  computeTranscriptCounts,
  filterTranscriptItems,
  flattenToolExecutions,
  toolExecutionAnchor,
  toolResultText,
} from './transcriptItems'
import { normalizeEntry } from './normalize'
import type { NormalizedEntry } from './sessionTypes'

let counter = 0

function entry(overrides: Record<string, unknown> = {}): NormalizedEntry {
  counter += 1
  return normalizeEntry({ entryIndex: counter, type: 'message', role: 'user', ...overrides }, counter)
}

function assistantWithCall(id: string, name = 'bash'): NormalizedEntry {
  return entry({
    type: 'message',
    role: 'assistant',
    content: [
      { type: 'text', text: 'Running the tests.' },
      { type: 'toolCall', id, name, arguments: { command: 'pytest' } },
    ],
  })
}

function toolResult(callId: string, text = '3 passed', isError = false): NormalizedEntry {
  return entry({
    type: 'message',
    role: 'toolResult',
    toolCallId: callId,
    toolName: 'bash',
    isError,
    content: [{ type: 'text', text }],
  })
}

describe('buildTranscriptItems', () => {
  it('preserves entry order and anchors', () => {
    const items = buildTranscriptItems([
      entry({ role: 'user', content: 'one' }),
      entry({ role: 'assistant', content: 'two' }),
      entry({ role: 'user', content: 'three' }),
    ])
    expect(items).toHaveLength(3)
    expect(items.map((item) => item.type)).toEqual(['user', 'assistant', 'user'])
    expect(items.map((item) => item.anchor)).toEqual(items.map((item) => item.key))
  })

  it('pairs a tool call with its result and hides the separate result row', () => {
    const call = assistantWithCall('call-1')
    const result = toolResult('call-1')
    const items = buildTranscriptItems([call, result])

    expect(items).toHaveLength(1)
    const [assistant] = items
    expect(assistant.executions).toHaveLength(1)
    expect(assistant.executions[0]).toMatchObject({
      callId: 'call-1',
      name: 'bash',
      argsText: '{\n  "command": "pytest"\n}',
      isError: false,
    })
    expect(assistant.executions[0].results).toHaveLength(1)
    expect(assistant.executions[0].results[0].text).toBe('3 passed')
  })

  it('keeps orphan results that no assistant entry references', () => {
    const orphan = toolResult('missing-call', 'orphan output')
    const items = buildTranscriptItems([orphan])
    expect(items).toHaveLength(1)
    expect(items[0].type).toBe('tool-result')
    expect(toolResultText(items[0].entry)).toBe('orphan output')
  })

  it('counts a call with several results once, without duplicating rows', () => {
    const call = assistantWithCall('call-1')
    const items = buildTranscriptItems([call, toolResult('call-1', 'a'), toolResult('call-1', 'b')])
    expect(items).toHaveLength(1)
    expect(items[0].executions[0].results.map((result) => result.text)).toEqual(['a', 'b'])
  })

  it('marks an execution as failed when any paired result errored', () => {
    const items = buildTranscriptItems([
      assistantWithCall('call-1'),
      toolResult('call-1', 'ok'),
      toolResult('call-1', 'boom', true),
    ])
    expect(items[0].executions[0].isError).toBe(true)
  })

  it('leaves a call without a result pending', () => {
    const items = buildTranscriptItems([assistantWithCall('call-1')])
    expect(items[0].executions[0].results).toEqual([])
    expect(items[0].executions[0].isError).toBe(false)
  })

  it('supports multiple calls in one assistant entry', () => {
    const call = entry({
      type: 'message',
      role: 'assistant',
      content: [
        { type: 'toolCall', id: 'c1', name: 'bash', arguments: {} },
        { type: 'toolCall', id: 'c2', name: 'read', arguments: { path: '/a' } },
      ],
    })
    const items = buildTranscriptItems([call, toolResult('c2', 'file body')])
    expect(items[0].executions.map((execution) => execution.name)).toEqual(['bash', 'read'])
    expect(items[0].executions[1].results[0].text).toBe('file body')
    expect(items[0].executions[0].results).toEqual([])
  })

  it('builds search text from content, tool names, arguments and results', () => {
    const items = buildTranscriptItems([assistantWithCall('call-1'), toolResult('call-1', 'unique-output')])
    const searchText = items[0].searchText
    expect(searchText).toContain('Running the tests.')
    expect(searchText).toContain('bash')
    expect(searchText).toContain('pytest')
    expect(searchText).toContain('unique-output')
  })

  it('excludes system prompts from search but keeps other system entries searchable', () => {
    const prompt = entry({ type: 'system', role: 'system', sections: [{ label: 'Tools', text: 'secret' }], content: 'secret' })
    const system = entry({ type: 'message', role: 'system', content: 'notice' })
    const items = buildTranscriptItems([prompt, system])
    expect(items[0].type).toBe('system-prompt')
    expect(items[0].searchText).toBe('')
    expect(items[1].searchText).toContain('notice')
  })

  it('tracks the previous model and thinking level', () => {
    const items = buildTranscriptItems([
      entry({ role: 'assistant', model: 'claude-sonnet-4-5', thinkingLevel: 'high', content: 'a' }),
      entry({ role: 'assistant', content: 'b' }),
    ])
    expect(items[0].previousModel).toBeUndefined()
    expect(items[1].previousModel).toBe('claude-sonnet-4-5')
    expect(items[1].previousThinkingLevel).toBe('high')
  })

  it('maps metadata entry kinds onto transcript item types', () => {
    const items = buildTranscriptItems([
      entry({ type: 'compaction', content: 'c' }),
      entry({ type: 'context_edit', content: 'e' }),
      entry({ type: 'branch_summary', content: 'b' }),
      entry({ type: 'usage', content: 'u' }),
      entry({ type: 'custom_message', role: 'custom', content: 'm' }),
      entry({ type: 'model_change' }),
      entry({ type: 'nonsense' }),
    ])
    expect(items.map((item) => item.type)).toEqual([
      'compaction',
      'context-edit',
      'branch-summary',
      'usage',
      'custom-message',
      'system',
      'unknown',
    ])
  })
})

describe('computeTranscriptCounts', () => {
  it('counts items, tools and errors including parse warnings', () => {
    const items = buildTranscriptItems([
      entry({ role: 'user', content: 'hi' }),
      assistantWithCall('call-1'),
      toolResult('call-1', 'ok'),
      toolResult('call-2', 'boom', true),
    ])
    // user + assistant + the orphan result row (the paired result is folded in)
    expect(computeTranscriptCounts(items)).toEqual({ all: 3, user: 1, assistant: 1, tools: 2, errors: 1 })
    expect(computeTranscriptCounts(items, 2).errors).toBe(3)
  })

  it('counts an errored execution as one error', () => {
    const items = buildTranscriptItems([assistantWithCall('call-1'), toolResult('call-1', 'boom', true)])
    expect(computeTranscriptCounts(items)).toMatchObject({ all: 1, tools: 1, errors: 1 })
  })
})

describe('filterTranscriptItems', () => {
  const items = buildTranscriptItems([
    entry({ role: 'user', content: 'question' }),
    assistantWithCall('call-1'),
    toolResult('call-1', 'ok'),
    toolResult('call-2', 'boom', true),
    entry({ type: 'compaction', content: 'summary' }),
  ])

  it('returns everything for "all"', () => {
    expect(filterTranscriptItems(items, 'all')).toHaveLength(items.length)
  })

  it('filters by user and assistant', () => {
    expect(filterTranscriptItems(items, 'user').map((item) => item.type)).toEqual(['user'])
    expect(filterTranscriptItems(items, 'assistant').map((item) => item.type)).toEqual(['assistant'])
  })

  it('includes assistant entries with tool executions in the tools filter', () => {
    expect(filterTranscriptItems(items, 'tools').map((item) => item.type)).toEqual([
      'assistant',
      'tool-result',
    ])
  })

  it('filters errors from executions and error results', () => {
    const onlyErrors = filterTranscriptItems(items, 'errors')
    expect(onlyErrors.some((item) => item.type === 'tool-result' && item.entry.isError)).toBe(true)
    // The healthy assistant entry is excluded because its execution succeeded.
    expect(onlyErrors.filter((item) => item.type === 'assistant')).toHaveLength(0)
  })

  it('includes an errored execution in the errors filter', () => {
    const errored = buildTranscriptItems([assistantWithCall('call-1'), toolResult('call-1', 'boom', true)])
    expect(filterTranscriptItems(errored, 'errors')).toHaveLength(1)
  })
})

describe('anchors and flattening', () => {
  it('derives a per-execution anchor', () => {
    const items = buildTranscriptItems([assistantWithCall('call-1')])
    expect(toolExecutionAnchor(items[0], items[0].executions[0])).toBe(`${items[0].anchor}-tool-0`)
  })

  it('flattens executions across items', () => {
    const items = buildTranscriptItems([assistantWithCall('c1'), assistantWithCall('c2')])
    expect(flattenToolExecutions(items).map((execution) => execution.callId)).toEqual(['c1', 'c2'])
  })
})
