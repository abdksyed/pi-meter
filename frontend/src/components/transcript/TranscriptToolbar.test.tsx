import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'
import { useMemo } from 'react'

import { renderWithProviders } from '../../test/helpers'
import { normalizeEntry } from '../../lib/normalize'
import { buildTranscriptItems } from '../../lib/transcriptItems'
import { useTranscriptSearch } from '../../hooks/useTranscriptSearch'
import type { TranscriptCounts, TranscriptFilter } from '../../lib/sessionTypes'
import { TranscriptToolbar } from './TranscriptToolbar'
import { TranscriptFilters } from './TranscriptFilters'
import { TranscriptActions } from './TranscriptActions'
import { TranscriptSearch } from './TranscriptSearch'

const counts: TranscriptCounts = { all: 12, user: 2, assistant: 3, tools: 4, errors: 1 }

function ToolbarHarness({
  query = '',
  onQueryChange,
  onFilterChange,
  onExpandAll = () => undefined,
  onCollapseAll = () => undefined,
  onJumpToLatest = () => undefined,
  latestDisabled = false,
}: {
  query?: string
  onQueryChange?: (value: string) => void
  onFilterChange?: (filter: TranscriptFilter) => void
  onExpandAll?: () => void
  onCollapseAll?: () => void
  onJumpToLatest?: () => void
  latestDisabled?: boolean
}) {
  const items = useMemo(
    () =>
      buildTranscriptItems([
        normalizeEntry(
          { entryIndex: 0, type: 'message', role: 'user', content: [{ type: 'text', text: 'parser work' }] },
          0,
        ),
        normalizeEntry(
          {
            entryIndex: 1,
            type: 'message',
            role: 'assistant',
            content: [
              { type: 'text', text: 'parser done' },
              { type: 'toolCall', id: 'c1', name: 'bash', arguments: { command: 'pytest' } },
            ],
          },
          1,
        ),
      ]),
    [],
  )
  const search = useTranscriptSearch(items, query)
  return (
    <TranscriptToolbar
      query={query}
      onQueryChange={onQueryChange ?? (() => undefined)}
      search={search}
      filter="all"
      counts={counts}
      onFilterChange={onFilterChange ?? (() => undefined)}
      onExpandAll={onExpandAll}
      onCollapseAll={onCollapseAll}
      onJumpToLatest={onJumpToLatest}
      latestDisabled={latestDisabled}
    />
  )
}

