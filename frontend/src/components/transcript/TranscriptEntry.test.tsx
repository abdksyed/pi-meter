import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import { useMemo, useState } from 'react'

import { renderWithProviders } from '../../test/helpers'
import { normalizeEntry } from '../../lib/normalize'
import { buildTranscriptItems } from '../../lib/transcriptItems'
import { useTranscriptExpansion } from '../../hooks/useTranscriptExpansion'
import { useTranscriptSearch } from '../../hooks/useTranscriptSearch'
import type { NormalizedEntry, TranscriptFilter } from '../../lib/sessionTypes'
import { Transcript } from './Transcript'
import { ContextEditBlock } from './ContextEditBlock'
import { TranscriptContext } from './TranscriptContext'
import { EntryErrorBoundary } from './EntryErrorBoundary'

/** Minimal item shape for rendering a single block with a custom context. */
function transcriptItemFor(entry: NormalizedEntry) {
  return {
    key: entry.key,
    type: 'system' as const,
    entry,
    anchor: entry.key,
    executions: [],
    searchText: '',
  }
}

function renderWithAnchors(
  ui: React.ReactElement,
  anchors: Array<[string, string]>,
) {
  return renderWithProviders(
    <TranscriptContext.Provider
      value={{
        expansion: {
          mode: 'default',
          isOpen: (_key: string, defaultOpen: boolean) => defaultOpen,
          toggle: () => undefined,
          expandAll: () => undefined,
          collapseAll: () => undefined,
          reset: () => undefined,
        },
        query: '',
        matchedItemKeys: new Set<string>(),
        filter: 'all',
        entryAnchors: new Map(anchors),
        announce: () => undefined,
      }}
    >
      {ui}
    </TranscriptContext.Provider>,
  )
}

/** Render the production transcript with real expansion/search state. */
function TranscriptHarness({
  records,
  filter = 'all',
  query = '',
  onAnnounce,
}: {
  records: Record<string, unknown>[]
  filter?: TranscriptFilter
  query?: string
  onAnnounce?: (message: string) => void
}) {
  const items = useMemo(
    () => buildTranscriptItems(records.map((record, index) => normalizeEntry(record, index))),
    [records],
  )
  const expansion = useTranscriptExpansion()
  const search = useTranscriptSearch(items, query)
  return (
    <Transcript
      items={items}
      allItemsCount={items.length}
      filter={filter}
      search={search}
      expansion={expansion}
      sentinelRef={() => undefined}
      announce={onAnnounce ?? (() => undefined)}
      onShowAll={() => undefined}
      onClearSearch={() => undefined}
      onSearchAll={() => undefined}
    />
  )
}

function entry(overrides: Record<string, unknown> = {}, index = 0) {
  return {
    entryIndex: index,
    entryId: `e${index}`,
    parentId: null,
    type: 'message',
    role: 'user',
    timestamp: '2026-01-15T09:00:00.000Z',
    content: [{ type: 'text', text: 'Hello there' }],
    metadata: {},
    ...overrides,
  }
}

/**
 * `userEvent.setup()` installs its own clipboard stub, so the spy must be
 * created after rendering; `lib/clipboard.ts` also requires a secure context.
 */
function installClipboard() {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  return vi
    .spyOn(navigator.clipboard, 'writeText')
    .mockResolvedValue(undefined as unknown as void)
}

