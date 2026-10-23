/** Tool call summarisation, status labels and argument heuristics. */

import { describe, expect, it } from 'vitest'

import {
  isTinyArguments,
  summarizeTool,
  toolArgsKeyCount,
  toolStatus,
  toolStatusLabel,
} from './toolSummary'
import type { ToolExecutionData } from './sessionTypes'

function execution(overrides: Partial<ToolExecutionData> = {}): ToolExecutionData {
  return {
    key: 'entry-1-tool-0',
    name: 'bash',
    arguments: { command: 'pytest' },
    argsText: '{\n  "command": "pytest"\n}',
    call: { key: 'entry-1', index: 1, type: 'message', kind: 'assistant', isError: false, content: [], readFiles: [], modifiedFiles: [], raw: {} },
    results: [],
    isError: false,
    ...overrides,
  }
}

describe('summarizeTool', () => {
  it('summarises shell commands', () => {
    expect(summarizeTool('bash', { command: 'pytest  -q' })).toEqual({ title: 'pytest -q' })
    expect(summarizeTool('BashExec', { cmd: 'ls' })).toEqual({ title: 'ls' })
  })

  it('summarises read calls with offset/limit detail', () => {
    expect(summarizeTool('read', { path: '/tmp/a.txt' })).toEqual({
      title: '/tmp/a.txt',
      detail: undefined,
    })
    expect(summarizeTool('read_file', { filePath: '/tmp/a.txt', offset: 10, limit: 20 })).toEqual({
      title: '/tmp/a.txt',
      detail: '· offset 10, limit 20',
    })
  })

  it('summarises write calls with a line count', () => {
    expect(summarizeTool('write', { path: '/tmp/a.txt', content: 'a\nb\nc' })).toEqual({
      title: '/tmp/a.txt',
      detail: '3 lines written',
    })
  })

  it('summarises edit calls with an edit count', () => {
    expect(summarizeTool('edit', { path: '/tmp/a.txt', edits: [{}, {}] })).toEqual({
      title: '/tmp/a.txt',
      detail: '2 edits',
    })
    expect(summarizeTool('edit', { path: '/tmp/a.txt', edits: [{}] })).toEqual({
      title: '/tmp/a.txt',
      detail: '1 edit',
    })
  })

  it('summarises search, listing, sub-agent and fetch calls', () => {
    expect(summarizeTool('grep', { pattern: 'TODO', path: 'src' })).toEqual({
      title: 'TODO',
      detail: 'src',
    })
    expect(summarizeTool('ls', { path: '/work' })).toEqual({ title: '/work' })
    expect(summarizeTool('task', { task: 'review the diff' })).toEqual({ title: 'review the diff' })
    expect(summarizeTool('fetch', { url: 'https://example.com' })).toEqual({
      title: 'https://example.com',
    })
  })

  it('accepts JSON string arguments', () => {
    expect(summarizeTool('bash', '{"command":"npm test"}')).toEqual({ title: 'npm test' })
  })

  it('falls back to the tool name for unparseable arguments', () => {
    expect(summarizeTool('mystery', 'not json')).toEqual({ title: 'not json' })
    expect(summarizeTool('mystery', undefined)).toEqual({ title: 'mystery' })
    expect(summarizeTool('mystery', null)).toEqual({ title: 'mystery' })
  })

  it('falls back to the raw string when JSON is not an object', () => {
    expect(summarizeTool('mystery', '[1,2,3]')).toEqual({ title: '[1,2,3]' })
    expect(summarizeTool('mystery', '   ')).toEqual({ title: 'mystery' })
  })

  it('falls back to scalar argument summaries for unknown tools', () => {
    expect(summarizeTool('mystery', { count: 3 })).toEqual({ title: 'count: 3' })
  })

  it('clips long values', () => {
    const long = 'x'.repeat(400)
    const summary = summarizeTool('bash', { command: long })
    expect(summary.title.length).toBe(161)
    expect(summary.title.endsWith('…')).toBe(true)
  })
})

describe('toolStatus', () => {
  it('reports pending without results', () => {
    expect(toolStatus(execution())).toBe('pending')
    expect(toolStatusLabel(execution())).toBe('No result recorded')
  })

  it('reports ok and error from the paired result', () => {
    const ok = execution({ results: [{ key: 'r', entry: {} as never, text: 'ok', images: [], isError: false }] })
    expect(toolStatus(ok)).toBe('ok')
    expect(toolStatusLabel(ok)).toBe('✓ OK')

    const failed = execution({
      results: [{ key: 'r', entry: {} as never, text: 'boom', images: [], isError: true }],
      isError: true,
    })
    expect(toolStatus(failed)).toBe('error')
    expect(toolStatusLabel(failed)).toBe('✖ Error')
  })
})

describe('argument heuristics', () => {
  it('counts top-level argument keys', () => {
    expect(toolArgsKeyCount({ a: 1, b: 2 })).toBe(2)
    expect(toolArgsKeyCount('{"a":1}')).toBe(1)
    expect(toolArgsKeyCount('nope')).toBe(0)
  })

  it('flags tiny one-or-two-key argument objects', () => {
    expect(isTinyArguments({ command: 'ls' })).toBe(true)
    expect(isTinyArguments({ a: 1, b: 2 })).toBe(true)
    expect(isTinyArguments({ a: 1, b: 2, c: 3 })).toBe(false)
    expect(isTinyArguments({})).toBe(false)
    expect(isTinyArguments({ command: 'x'.repeat(200) })).toBe(false)
    expect(isTinyArguments(undefined)).toBe(false)
  })
})
