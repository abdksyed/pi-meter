import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { filtersFixture, SUMMARY_COST_TOTAL, SUMMARY_TOTAL_TOKENS } from '../../test/fixtures'
import { SessionFilters } from './SessionFilters'
import { SessionsSummary } from './SessionsSummary'
import { projectBreakdownFixture } from '../../test/fixtures'

function filterProps(overrides: Partial<React.ComponentProps<typeof SessionFilters>> = {}) {
  return {
    range: '30d' as const,
    searchInput: '',
    filtersData: filtersFixture(),
    hasFilters: false,
    onChangeRange: vi.fn(),
    onChangeCustomRange: vi.fn(),
    onChangeCwd: vi.fn(),
    onChangeModel: vi.fn(),
    onChangeSearch: vi.fn(),
    onClearSearch: vi.fn(),
    onChangeMinCost: vi.fn(),
    onClearFilters: vi.fn(),
    ...overrides,
  }
}

describe('SessionFilters', () => {
  it('lists project and model options from the filters endpoint', async () => {
    const onChangeCwd = vi.fn()
    const onChangeModel = vi.fn()
    const { user } = renderWithProviders(
      <SessionFilters {...filterProps({ onChangeCwd, onChangeModel })} />,
    )

    expect(screen.getByRole('option', { name: 'alpha (1)' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'gpt-5.1 (1)' })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), '/work/beta')
    expect(onChangeCwd).toHaveBeenCalledWith('/work/beta')

    await user.selectOptions(screen.getByRole('combobox', { name: 'Model' }), 'gpt-5.1')
    expect(onChangeModel).toHaveBeenCalledWith('gpt-5.1')

    // Choosing the "all" entry clears the filter rather than sending an empty string.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), '')
    expect(onChangeCwd).toHaveBeenLastCalledWith(undefined)
  })

  it('keeps a filtered cwd in the option list even when the API omits it', () => {
    renderWithProviders(
      <SessionFilters
        {...filterProps({ cwd: '/work/unknown', filtersData: filtersFixture() })}
      />,
    )
    expect(screen.getByRole('option', { name: 'unknown' })).toBeInTheDocument()
  })

  it('renders removable chips for every active filter', async () => {
    const onChangeCwd = vi.fn()
    const onClearSearch = vi.fn()
    const onChangeMinCost = vi.fn()
    const onClearFilters = vi.fn()
    const { user } = renderWithProviders(
      <SessionFilters
        {...filterProps({
          cwd: '/work/alpha',
          model: 'gpt-5.1',
          searchInput: 'parser',
          minCost: '0.01',
          hasFilters: true,
          onChangeCwd,
          onClearSearch,
          onChangeMinCost,
          onClearFilters,
        })}
      />,
    )

    expect(screen.getByRole('group', { name: 'Active filters' })).toBeInTheDocument()
    expect(screen.getByText('≥ 0.01')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Remove Project filter' }))
    expect(onChangeCwd).toHaveBeenCalledWith(undefined)
    await user.click(screen.getByRole('button', { name: 'Remove Search filter' }))
    expect(onClearSearch).toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Remove Min cost filter' }))
    expect(onChangeMinCost).toHaveBeenCalledWith(undefined)
    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearFilters).toHaveBeenCalled()
  })

  it('emits search input changes and exposes the result count', async () => {
    const onChangeSearch = vi.fn()
    const { user } = renderWithProviders(
      <SessionFilters {...filterProps({ onChangeSearch, resultCount: 7 })} />,
    )
    await user.type(screen.getByRole('searchbox', { name: 'Filter sessions' }), 'beta')
    // The field is controlled by the caller, so it re-emits each keystroke.
    expect(onChangeSearch).toHaveBeenCalledTimes(4)
    expect(onChangeSearch).toHaveBeenNthCalledWith(1, 'b')
    expect(onChangeSearch).toHaveBeenNthCalledWith(4, 'a')
    expect(screen.getByRole('status')).toHaveTextContent('7 sessions match')
  })

  it('exposes a minimum-cost field under More filters', async () => {
    const onChangeMinCost = vi.fn()
    const { user } = renderWithProviders(
      <SessionFilters {...filterProps({ onChangeMinCost })} />,
    )
    await user.click(screen.getByText('More filters'))
    const input = screen.getByLabelText('Minimum cost')
    await user.type(input, '5')
    expect(onChangeMinCost).toHaveBeenLastCalledWith('5')
  })

  it('changes the compact date range', async () => {
    const onChangeRange = vi.fn()
    const { user } = renderWithProviders(
      <SessionFilters {...filterProps({ onChangeRange })} />,
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Date range' }), 'today')
    expect(onChangeRange).toHaveBeenCalledWith('today')
  })
})

describe('SessionsSummary', () => {
  it('renders totals, project shares and the per-session average', () => {
    renderWithProviders(
      <SessionsSummary
        summary={undefined}
        projects={projectBreakdownFixture()}
        rangeLabel="Last 30 days"
        data={{
          items: [],
          page: 1,
          pageSize: 25,
          total: 2,
          totalPages: 1,
          timezone: 'UTC',
          range: '30d',
          totals: {
            sessionCount: 2,
            costTotal: SUMMARY_COST_TOTAL,
            totalTokens: SUMMARY_TOTAL_TOKENS,
            averageSessionCost: SUMMARY_COST_TOTAL / 2,
          },
        }}
      />,
    )

    expect(screen.getByRole('complementary', { name: 'Sessions summary' })).toBeInTheDocument()
    expect(screen.getByText('Last 30 days total')).toBeInTheDocument()
    expect(screen.getByText('$0.0194')).toBeInTheDocument()
    expect(screen.getByText(/10\.7K tokens across 2 sessions/)).toBeInTheDocument()

    // Project shares are recomputed from project cost rows.
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText(/\$0\.0155 \(79\.7%\)/)).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Average per session' })).toBeInTheDocument()
    expect(screen.getByText('$0.009704')).toBeInTheDocument()
  })

  it('notes an active project filter and empty project cost', () => {
    renderWithProviders(
      <SessionsSummary
        projects={[]}
        rangeLabel="Today"
        cwd="/work/alpha"
        data={{
          items: [],
          page: 1,
          pageSize: 25,
          total: 0,
          totalPages: 1,
          timezone: 'UTC',
          range: 'today',
          totals: {
            sessionCount: 0,
            costTotal: 0,
            totalTokens: 0,
            averageSessionCost: 0,
          },
        }}
      />,
    )
    expect(screen.getByText('No project cost in this range.')).toBeInTheDocument()
    expect(screen.getByText('Filtered to')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
  })

  it('prefers the summary payload and shows skeletons while loading', () => {
    const { unmount } = renderWithProviders(
      <SessionsSummary rangeLabel="Today" isLoading />,
    )
    expect(screen.queryByText('$0.0194')).not.toBeInTheDocument()
    unmount()

    renderWithProviders(
      <SessionsSummary
        rangeLabel="Today"
        summary={{
          range: 'today',
          from: '2026-01-15',
          to: '2026-01-15',
          timezone: 'UTC',
          sessionCount: 1,
          costTotal: 0.5,
          costInput: 0,
          costOutput: 0,
          costCacheRead: 0,
          costCacheWrite: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 1000,
          userMessageCount: 1,
          assistantMessageCount: 1,
          toolCallCount: 0,
          averageSessionCost: 0.5,
          mostUsedModel: null,
          mostActiveProject: null,
        }}
      />,
    )
    expect(screen.getAllByText('$0.5000').length).toBe(2)
  })
})