describe('transcript entry rendering', () => {
  it('renders a user message with copy and character count', async () => {
    const announce = vi.fn()
    const { user } = renderWithProviders(
      <TranscriptHarness records={[entry()]} onAnnounce={announce} />,
    )
    const writeText = installClipboard()

    expect(screen.getByText('USER')).toBeInTheDocument()
    expect(screen.getByText('Hello there')).toBeInTheDocument()
    expect(screen.getByText('11 chars')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Hello there'))
    await waitFor(() => expect(announce).toHaveBeenCalledWith('Copy message: copied'))
  })

  it('renders an assistant message with thinking, text and paired tool execution', async () => {
    const { user } = renderWithProviders(
      <TranscriptHarness
        records={[
          entry({
            type: 'message',
            role: 'assistant',
            provider: 'anthropic',
            model: 'claude-sonnet-4-5',
            thinkingLevel: 'high',
            durationMs: 1500,
            usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, costTotal: 0.001 },
            content: [
              { type: 'thinking', thinking: 'Let me inspect the parser.' },
              { type: 'text', text: 'Inspecting now.' },
              { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'pytest' } },
            ],
          }),
          entry({
            role: 'toolResult',
            toolCallId: 'call-1',
            toolName: 'bash',
            content: [{ type: 'text', text: '3 passed in 0.42s' }],
          }),
        ]}
      />,
    )

    expect(screen.getByText('ASSISTANT')).toBeInTheDocument()
    expect(screen.getAllByText('claude-sonnet-4-5').length).toBeGreaterThan(0)
    expect(screen.getAllByText('anthropic').length).toBeGreaterThan(0)
    expect(screen.getByText('thinking · high')).toBeInTheDocument()
    expect(screen.getByText('1.5s')).toBeInTheDocument()
    expect(screen.getAllByText('120 tok').length).toBeGreaterThan(0)
    expect(screen.getByText('Inspecting now.')).toBeInTheDocument()

    // Thinking starts collapsed and can be expanded.
    const thinking = screen.getByRole('button', { name: /Thinking/ })
    expect(thinking).toHaveAttribute('aria-expanded', 'false')
    await user.click(thinking)
    expect(thinking).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Let me inspect the parser.')).toBeVisible()

    // Known defect D1: the same tool execution is mounted twice (inline and in
    // the tools section), so this only asserts that it is rendered at all.
    // `renders each tool call exactly once` is the regression that fails today.
    expect(screen.getAllByLabelText('Tool call bash').length).toBeGreaterThan(0)
    expect(screen.getAllByLabelText('Tool result 1 for bash')[0]).toHaveTextContent(
      '3 passed in 0.42s',
    )
    expect(screen.getAllByText('pytest').length).toBeGreaterThan(0)
  })

  // Regression for product requirement "a tool call and its result render once".
  it('renders each tool call exactly once (known defect D1)', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'text', text: 'Inspecting now.' },
              { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'pytest' } },
            ],
          }),
          entry({
            role: 'toolResult',
            toolCallId: 'call-1',
            toolName: 'bash',
            content: [{ type: 'text', text: '3 passed in 0.42s' }],
          }),
        ]}
      />,
    )

    expect(screen.getAllByLabelText('Tool call bash')).toHaveLength(1)
    expect(screen.getAllByLabelText('Tool result 1 for bash')).toHaveLength(1)
    // Duplicate ids are invalid HTML and break anchor/deep-link navigation.
    expect(document.querySelectorAll('#entry-0-tool-0')).toHaveLength(1)
  })

  it('renders detailed error text for a failed assistant response', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({
            role: 'assistant',
            isError: true,
            stopReason: 'error',
            errorMessage: 'Provider timeout',
            content: [{ type: 'text', text: 'partial' }],
          }),
        ]}
      />,
    )
    expect(screen.getByText(/✖ Error: Provider timeout · stop reason: error/)).toBeInTheDocument()
  })

  it('notes when an assistant message has no content', () => {
    renderWithProviders(
      <TranscriptHarness records={[entry({ role: 'assistant', content: [] })]} />,
    )
    expect(screen.getByText('No content recorded.')).toBeInTheDocument()
  })

  it('renders an orphan tool result without inventing a call', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({
            role: 'toolResult',
            toolCallId: 'call-missing',
            toolName: 'bash',
            content: [{ type: 'text', text: 'orphan output' }],
          }),
        ]}
      />,
    )
    expect(screen.getByText('orphan result')).toBeInTheDocument()
    expect(screen.getByText('call call-missing')).toBeInTheDocument()
    expect(screen.getByLabelText('Tool result 1 for bash')).toHaveTextContent('orphan output')
    expect(screen.queryByLabelText('Tool call bash')).not.toBeInTheDocument()
  })

  it('renders a tool result with no output as empty', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({ role: 'toolResult', toolCallId: 'x', toolName: 'grep', content: [] }),
        ]}
      />,
    )
    expect(screen.getByText('No output recorded.')).toBeInTheDocument()
  })

  it('renders system events, metadata and unknown entries', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({ type: 'session_info', name: 'Renamed session', content: null }, 1),
          entry({ type: 'model_change', modelId: 'gpt-5.1', content: null }, 2),
          entry({ type: 'thinking_level_change', thinkingLevel: 'high', content: null }, 3),
          entry({ type: 'label', label: 'a1 -> first-answer', content: null }, 4),
          entry({ type: 'custom', customType: 'checkpoint', content: null }, 5),
          entry(
            {
              type: 'message',
              role: 'custom',
              customType: 'notice',
              content: [{ type: 'text', text: 'Custom message body' }],
            },
            6,
          ),
          entry({ type: 'future_thing', role: null, content: null, metadata: { future: true } }, 7),
        ]}
      />,
    )

    expect(screen.getByText('SESSION INFO')).toBeInTheDocument()
    expect(screen.getByText('Session renamed to Renamed session')).toBeInTheDocument()

    expect(screen.getByText('MODEL CHANGE')).toBeInTheDocument()
    expect(screen.getByText('Model set to gpt-5.1')).toBeInTheDocument()

    expect(screen.getByText('THINKING LEVEL')).toBeInTheDocument()
    expect(screen.getByText('Thinking level set to high')).toBeInTheDocument()

    expect(screen.getByText('LABEL')).toBeInTheDocument()
    expect(screen.getByText('Label: a1 -> first-answer')).toBeInTheDocument()

    expect(screen.getByText('CUSTOM')).toBeInTheDocument()
    expect(screen.getByText('Custom event: checkpoint')).toBeInTheDocument()

    expect(screen.getByText('CUSTOM MESSAGE')).toBeInTheDocument()
    expect(screen.getByText('Custom message body')).toBeInTheDocument()

    expect(screen.getByText('UNKNOWN')).toBeInTheDocument()
    expect(screen.getByText('Unknown entry type: future_thing')).toBeInTheDocument()
    expect(screen.getByText(/"future": true/)).toBeInTheDocument()
  })

  it('renders a system prompt collapsed and excluded from search', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry(
            {
              type: 'system',
              role: 'system',
              sections: [
                { label: 'Identity', text: 'You are Pi.' },
                { label: 'Rules', text: 'Be concise.' },
              ],
              content: [{ type: 'text', text: 'You are Pi.\n\nBe concise.' }],
            },
            0,
          ),
        ]}
      />,
    )

    expect(screen.getByText('SYSTEM PROMPT')).toBeInTheDocument()
    expect(screen.getByText('2 sections')).toBeInTheDocument()
    expect(screen.getByText('Collapsed by default · excluded from search')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /Prompt contents/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders compaction and branch summary disclosures with file lists', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry(
            {
              type: 'compaction',
              role: null,
              content: [{ type: 'text', text: 'Compacted the early exploration.' }],
              metadata: {
                tokensBefore: 9000,
                tokensAfter: 3000,
                readFiles: ['/work/alpha/a.ts'],
                modifiedFiles: ['/work/alpha/b.ts'],
              },
            },
            0,
          ),
          entry(
            {
              type: 'branch_summary',
              role: null,
              content: [{ type: 'text', text: 'Branch summary text' }],
            },
            1,
          ),
        ]}
      />,
    )

    expect(screen.getByText('CONTEXT COMPACTION')).toBeInTheDocument()
    expect(screen.getByText('9,000 → 3,000 tokens')).toBeInTheDocument()
    expect(screen.getByText('66.7% saved')).toBeInTheDocument()
    expect(screen.getByText('Read files')).toBeInTheDocument()
    expect(screen.getByText('/work/alpha/a.ts')).toBeInTheDocument()
    expect(screen.getByText('Modified files')).toBeInTheDocument()

    expect(screen.getByText('BRANCH SUMMARY')).toBeInTheDocument()
    expect(screen.getByText('Branch summary text')).toBeInTheDocument()
  })

  it('renders an empty compaction summary', () => {
    renderWithProviders(
      <TranscriptHarness records={[entry({ type: 'compaction', role: null, content: [] })]} />,
    )
    expect(screen.getByText('No summary recorded.')).toBeInTheDocument()
  })

  it('renders a context edit with a jump link to its target', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({ entryId: 'u1', content: [{ type: 'text', text: 'Original prompt' }] }, 0),
          entry(
            {
              type: 'context_edit',
              role: null,
              content: null,
              metadata: { contextEdit: { targetId: 'u1', replacement: 'Replacement content' } },
            },
            1,
          ),
        ]}
      />,
    )

    expect(screen.getByText('CONTEXT EDIT')).toBeInTheDocument()
    expect(screen.getByText(/An earlier message was replaced/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Jump to entry #0' })).toHaveAttribute(
      'href',
      '#entry-0',
    )
    expect(screen.getAllByText('Replacement content').length).toBeGreaterThan(0)
  })

  it('labels a removal when the normalized replacement is explicitly null', () => {
    const base = normalizeEntry(
      entry({ entryId: 'ce', type: 'context_edit', role: null, content: null }, 0),
      0,
    )
    const removal = { ...base, targetId: 'missing', replacement: null }
    renderWithProviders(<ContextEditBlock item={transcriptItemFor(removal)} />)

    expect(screen.getByText('CONTEXT EDIT').parentElement).toHaveTextContent(
      'An earlier message was removed from future model context.',
    )
    expect(screen.getByText('Target: missing')).toBeInTheDocument()
    expect(screen.queryByText('Replacement content')).not.toBeInTheDocument()
  })

  it('links a context edit to the target entry anchor', () => {
    const base = normalizeEntry(entry({ entryId: 'ce', type: 'context_edit', role: null, content: null }, 0), 0)
    const edit = { ...base, targetId: 'u1', replacement: 'Replacement content' }
    renderWithAnchors(<ContextEditBlock item={transcriptItemFor(edit)} />, [['u1', 'entry-0']])
    expect(screen.getByRole('link', { name: 'Jump to entry #0' })).toHaveAttribute('href', '#entry-0')
  })

  it('renders a standalone usage record with token and cost telemetry', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry(
            {
              type: 'usage',
              role: null,
              model: 'gpt-5.1',
              usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costTotal: 0.000015 },
              costTotal: 0.000015,
              content: null,
            },
            0,
          ),
        ]}
      />,
    )
    expect(screen.getByText('USAGE')).toBeInTheDocument()
    expect(screen.getAllByText('15 tok').length).toBeGreaterThan(0)
    expect(screen.getAllByText('gpt-5.1').length).toBeGreaterThan(0)
  })

  it('shows an unknown content block as a disclosure', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({
            content: [{ type: 'futureBlock', payload: { alpha: 1 } }],
          }),
        ]}
      />,
    )
    expect(
      screen.getByText(/Unsupported content/).closest('.pm-code__label'),
    ).toHaveTextContent('Unsupported content · futureblock')
  })

  it('renders an unsupported image as a placeholder, never as a live image', () => {
    renderWithProviders(
      <TranscriptHarness
        records={[
          entry({
            content: [
              { type: 'image', mimeType: 'image/svg+xml', data: '<svg onload="alert(1)"/>' },
            ],
          }),
        ]}
      />,
    )
    expect(screen.getByText('Unsupported image')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders a supported image behind a labelled dialog trigger', async () => {
    // jsdom does not implement `HTMLDialogElement.showModal`.
    const showModal = vi.fn()
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: showModal,
    })
    const { user } = renderWithProviders(
      <TranscriptHarness
        records={[
          entry({
            content: [
              { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=', alt: 'Screenshot' },
            ],
          }),
        ]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Open image: Screenshot' })
    expect(screen.getAllByAltText('Screenshot').length).toBeGreaterThan(0)
    await user.click(trigger)
    expect(showModal).toHaveBeenCalledTimes(1)
  })
})