describe('TranscriptFilters', () => {
  it('shows counts and marks the pressed filter', async () => {
    const onChange = vi.fn()
    const { user } = renderWithProviders(
      <TranscriptFilters filter="tools" counts={counts} onChange={onChange} />,
    )

    const group = screen.getByRole('group', { name: 'Filter transcript' })
    const tools = within(group).getByRole('button', { name: 'Tools (4)' })
    expect(tools).toHaveAttribute('aria-pressed', 'true')
    expect(within(group).getByRole('button', { name: 'Errors (1)' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )

    await user.click(within(group).getByRole('button', { name: 'Errors (1)' }))
    expect(onChange).toHaveBeenCalledWith('errors')
  })
})

describe('TranscriptActions', () => {
  it('reports expand, collapse and jump requests', async () => {
    const onExpandAll = vi.fn()
    const onCollapseAll = vi.fn()
    const onJumpToLatest = vi.fn()
    const { user } = renderWithProviders(
      <TranscriptActions
        onExpandAll={onExpandAll}
        onCollapseAll={onCollapseAll}
        onJumpToLatest={onJumpToLatest}
        latestDisabled={false}
      />,
    )

    const group = screen.getByRole('group', { name: 'Transcript actions' })
    await user.click(within(group).getByRole('button', { name: 'Expand all' }))
    await user.click(within(group).getByRole('button', { name: 'Collapse all' }))
    await user.click(within(group).getByRole('button', { name: '↓ Latest' }))
    expect(onExpandAll).toHaveBeenCalled()
    expect(onCollapseAll).toHaveBeenCalled()
    expect(onJumpToLatest).toHaveBeenCalled()
  })

  it('disables the latest action at the bottom of the transcript', () => {
    renderWithProviders(
      <TranscriptActions
        onExpandAll={vi.fn()}
        onCollapseAll={vi.fn()}
        onJumpToLatest={vi.fn()}
        latestDisabled
      />,
    )
    expect(screen.getByRole('button', { name: '↓ Latest' })).toBeDisabled()
  })
})

describe('TranscriptSearch', () => {
  it('reports match counts and navigates matches with buttons and keys', async () => {
    const onQueryChange = vi.fn()
    const { user } = renderWithProviders(
      <ToolbarHarness query="parser" onQueryChange={onQueryChange} />,
    )

    // Known a11y gap (D2): the transcript search input has no <label>/aria-label,
    // so it is located by its placeholder instead of an accessible name.
    const input = screen.getByPlaceholderText('Search transcript…')
    expect(input).toHaveValue('parser')
    expect(input).toHaveAttribute('aria-describedby', 'pm-search-status')
    expect(document.querySelector('.pm-search__status')).toHaveTextContent(
      '2 entries · 2 matches',
    )
    // Both entries contain "parser": 2 entries, 2 occurrences.
    expect(screen.getByText('2 entries · 2 matches')).toBeInTheDocument()

    const next = screen.getByRole('button', { name: 'Next match' })
    const prev = screen.getByRole('button', { name: 'Previous match' })
    expect(next).toBeEnabled()
    expect(prev).toBeEnabled()

    // Enter advances, Shift+Enter rewinds, Escape requests a clear.
    await user.type(input, '{Enter}')
    await user.type(input, '{Shift>}{Enter}{/Shift}')
    expect(next).toBeEnabled()
    await user.type(input, '{Escape}')
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  // Requirement (test_plan.md): "Verify keyboard-only search" with accessible
  // controls. Known defect D2: the transcript search input has no <label>,
  // aria-label or aria-labelledby, so assistive tech announces an unnamed edit
  // field. Other tests locate it by placeholder because of this gap.
  it('gives the search input an accessible name (known defect D2)', () => {
    renderWithProviders(<ToolbarHarness />)
    expect(screen.getByRole('searchbox', { name: /search transcript/i })).toBeInTheDocument()
  })

  it('prompts for a longer query and reports no matches', () => {
    const { unmount } = renderWithProviders(<ToolbarHarness query="p" />)
    expect(screen.getByText('Type at least 2 characters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled()
    unmount()

    renderWithProviders(<ToolbarHarness query="zzz" />)
    expect(screen.getByText('No matches')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next match' })).toBeDisabled()
  })

  it('shows a clear control only with a query and clears on click', async () => {
    const onQueryChange = vi.fn()
    const { user } = renderWithProviders(
      <ToolbarHarness query="parser" onQueryChange={onQueryChange} />,
    )
    await user.click(screen.getByRole('button', { name: 'Clear' }))
    expect(onQueryChange).toHaveBeenCalledWith('')
  })

  it('focuses search with "/" outside inputs', async () => {
    const { user } = renderWithProviders(<ToolbarHarness />)
    await user.click(document.body)
    await user.keyboard('/')
    expect(screen.getByPlaceholderText('Search transcript…')).toHaveFocus()
  })
})

describe('TranscriptToolbar', () => {
  it('wires filter, action and search callbacks together', async () => {
    const onFilterChange = vi.fn()
    const onExpandAll = vi.fn()
    const { user } = renderWithProviders(
      <ToolbarHarness onFilterChange={onFilterChange} onExpandAll={onExpandAll} />,
    )

    await user.click(screen.getByRole('button', { name: 'User (2)' }))
    expect(onFilterChange).toHaveBeenCalledWith('user')
    await user.click(screen.getByRole('button', { name: 'Expand all' }))
    expect(onExpandAll).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('search', { name: 'Search transcript' })).toBeInTheDocument()
  })

  it('disables the latest action when the toolbar says so', () => {
    renderWithProviders(<ToolbarHarness latestDisabled />)
    expect(screen.getByRole('button', { name: '↓ Latest' })).toBeDisabled()
  })
})

describe('TranscriptSearch standalone', () => {
  it('renders a labelled search region with a described status', () => {
    const search = {
      query: '',
      activeQuery: '',
      queryValid: false,
      matches: [],
      matchedItemKeys: new Set<string>(),
      entryMatchCount: 0,
      occurrenceCount: 0,
      activeIndex: 0,
      next: vi.fn(),
      prev: vi.fn(),
      clear: vi.fn(),
    }
    renderWithProviders(<TranscriptSearch value="" onChange={vi.fn()} search={search} />)
    const region = screen.getByRole('search', { name: 'Search transcript' })
    expect(within(region).getByText('Press / to search')).toBeInTheDocument()
    // The live status span carries aria-live but no role="status" (gap D2).
    expect(region.querySelector('.pm-search__status')).toHaveAttribute('aria-live', 'polite')
  })
})
