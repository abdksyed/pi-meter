import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { summaryFixture } from '../../test/fixtures'
import { CostBreakdown } from './CostBreakdown'

describe('CostBreakdown', () => {
  it('renders the composition legend with independently checked shares', () => {
    renderWithProviders(<CostBreakdown summary={summaryFixture()} rangeLabel="Last 7 days" />)

    expect(screen.getByRole('heading', { name: 'Cost composition' })).toBeInTheDocument()
    expect(screen.getByText('Last 7 days')).toBeInTheDocument()

    // 0.0073 / (0.0073 + 0.0089 + 0.0004 + 0.00237) = 38.48%
    expect(screen.getByText('Input')).toBeInTheDocument()
    expect(screen.getByText('$0.007300')).toBeInTheDocument()
    expect(screen.getAllByText('38.5%').length).toBeGreaterThan(0)
    expect(screen.getAllByText('46.9%').length).toBeGreaterThan(0)

    // The rail image label is the accessible summary of the bar.
    const chart = screen.getByRole('img', { name: /Input 38\.5%, Output 46\.9%/ })
    expect(chart).toBeInTheDocument()
    expect(chart.getAttribute('aria-label')).toContain('Cache read 2.1%')

    // Reasoning has no separate recorded cost in the schema.
    expect(
      screen.getByText(/Reasoning tokens are counted in token totals/),
    ).toBeInTheDocument()
  })

  it('uses the recorded component values, not the recorded total', () => {
    const summary = summaryFixture()
    renderWithProviders(<CostBreakdown summary={summary} rangeLabel="Last 7 days" />)

    // costTotal is 0.019409 but the four components sum to 0.01897; the panel
    // must not render the recorded total anywhere.
    expect(screen.queryByText('$0.0194')).not.toBeInTheDocument()
    expect(screen.queryByText('$0.019409')).not.toBeInTheDocument()
  })

  it('shows an empty state when no component cost exists', () => {
    renderWithProviders(
      <CostBreakdown
        summary={summaryFixture({
          costInput: 0,
          costOutput: 0,
          costCacheRead: 0,
          costCacheWrite: 0,
        })}
        rangeLabel="Today"
      />,
    )
    expect(screen.getByText('No cost recorded')).toBeInTheDocument()
  })

  it('shows a skeleton while loading and never an error state', () => {
    renderWithProviders(<CostBreakdown rangeLabel="Today" isLoading />)
    expect(screen.getByRole('heading', { name: 'Cost composition' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })

  it('renders the failure state and retries', async () => {
    const onRetry = vi.fn()
    const { user } = renderWithProviders(
      <CostBreakdown
        rangeLabel="Today"
        isError
        errorMessage="Server exploded"
        onRetry={onRetry}
      />,
    )

    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Could not load cost composition')
    expect(alert).toHaveTextContent('Server exploded')

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