describe('transcript list states', () => {
  it('shows a no-entries message for an empty transcript', () => {
    renderWithProviders(<TranscriptHarness records={[]} />)
    expect(
      screen.getByText('No transcript entries were parsed from this session.'),
    ).toBeInTheDocument()
  })

  it('renders a search empty state with actions', () => {
    function SearchEmptyHarness() {
      const items = useMemo(
        () => buildTranscriptItems([normalizeEntry(entry(), 0)]),
        [],
      )
      const expansion = useTranscriptExpansion()
      const search = useTranscriptSearch(items, 'zzz')
      const [filter, setFilter] = useState<TranscriptFilter>('all')
      return (
        <Transcript
          items={items}
          allItemsCount={items.length}
          filter={filter}
          search={search}
          expansion={expansion}
          sentinelRef={() => undefined}
          emptyReason={filter === 'errors' ? 'No errors recorded in this session.' : undefined}
          announce={() => undefined}
          onShowAll={() => setFilter('all')}
          onClearSearch={() => undefined}
          onSearchAll={() => setFilter('all')}
        />
      )
    }

    renderWithProviders(<SearchEmptyHarness />)
    expect(screen.getByText(/No matches for/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument()
  })

  it('shows the show-all control for a filtered empty state', async () => {
    function FilteredHarness() {
      const items = useMemo(() => buildTranscriptItems([normalizeEntry(entry(), 0)]), [])
      const expansion = useTranscriptExpansion()
      const search = useTranscriptSearch(items, '')
      const [showAll, setShowAll] = useState(false)
      return (
        <Transcript
          items={showAll ? items : []}
          allItemsCount={items.length}
          filter={showAll ? 'all' : 'errors'}
          search={search}
          expansion={expansion}
          sentinelRef={() => undefined}
          emptyReason={showAll ? undefined : 'No errors recorded in this session.'}
          announce={() => undefined}
          onShowAll={() => setShowAll(true)}
          onClearSearch={() => undefined}
          onSearchAll={() => setShowAll(true)}
        />
      )
    }

    const { user } = renderWithProviders(<FilteredHarness />)
    await user.click(screen.getByRole('button', { name: 'Show all' }))
    expect(screen.getByText('Hello there')).toBeInTheDocument()
  })
})

describe('EntryErrorBoundary', () => {
  it('keeps a broken entry isolated and offers raw JSON', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const brokenEntry = normalizeEntry(entry({ entryId: 'broken' }, 3), 3)

    function ExplodingBlock(): never {
      throw new Error('content exploded')
    }

    renderWithProviders(
      <ol>
        <li>
          <EntryErrorBoundary entry={brokenEntry}>
            <ExplodingBlock />
          </EntryErrorBoundary>
        </li>
      </ol>,
    )

    expect(screen.getByText('Could not render this entry.')).toBeInTheDocument()
    expect(screen.getByText('Entry #3 · message')).toBeInTheDocument()
    expect(screen.getByText('Raw entry JSON')).toBeInTheDocument()
    expect(screen.queryByText('content exploded')).not.toBeInTheDocument()
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

describe('Transcript context defaults', () => {
  it('renders entries outside a provider with the fallback context', () => {
    renderWithProviders(<TranscriptHarness records={[entry()]} />)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
  })
})
