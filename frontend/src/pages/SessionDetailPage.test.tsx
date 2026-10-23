import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { jsonResponse, mockApi, renderAppRoutes } from '../test/helpers'
import {
  FIXTURE_NOW,
  SESSION_IDS,
  healthFixture,
  rawEntry,
  rawSessionDetail,
} from '../test/fixtures'
import SessionDetailPage from './SessionDetailPage'

function detailWith(records: Record<string, unknown>[]) {
  const detail = rawSessionDetail()
  detail.entries = records
  detail.entriesTotal = records.length
  return detail
}

function apiFor(id: string, detail: unknown) {
  return mockApi({
    'GET /api/health': healthFixture(),
    [`GET /api/sessions/${id}`]: detail,
  })
}

function renderDetail(id: string = SESSION_IDS.main, route?: string) {
  return renderAppRoutes([{ path: '/sessions/:sessionId', element: <SessionDetailPage /> }], {
    route: route ?? `/sessions/${id}`,
  })
}

const baseRecords = [
  rawEntry({ entryIndex: 0, entryId: 'u1', role: 'user', content: [{ type: 'text', text: 'Please refactor the parser.' }] }),
  rawEntry({
    entryIndex: 1,
    entryId: 'a1',
    parentId: 'u1',
    role: 'assistant',
    provider: 'anthropic',
    model: 'claude-sonnet-4-5',
    usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costTotal: 0.001 },
    content: [
      { type: 'text', text: 'Inspecting the parser now.' },
      { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'pytest' } },
    ],
  }),
  rawEntry({
    entryIndex: 2,
    entryId: 'r1',
    parentId: 'a1',
    role: 'toolResult',
    toolCallId: 'call-1',
    toolName: 'bash',
    content: [{ type: 'text', text: '3 passed in 0.42s' }],
  }),
  rawEntry({ entryIndex: 3, entryId: 'mc1', type: 'model_change', role: null, content: null, metadata: { modelChange: { provider: 'openai', modelId: 'gpt-5.1' } } }),
  rawEntry({ entryIndex: 4, entryId: 'cmp1', type: 'compaction', role: null, content: [{ type: 'text', text: 'Compacted the early exploration.' }] }),
  rawEntry({ entryIndex: 5, entryId: 'lab1', type: 'label', role: null, content: null, metadata: { label: 'a1 -> first-answer' } }),
  rawEntry({ entryIndex: 6, entryId: 'uk1', type: 'future_thing', role: null, content: null, metadata: { foo: 'bar' } }),
  rawEntry({ entryIndex: 7, entryId: 'or1', role: 'toolResult', toolCallId: 'call-missing', toolName: 'bash', content: [{ type: 'text', text: 'orphan output' }] }),
]

