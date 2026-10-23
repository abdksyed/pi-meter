import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'

import { renderWithProviders } from '../../test/helpers'
import { normalizeEntry } from '../../lib/normalize'
import { buildTranscriptItems } from '../../lib/transcriptItems'
import { TranscriptContext } from './TranscriptContext'
import { useTranscriptExpansion } from '../../hooks/useTranscriptExpansion'
import type { ToolExecutionData } from '../../lib/sessionTypes'
import { CollapsibleCode } from './controls/CollapsibleCode'
import { CollapsibleSection } from './controls/CollapsibleSection'
import { CopyButton } from './controls/CopyButton'
import { EntryDetails } from './controls/EntryDetails'
import { EntryUsageDetails } from './controls/EntryUsageDetails'
import { HighlightedText } from './controls/HighlightedText'
import { ToolCallBlock } from './ToolCallBlock'
import { ToolResultBlock } from './ToolResultBlock'
import { ToolExecution } from './ToolExecution'
import { MessageContent } from './content/MessageContent'
import { ThinkingBlock } from './content/ThinkingBlock'
import { UnknownContentBlock } from './content/UnknownContentBlock'

/** Real expansion state so `openKey` disclosures actually toggle. */
function ExpansionProvider({ children }: { children: ReactNode }) {
  const expansion = useTranscriptExpansion()
  return (
    <TranscriptContext.Provider
      value={{
        expansion,
        query: '',
        matchedItemKeys: new Set<string>(),
        filter: 'all',
        entryAnchors: new Map<string, string>(),
        announce: () => undefined,
      }}
    >
      {children}
    </TranscriptContext.Provider>
  )
}

function renderExpanding(ui: ReactNode) {
  return renderWithProviders(<ExpansionProvider>{ui}</ExpansionProvider>)
}

function installClipboard(impl: () => Promise<void> = async () => undefined) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true })
  return vi.spyOn(navigator.clipboard, 'writeText').mockImplementation(impl)
}

function toolExecution(overrides: Partial<ToolExecutionData> = {}): ToolExecutionData {
  const callEntry = normalizeEntry(
    {
      entryIndex: 1,
      entryId: 'a1',
      type: 'message',
      role: 'assistant',
      content: [
        {
          type: 'toolCall',
          id: 'call-1',
          name: 'bash',
          arguments: { command: 'pytest', cwd: '/work/alpha' },
        },
      ],
    },
    1,
  )
  const resultEntry = normalizeEntry(
    {
      entryIndex: 2,
      entryId: 'r1',
      type: 'message',
      role: 'toolResult',
      toolCallId: 'call-1',
      toolName: 'bash',
      durationMs: 420,
      content: [{ type: 'text', text: '3 passed in 0.42s' }],
    },
    2,
  )
  return {
    key: 'entry-1-tool-0',
    callId: 'call-1',
    name: 'bash',
    arguments: { command: 'pytest', cwd: '/work/alpha' },
    argsText: '{\n  "command": "pytest",\n  "cwd": "/work/alpha"\n}',
    call: callEntry,
    results: [
      {
        key: resultEntry.key,
        entry: resultEntry,
        text: '3 passed in 0.42s',
        images: [],
        isError: false,
      },
    ],
    isError: false,
    ...overrides,
  }
}

