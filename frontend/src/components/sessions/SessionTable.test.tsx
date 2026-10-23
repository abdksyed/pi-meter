import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import {
  SESSION_IDS,
  sessionListItemFixture,
  sessionsResponseFixture,
} from '../../test/fixtures'
import { SessionTable } from './SessionTable'
import { SessionList } from './SessionList'

const tableDefaults = {
  sort: 'lastActivity' as const,
  dir: 'desc' as const,
  isFiltered: false,
  onSort: vi.fn(),
  onClearFilters: vi.fn(),
}

describe('SessionTable', () => {
  it('renders one row per session with links, model badge and cost', () => {
    renderWithProviders(
      <SessionTable
        {...tableDefaults}
        data={sessionsResponseFixture({
          items: [
            sessionListItemFixture(),
            sessionListItemFixture({
              sessionId: SESSION_IDS.beta,
              sessionName: null,
              firstUserMessage: 'Understand beta timing',
              cwd: '/work/beta',
              costTotal: 0.00394,
              totalTokens: 165,
            }),
          ],
          total: 2,
        })}
      />,
    )

    expect(screen.getByRole('table', { name: 'Sessions: 2 total' })).toBeInTheDocument()
    const rows = screen.getAllByRole('row')
    // Header + two body rows.
    expect(rows).toHaveLength(3)

    expect(
      screen.getByRole('link', { name: /Refactor parser pipeline/ }),
    ).toHaveAttribute('href', `/sessions/${SESSION_IDS.main}`)
    expect(screen.getByRole('link', { name: /Understand beta timing/ })).toHaveAttribute(
      'href',
      `/sessions/${SESSION_IDS.beta}`,
    )

    expect(screen.getAllByText('claude-sonnet-4-5').length).toBeGreaterThan(0)
    expect(screen.getByText('$0.0194')).toBeInTheDocument()
    expect(screen.getByText('$0.003940')).toBeInTheDocument()
    expect(screen.getAllByText('10.7K').length).toBeGreaterThan(0)
  })

  it('marks active sort direction and reports sort requests', async () => {
    const onSort = vi.fn()
    const { user } = renderWithProviders(
      <SessionTable {...tableDefaults} sort="cost" dir="asc" onSort={onSort} data={sessionsResponseFixture()} />,
    )

    const costHeader = screen.getByRole('columnheader', { name: /Cost/ })
    expect(costHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(screen.getByRole('columnheader', { name: /Last active/ })).toHaveAttribute(
      'aria-sort',
      'none',
    )

    await user.click(screen.getByRole('button', { name: /Tokens/ }))
    expect(onSort).toHaveBeenCalledWith('tokens')
    await user.click(screen.getByRole('button', { name: /Session title & prompt/ }))
    expect(onSort).toHaveBeenCalledWith('title')
  })

  it('labels parse errors and active sessions through the status dot', () => {
    renderWithProviders(
      <SessionTable
        {...tableDefaults}
        data={sessionsResponseFixture({
          items: [
            sessionListItemFixture({
              parseStatus: 'error',
              parseError: 'Line 3 is malformed',
            }),
            sessionListItemFixture({
              sessionId: SESSION_IDS.beta,
              lastActivityAt: new Date(Date.now() - 60_000).toISOString(),
            }),
          ],
        })}
      />,
    )

    const errorDot = screen.getByRole('img', { name: 'Parse error' })
    expect(errorDot).toHaveAttribute('title', 'Line 3 is malformed')
    expect(screen.getByText('Parse error ·')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Active in the last 15 minutes' })).toBeInTheDocument()
  })

  it('shows the filtered empty state with a clear-filters action', async () => {
    const onClearFilters = vi.fn()
    const { user } = renderWithProviders(
      <SessionTable
        {...tableDefaults}
        isFiltered
        onClearFilters={onClearFilters}
        data={sessionsResponseFixture({ items: [], total: 0 })}
      />,
    )
    expect(screen.getByText('No sessions match these filters')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClearFilters).toHaveBeenCalledTimes(1)
  })

  it('shows the unfiltered empty state without a clear action', () => {
    renderWithProviders(
      <SessionTable
        {...tableDefaults}
        data={sessionsResponseFixture({ items: [], total: 0 })}
      />,
    )
    expect(screen.getByText('No sessions in this range')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument()
  })

  it('shows an error state with retry and a skeleton while loading', async () => {
    const onRetry = vi.fn()
    const { user, unmount } = renderWithProviders(
      <SessionTable
        {...tableDefaults}
        isError
        errorMessage="Sessions offline"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load sessions')
    expect(screen.getByRole('alert')).toHaveTextContent('Sessions offline')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    unmount()

    renderWithProviders(<SessionTable {...tableDefaults} isLoading />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('SessionList (responsive cards)', () => {
  it('renders linked cards with title, cost, path and model badge', () => {
    renderWithProviders(
      <SessionList
        data={sessionsResponseFixture()}
        isFiltered={false}
        onClearFilters={vi.fn()}
      />,
    )

    const link = screen.getByRole('link', { name: /Refactor parser pipeline/ })
    expect(link).toHaveAttribute('href', `/sessions/${SESSION_IDS.main}`)
    expect(within(link).getByText('$0.0194')).toBeInTheDocument()
    expect(within(link).getByText('/work/alpha')).toBeInTheDocument()
    expect(within(link).getByText('claude-sonnet-4-5')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Idle' })).toBeInTheDocument()
  })

  it('handles filtered empty, unfiltered empty and error states', async () => {
    const onClearFilters = vi.fn()
    const onRetry = vi.fn()
    const filtered = renderWithProviders(
      <SessionList
        data={sessionsResponseFixture({ items: [], total: 0 })}
        isFiltered
        onClearFilters={onClearFilters}
      />,
    )
    expect(screen.getByText('No sessions match these filters')).toBeInTheDocument()
    await filtered.user.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(onClearFilters).toHaveBeenCalled()
    filtered.unmount()

    const empty = renderWithProviders(
      <SessionList
        data={sessionsResponseFixture({ items: [], total: 0 })}
        isFiltered={false}
        onClearFilters={vi.fn()}
      />,
    )
    expect(screen.getByText('No sessions in this range')).toBeInTheDocument()
    empty.unmount()

    const error = renderWithProviders(
      <SessionList
        isFiltered={false}
        isError
        errorMessage="Sessions offline"
        onRetry={onRetry}
        onClearFilters={vi.fn()}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load sessions')
    await error.user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