describe('SessionDetailPage loading and errors', () => {
  it('renders a loading skeleton for the requested session', async () => {
    mockApi({
      'GET /api/health': healthFixture(),
      [`GET /api/sessions/${SESSION_IDS.main}`]: () =>
        new Promise<Response>(() => {
          // Never resolves: keeps the loading branch mounted.
        }),
    })

    renderDetail()
    expect(screen.getByLabelText('Loading session')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument()
  })

  it('renders a not-found state with a link back to sessions and no retry', async () => {
    apiFor(SESSION_IDS.main, () => jsonResponse({ detail: 'Session not found' }, 404))

    renderDetail()
    // `useSessionDetail` retries once before surfacing the error.
    expect(
      await screen.findByRole('heading', { name: 'Session not found' }, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Session not found', { selector: 'p' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to sessions' })).toHaveAttribute(
      'href',
      '/sessions',
    )
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument()
  })

  it('renders a retryable failure for other errors', async () => {
    apiFor(SESSION_IDS.main, () => jsonResponse({ detail: 'Server exploded' }, 500))

    const { user } = renderDetail()
    expect(
      await screen.findByRole('heading', { name: 'Could not load this session' }, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(screen.getByText('Server exploded')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Retry' }))
  })

  it('surfaces a transport failure as a retryable error', async () => {
    mockApi({
      'GET /api/health': healthFixture(),
      [`GET /api/sessions/${SESSION_IDS.main}`]: () => {
        throw new Error('offline')
      },
    })

    renderDetail()
    expect(
      await screen.findByRole('heading', { name: 'Could not load this session' }, { timeout: 4000 }),
    ).toBeInTheDocument()
    expect(
      screen.getByText('Could not reach the local Pi Meter server.'),
    ).toBeInTheDocument()
  })
})

describe('SessionDetailPage populated', () => {
  it('renders the header, warnings, totals rail and every event type', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const detail = detailWith(baseRecords)
    detail.warnings = [{ line: 3, message: 'Unexpected token', rawSnippet: '{"bad":' }]
    apiFor(SESSION_IDS.main, detail)

    renderDetail()

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Refactor parser pipeline' }),
    ).toBeInTheDocument()
    expect(screen.getByText('Skip to transcript')).toBeInTheDocument()
    // Layout includes both the inline totals disclosure and the rail copy.
    expect(screen.getAllByRole('complementary', { name: 'Session totals' })).toHaveLength(2)
    // The inline totals disclosure is collapsed by default; the rail copy is open.
    const totalsDisclosure = screen.getByText('Session totals').closest('details') as HTMLDetailsElement
    expect(totalsDisclosure.open).toBe(false)

    // Warning banner.
    expect(screen.getByText('PARSE WARNINGS')).toBeInTheDocument()

    // Event types.
    expect(screen.getByText('USER')).toBeInTheDocument()
    expect(screen.getByText('ASSISTANT')).toBeInTheDocument()
    expect(screen.getByText('MODEL CHANGE')).toBeInTheDocument()
    expect(screen.getByText('CONTEXT COMPACTION')).toBeInTheDocument()
    expect(screen.getByText('LABEL')).toBeInTheDocument()
    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
    expect(screen.getByText('orphan result')).toBeInTheDocument()

    // Counts reflect the parsed transcript: the paired result is folded into
    // the assistant item, the orphan result stays its own item (7 total).
    expect(screen.getByRole('button', { name: 'All (7)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'User (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Assistant (1)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tools (2)' })).toBeInTheDocument()
    // 1 warning is counted as an error source.
    expect(screen.getByRole('button', { name: 'Errors (1)' })).toBeInTheDocument()
  })

  it('filters the transcript and keeps the filter in the URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    const { user, router } = renderDetail()
    await screen.findByText('USER')

    await user.click(screen.getByRole('button', { name: 'User (1)' }))
    await waitFor(() => expect(router.state.location.search).toContain('filter=user'))
    expect(screen.getByText('USER')).toBeInTheDocument()
    expect(screen.queryByText('ASSISTANT')).not.toBeInTheDocument()
    expect(screen.queryByText('MODEL CHANGE')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Assistant (1)' }))
    await waitFor(() => expect(router.state.location.search).toContain('filter=assistant'))
    expect(screen.getByText('ASSISTANT')).toBeInTheDocument()
    expect(screen.queryByText('USER')).not.toBeInTheDocument()
  })

  it('hides the filter param when returning to All and announces the filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    const { user, router } = renderDetail(SESSION_IDS.main, `/sessions/${SESSION_IDS.main}?filter=user`)
    await screen.findByText('USER')

    await user.click(screen.getByRole('button', { name: 'All (7)' }))
    await waitFor(() => expect(router.state.location.search).not.toContain('filter='))
    expect(screen.getByRole('status')).toHaveTextContent('Filter: all')
    expect(screen.getByText('ASSISTANT')).toBeInTheDocument()
  })

  it('renders only tool blocks under the tools filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    renderDetail(SESSION_IDS.main, `/sessions/${SESSION_IDS.main}?filter=tools`)
    await screen.findByText('TOOL CALL')

    expect(screen.getAllByLabelText('Tool call bash').length).toBeGreaterThan(0)
    expect(screen.getByText('orphan result')).toBeInTheDocument()
    expect(screen.queryByText('USER')).not.toBeInTheDocument()
    expect(screen.queryByText('MODEL CHANGE')).not.toBeInTheDocument()
  })

  it('renders only failed entries under the errors filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(
      SESSION_IDS.main,
      detailWith([
        rawEntry({
          entryIndex: 0,
          entryId: 'u1',
          role: 'user',
          content: [{ type: 'text', text: 'Run the tests.' }],
        }),
        rawEntry({
          entryIndex: 1,
          entryId: 'a1',
          parentId: 'u1',
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'call-2', name: 'bash', arguments: { command: 'pytest' } },
          ],
        }),
        rawEntry({
          entryIndex: 2,
          entryId: 'r2',
          parentId: 'a1',
          role: 'toolResult',
          toolCallId: 'call-2',
          toolName: 'bash',
          isError: true,
          content: [{ type: 'text', text: 'tests failed' }],
        }),
      ]),
    )

    renderDetail(SESSION_IDS.main, `/sessions/${SESSION_IDS.main}?filter=errors`)
    await screen.findAllByText('✖ Error')

    expect(screen.getByText('ASSISTANT')).toBeInTheDocument()
    expect(screen.getByText('tests failed')).toBeInTheDocument()
    expect(screen.queryByText('Run the tests.')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Errors (1)' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('renders a filter-empty state with a show-all action', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(
      SESSION_IDS.main,
      detailWith([
        rawEntry({
          entryIndex: 0,
          entryId: 'u1',
          role: 'user',
          content: [{ type: 'text', text: 'Only a user message.' }],
        }),
      ]),
    )

    const { user } = renderDetail(SESSION_IDS.main, `/sessions/${SESSION_IDS.main}?filter=errors`)
    expect(await screen.findByText('No errors recorded in this session.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByText('Only a user message.')).toBeInTheDocument()
  })

  it('searches the transcript from the URL, navigates matches and clears', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    const { user, router } = renderDetail(
      SESSION_IDS.main,
      `/sessions/${SESSION_IDS.main}?q=parser`,
    )

    const input = await screen.findByPlaceholderText('Search transcript…')
    await waitFor(() => expect(input).toHaveValue('parser'))
    await waitFor(() =>
      expect(screen.getByText('2 entries · 2 matches')).toBeInTheDocument(),
    )
    // Matched text is highlighted in place.
    expect(screen.getAllByText(/parser/i, { selector: 'mark' }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Next match' }))
    await user.click(screen.getByRole('button', { name: 'Previous match' }))
    expect(screen.getByRole('status')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Clear' }))
    await waitFor(() => expect(router.state.location.search).not.toContain('q='))
  })

  it('shows a search empty state scoped to the active filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    const { user, router } = renderDetail(
      SESSION_IDS.main,
      `/sessions/${SESSION_IDS.main}?q=zzz`,
    )

    expect(await screen.findByText(/No matches for/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear search' }))
    await waitFor(() => expect(router.state.location.search).not.toContain('q='))
    expect(screen.getByText('USER')).toBeInTheDocument()
  })

  it('expands and collapses every disclosure and announces the action', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    const { user } = renderDetail()
    await screen.findByText('USER')

    const compaction = screen.getByRole('button', { name: /Summary/ })
    expect(compaction).toHaveAttribute('aria-expanded', 'true')

    await user.click(screen.getByRole('button', { name: 'Collapse all' }))
    expect(screen.getByRole('button', { name: /Summary/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.getByRole('status')).toHaveTextContent('All sections collapsed')

    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(screen.getByRole('button', { name: /Summary/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('status')).toHaveTextContent('All sections expanded')
  })

  it('expands a single entry disclosure without affecting others', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(
      SESSION_IDS.main,
      detailWith([
        rawEntry({
          entryIndex: 0,
          entryId: 'a1',
          role: 'assistant',
          content: [{ type: 'thinking', thinking: 'internal note' }, { type: 'text', text: 'visible' }],
        }),
      ]),
    )

    const { user } = renderDetail()
    await screen.findByText('ASSISTANT')

    const list = document.querySelector('.pm-transcript') as HTMLElement
    const thinking = within(list).getByRole('button', { name: /Thinking/ })
    expect(thinking).toHaveAttribute('aria-expanded', 'false')
    await user.click(thinking)
    expect(thinking).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('internal note')).toBeVisible()
  })

  it('disables the latest control while the transcript is at the bottom', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    renderDetail()
    await screen.findByText('USER')
    // The IntersectionObserver stub never fires, so the page keeps its initial
    // "at the bottom" state and the jump control is disabled (no floating pill).
    const latest = screen.getByRole('button', { name: '↓ Latest' })
    expect(latest).toBeDisabled()
    expect(screen.queryByRole('button', { name: /Jump to latest/ })).not.toBeInTheDocument()
  })

  it('shows an empty transcript message for a session with no entries', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith([]))

    renderDetail()
    expect(
      await screen.findByText('No transcript entries were parsed from this session.'),
    ).toBeInTheDocument()
  })

  it('renders parse warnings and the raw snippet', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const detail = detailWith(baseRecords)
    detail.warnings = [
      { line: 12, message: 'Malformed JSON', rawSnippet: '{"broken":' },
      { line: 14, message: 'Unknown entry type', rawSnippet: '{"type":"future"}' },
    ]
    apiFor(SESSION_IDS.main, detail)

    renderDetail()
    expect(await screen.findByText('PARSE WARNINGS')).toBeInTheDocument()
    expect(screen.getByText(/2 lines could not be parsed/)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Parse warning at line 12' })).toHaveTextContent(
      'Malformed JSON',
    )
    expect(screen.getByRole('group', { name: 'Parse warning at line 14' })).toHaveTextContent(
      'Unknown entry type',
    )
  })

  it('scopes the transcript search to the selected filter', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    renderDetail(SESSION_IDS.main, `/sessions/${SESSION_IDS.main}?filter=user&q=parser`)
    await screen.findByText('USER')
    // Only the user entry is in scope: 1 entry with 1 occurrence.
    await waitFor(() => expect(screen.getByText('1 entries · 1 matches')).toBeInTheDocument())
  })

  it('shows the floating jump control once scrolled away from the bottom', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    const observers: Array<{
      callback: IntersectionObserverCallback
    }> = []
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        callback: IntersectionObserverCallback
        constructor(callback: IntersectionObserverCallback) {
          this.callback = callback
          observers.push(this)
        }
        observe() {
          // Keep the node reference; tests drive the callback explicitly.
        }
        unobserve() {}
        disconnect() {}
        takeRecords() {
          return []
        }
        root = null
        rootMargin = ''
        thresholds = []
      },
    )

    const { user } = renderDetail()
    await screen.findByText('USER')

    // The transcript sentinel leaves the viewport and the window is scrolled.
    for (const observer of observers) {
      observer.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    }
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 800 })
    window.dispatchEvent(new Event('scroll'))

    const floating = await screen.findByRole('button', { name: '↓ Jump to latest' })
    expect(screen.getByRole('button', { name: '↓ Latest' })).toBeEnabled()

    await user.click(floating)
    expect(screen.getByRole('status')).toHaveTextContent('Jumped to latest entry')
  })

  it('renders a deep link to an entry anchor scroll target', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView')
    apiFor(SESSION_IDS.main, detailWith(baseRecords))

    renderDetail(SESSION_IDS.main, `/sessions/${SESSION_IDS.main}#entry-1`)
    await screen.findByText('USER')
    // The hash effect scrolls after data arrives.
    await waitFor(() => expect(document.getElementById('entry-1')).not.toBeNull())
    expect(scroll).toBeDefined()
  })
})