describe('CopyButton', () => {
  it('copies, updates its accessible name and announces success', async () => {
    const announce = vi.fn()
    const { user } = renderWithProviders(
      <TranscriptContext.Provider
        value={{
          expansion: {
            mode: 'default',
            isOpen: (_k: string, d: boolean) => d,
            toggle: () => undefined,
            expandAll: () => undefined,
            collapseAll: () => undefined,
            reset: () => undefined,
          },
          query: '',
          matchedItemKeys: new Set<string>(),
          filter: 'all',
          entryAnchors: new Map<string, string>(),
          announce,
        }}
      >
        <CopyButton text="hello" label="Copy message" />
      </TranscriptContext.Provider>,
    )
    const writeText = installClipboard()

    await user.click(screen.getByRole('button', { name: 'Copy message' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('hello'))
    expect(await screen.findByRole('button', { name: 'Copy message: copied' })).toHaveTextContent(
      '✓ Copied',
    )
    expect(announce).toHaveBeenCalledWith('Copy message: copied')
  })

  it('reports a clipboard failure instead of claiming success', async () => {
    const { user } = renderWithProviders(<CopyButton text="hello" label="Copy" />)
    installClipboard(async () => {
      throw new Error('denied')
    })

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    expect(await screen.findByRole('button', { name: 'Copy: copy failed' })).toHaveTextContent(
      'Copy failed',
    )
  })

  it('is disabled for empty text', () => {
    renderWithProviders(<CopyButton text="" label="Copy" />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled()
  })
})

describe('CollapsibleCode', () => {
  it('shows long output collapsed with an accessible expand/collapse control', async () => {
    const text = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`).join('\n')
    const { user } = renderExpanding(<CollapsibleCode text={text} label="Result" openKey="result" />)

    expect(screen.getByText('Result')).toBeInTheDocument()
    expect(screen.getByText('20 lines')).toBeInTheDocument()
    expect(screen.getByText('Showing preview (lines 1–8 of 20)')).toBeInTheDocument()
    expect(screen.queryByText('line 20')).not.toBeInTheDocument()

    const toggle = screen.getByRole('button', { name: 'Expand' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)

    const collapse = screen.getAllByRole('button', { name: 'Collapse' })[0]
    expect(collapse).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Showing all 20 lines')).toBeInTheDocument()
  })

  it('copies the original text rather than the truncated preview', async () => {
    const text = `${'x'.repeat(2000)}\nend`
    const { user } = renderWithProviders(<CollapsibleCode text={text} label="Result" />)
    const writeText = installClipboard()

    await user.click(screen.getByRole('button', { name: 'Copy' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(text))
  })

  it('renders short text fully without a toggle', () => {
    renderWithProviders(<CollapsibleCode text="3 passed" label="Result" />)
    expect(screen.getByText('3 passed')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Expand' })).not.toBeInTheDocument()
  })

  it('shows an empty label and respects the empty text override', () => {
    const { unmount } = renderWithProviders(<CollapsibleCode text="" label="Result" />)
    expect(screen.getByText('No output')).toBeInTheDocument()
    unmount()
    renderWithProviders(<CollapsibleCode text="" emptyText="Nothing here" />)
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('strips terminal escape sequences before display', () => {
    renderWithProviders(<CollapsibleCode text={'\u001b[31mred\u001b[0m'} label="Result" />)
    expect(screen.getByText('red')).toBeInTheDocument()
    expect(screen.queryByText(/\u001b/)).not.toBeInTheDocument()
  })

  it('highlights a query inside code lines', () => {
    renderWithProviders(<CollapsibleCode text="parser pipeline" label="Result" query="parser" />)
    const mark = screen.getByText('parser', { selector: 'mark' })
    expect(mark).toHaveClass('pm-search-hit')
  })
})

describe('CollapsibleSection', () => {
  it('toggles its panel and reports expansion state', async () => {
    const { user } = renderWithProviders(
      <CollapsibleSection title="Details" meta="meta">
        <p>hidden body</p>
      </CollapsibleSection>,
    )
    const trigger = screen.getByRole('button', { name: /Details/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText('hidden body')).not.toBeVisible()

    await user.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('hidden body')).toBeVisible()
  })

  it('honours forceOpen', () => {
    renderWithProviders(
      <CollapsibleSection title="Summary" forceOpen>
        <p>forced body</p>
      </CollapsibleSection>,
    )
    expect(screen.getByRole('button', { name: /Summary/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})

describe('HighlightedText', () => {
  it('marks every case-insensitive occurrence', () => {
    renderWithProviders(<HighlightedText text="Parser parser PARSER" query="parser" />)
    expect(screen.getAllByText(/^parser$/i, { selector: 'mark' })).toHaveLength(3)
  })

  it('escapes regex characters safely', () => {
    renderWithProviders(<HighlightedText text="a.b [c] (d)" query="[c]" />)
    expect(screen.getByText('[c]', { selector: 'mark' })).toBeInTheDocument()
  })

  it('renders plain text when there is no query', () => {
    renderWithProviders(<HighlightedText text="parser" query="" />)
    expect(document.querySelector('mark')).toBeNull()
  })
})

describe('EntryDetails and EntryUsageDetails', () => {
  it('shows entry metadata and copyable raw JSON', async () => {
    const entry = normalizeEntry(
      {
        entryIndex: 4,
        entryId: 'a1',
        parentId: 'u1',
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        provider: 'anthropic',
        thinkingLevel: 'high',
        content: [{ type: 'text', text: 'Hello' }],
      },
      4,
    )
    const { user } = renderWithProviders(<EntryDetails entry={entry} />)
    const writeText = installClipboard()

    await user.click(screen.getByRole('button', { name: /Details/ }))
    const panel = screen.getByText('#4').closest('dl') as HTMLElement
    expect(within(panel).getByText('#4')).toBeInTheDocument()
    expect(within(panel).getByText('message')).toBeInTheDocument()
    expect(within(panel).getByText('assistant')).toBeInTheDocument()
    expect(within(panel).getByText('a1')).toBeInTheDocument()
    expect(within(panel).getByText('u1')).toBeInTheDocument()
    expect(within(panel).getByText('claude-sonnet-4-5')).toBeInTheDocument()
    expect(within(panel).getByText('high')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy raw JSON' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(expect.stringContaining('"entryId": "a1"')),
    )
  })

  it('renders usage rows with reasoning uncosted', async () => {
    const entry = normalizeEntry(
      {
        entryIndex: 1,
        type: 'message',
        role: 'assistant',
        model: 'claude-sonnet-4-5',
        content: [{ type: 'text', text: 'Hello' }],
        usage: {
          inputTokens: 1200,
          outputTokens: 340,
          reasoningTokens: 60,
          cacheReadTokens: 4000,
          cacheWriteTokens: 500,
          totalTokens: 6040,
          costInput: 0.0036,
          costOutput: 0.0051,
          costCacheRead: 0.0004,
          costCacheWrite: 0.00187,
          costTotal: 0.01097,
        },
      },
      1,
    )

    const { user } = renderWithProviders(<EntryUsageDetails entry={entry} />)
    await user.click(screen.getByRole('button', { name: /Usage/ }))

    const table = screen.getByRole('table', { name: 'Token usage and cost for this entry' })
    const reasoningRow = within(table).getByRole('rowheader', { name: 'Reasoning' }).closest('tr')!
    expect(within(reasoningRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '60',
      '—',
    ])
    const totalRow = within(table).getByRole('rowheader', { name: 'Total' }).closest('tr')!
    expect(within(totalRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual([
      '6,040',
      '$0.010970',
    ])
  })

  it('renders nothing without usage or cost', () => {
    const entry = normalizeEntry({ entryIndex: 0, type: 'message', role: 'user' }, 0)
    const { container } = renderWithProviders(<EntryUsageDetails entry={entry} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('ToolCallBlock', () => {
  it('summarises the tool, exposes argument disclosure and copies full arguments', async () => {
    const execution = toolExecution()
    const { user } = renderWithProviders(
      <ToolCallBlock execution={execution} itemKey="entry-1" />,
    )
    const writeText = installClipboard()

    expect(screen.getByRole('region', { name: /Arguments · 2 keys/ })).toBeInTheDocument()
    expect(screen.getByText('pytest')).toBeInTheDocument()
    expect(screen.getByText('Arguments · 2 keys')).toBeInTheDocument()
    // Small argument objects are expanded by default (two toggles: head + foot).
    expect(screen.getAllByRole('button', { name: 'Collapse' })[0]).toHaveAttribute(
      'aria-expanded',
      'true',
    )

    await user.click(screen.getByRole('button', { name: 'Copy arguments' }))
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(execution.argsText),
    )
  })

  it('marks a call with no result as pending', () => {
    renderWithProviders(
      <ToolExecution execution={{ ...toolExecution(), results: [] }} itemKey="entry-1" />,
    )
    expect(screen.getByText('No result recorded for this call.')).toBeInTheDocument()
  })
})

describe('ToolResultBlock', () => {
  it('shows preview limits, expand/collapse and a copy action for long output', async () => {
    const text = Array.from({ length: 40 }, (_, index) => `row ${index + 1}`).join('\n')
    const entry = normalizeEntry(
      {
        entryIndex: 2,
        entryId: 'r1',
        type: 'message',
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        content: [{ type: 'text', text }],
      },
      2,
    )
    const { user } = renderExpanding(
      <ToolResultBlock
        result={{ key: entry.key, entry, text, images: [], isError: false }}
        toolName="bash"
        itemKey="entry-1"
        args={{ command: 'pytest' }}
        index={0}
      />,
    )
    const writeText = installClipboard()

    expect(screen.getByText('40 lines')).toBeInTheDocument()
    expect(screen.getByText('Showing preview (lines 1–8 of 40)')).toBeInTheDocument()
    expect(screen.queryByText('row 40')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Expand' }))
    expect(screen.getByText('row 40')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Collapse' })[0])
    expect(screen.queryByText('row 40')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy result' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(text))
  })

  it('expands failed results by default and labels them as errors', () => {
    const entry = normalizeEntry(
      {
        entryIndex: 2,
        type: 'message',
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        isError: true,
        content: [{ type: 'text', text: 'boom\n\nmore detail' }],
      },
      2,
    )
    renderWithProviders(
      <ToolResultBlock
        result={{ key: entry.key, entry, text: 'boom\n\nmore detail', images: [], isError: true }}
        toolName="bash"
        itemKey="entry-1"
        args={undefined}
        index={1}
      />,
    )
    expect(screen.getByText('✖ Error')).toBeInTheDocument()
    expect(screen.getByLabelText('Tool result 2 for bash')).toBeInTheDocument()
  })

  it('renders a very long unbroken string without dropping the copy path', () => {
    const text = 'x'.repeat(5000)
    const entry = normalizeEntry(
      {
        entryIndex: 2,
        type: 'message',
        role: 'toolResult',
        toolCallId: 'call-1',
        toolName: 'bash',
        content: [{ type: 'text', text }],
      },
      2,
    )
    renderWithProviders(
      <ToolResultBlock
        result={{ key: entry.key, entry, text, images: [], isError: false }}
        toolName="bash"
        itemKey="entry-1"
        args={undefined}
        index={0}
      />,
    )
    expect(screen.getByRole('button', { name: 'Copy result' })).toBeEnabled()
    expect(screen.getByText('1 line')).toBeInTheDocument()
  })

  it('renders empty output text when the result object is blank', () => {
    const entry = normalizeEntry({ entryIndex: 2, type: 'message', role: 'toolResult' }, 2)
    renderWithProviders(
      <ToolResultBlock
        result={{ key: entry.key, entry, text: '', images: [], isError: false }}
        toolName="grep"
        itemKey="entry-1"
        args={undefined}
        index={0}
      />,
    )
    expect(screen.getByText('No output recorded.')).toBeInTheDocument()
  })
})

describe('MessageContent', () => {
  it('renders text, thinking, image, tool call and unknown blocks', () => {
    renderWithProviders(
      <MessageContent
        entryKey="entry-0"
        blocks={[
          { kind: 'text', text: 'Plain **bold** text' },
          { kind: 'thinking', text: 'internal reasoning' },
          { kind: 'image', mimeType: 'image/png', data: 'aGVsbG8=', alt: 'Chart' },
          { kind: 'tool-call', id: 'call-1', name: 'grep', arguments: { pattern: 'x' } },
          { kind: 'unknown', rawType: 'futureBlock', raw: { alpha: 1 } },
        ]}
      />,
    )

    expect(screen.getByText('bold')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Thinking/ })).toBeInTheDocument()
    expect(screen.getAllByAltText('Chart').length).toBeGreaterThan(0)
    expect(screen.getByText('Tool call · grep')).toBeInTheDocument()
    expect(screen.getByText(/Unsupported content/)).toBeInTheDocument()
  })

  it('renders tool calls through the supplied renderer', () => {
    renderWithProviders(
      <MessageContent
        entryKey="entry-0"
        blocks={[{ kind: 'tool-call', id: 'call-1', name: 'grep', arguments: {} }]}
        renderToolCall={(block) => <p>custom {block.name}</p>}
      />,
    )
    expect(screen.getByText('custom grep')).toBeInTheDocument()
  })
})

describe('ThinkingBlock', () => {
  it('starts collapsed, shows its size and copies the text', async () => {
    const { user } = renderWithProviders(
      <ThinkingBlock text="Let me check the parser." index={0} openKey="thinking-0" />,
    )
    const writeText = installClipboard()

    expect(screen.getByText('24 chars')).toBeInTheDocument()
    const trigger = screen.getByRole('button', { name: /Thinking/ })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await user.click(screen.getByRole('button', { name: 'Copy thinking' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('Let me check the parser.'))
  })
})

describe('UnknownContentBlock', () => {
  it('shows the raw payload and type', () => {
    const { container } = renderWithProviders(
      <UnknownContentBlock rawType="futureBlock" raw={{ alpha: 1 }} />,
    )
    expect(container.querySelector('.pm-code__label')?.textContent).toBe(
      'Unsupported content · futureBlock',
    )
    expect(screen.getByText(/"alpha": 1/)).toBeInTheDocument()
  })
})

describe('tool execution pairing', () => {
  it('pairs results by call id without dropping orphans', () => {
    const items = buildTranscriptItems([
      normalizeEntry(
        {
          entryIndex: 0,
          entryId: 'a1',
          type: 'message',
          role: 'assistant',
          content: [
            { type: 'toolCall', id: 'call-1', name: 'bash', arguments: { command: 'ls' } },
            { type: 'toolCall', id: 'call-2', name: 'grep', arguments: { pattern: 'x' } },
          ],
        },
        0,
      ),
      normalizeEntry(
        {
          entryIndex: 1,
          entryId: 'r1',
          type: 'message',
          role: 'toolResult',
          toolCallId: 'call-1',
          content: [{ type: 'text', text: 'a.txt' }],
        },
        1,
      ),
      normalizeEntry(
        {
          entryIndex: 2,
          entryId: 'r2',
          type: 'message',
          role: 'toolResult',
          toolCallId: 'orphan',
          content: [{ type: 'text', text: 'orphan output' }],
        },
        2,
      ),
    ])

    expect(items).toHaveLength(2)
    expect(items[0].executions).toHaveLength(2)
    expect(items[0].executions[0].results).toHaveLength(1)
    expect(items[0].executions[1].results).toHaveLength(0)
    expect(items[1].type).toBe('tool-result')
    expect(items[1].entry.toolCallId).toBe('orphan')
  })
})
