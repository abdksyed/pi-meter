import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { timeseriesFixture } from '../../test/fixtures'
import { UsageChart } from './UsageChart'

const baseProps = {
  chart: 'cost' as const,
  groupBy: 'day' as const,
  rangeLabel: 'Last 7 days',
  timezone: 'UTC',
  onChartChange: vi.fn(),
}

describe('UsageChart', () => {
  it('renders a cost chart with a descriptive label and data table', async () => {
    const { user } = renderWithProviders(
      <UsageChart {...baseProps} points={timeseriesFixture()} />,
    )

    expect(screen.getByRole('heading', { name: 'Daily cost' })).toBeInTheDocument()
    expect(screen.getByText('Last 7 days · UTC')).toBeInTheDocument()

    // Chart alternative: 0.0017 + 0.019409 = 0.021109 -> "$0.0211"
    expect(
      screen.getByRole('img', { name: /Daily cost for Last 7 days\. Total cost \$0\.0211\./ }),
    ).toBeInTheDocument()
    expect(screen.getByText('2 buckets · $0.0211 total')).toBeInTheDocument()

    await user.click(screen.getByText('View data table'))
    const table = screen.getByRole('table')
    expect(within(table).getByText('Jan 14')).toBeInTheDocument()
    expect(within(table).getByText('Jan 15')).toBeInTheDocument()
    expect(within(table).getByText('$0.001700')).toBeInTheDocument()
    // Cache write is derived as total - (in + out + reasoning + cacheRead).
    expect(within(table).getByText('1,240')).toBeInTheDocument()
    expect(within(table).getByText('4,000')).toBeInTheDocument()
  })

  it('switches to tokens mode and toggles token series', async () => {
    const onChartChange = vi.fn()
    const { user } = renderWithProviders(
      <UsageChart {...baseProps} chart="tokens" points={timeseriesFixture()} onChartChange={onChartChange} />,
    )

    expect(screen.getByRole('heading', { name: 'Daily tokens' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tokens' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('2 buckets · 11.5K tokens')).toBeInTheDocument()

    const legend = screen.getByRole('group', { name: 'Visible token series' })
    const inputToggle = within(legend).getByRole('button', { name: 'Input' })
    expect(inputToggle).toHaveAttribute('aria-pressed', 'true')
    await user.click(inputToggle)
    expect(inputToggle).toHaveAttribute('aria-pressed', 'false')

    await user.click(screen.getByRole('button', { name: 'Cost' }))
    expect(onChartChange).toHaveBeenCalledWith('cost')
  })

  it('never hides the last visible token series', async () => {
    const { user } = renderWithProviders(
      <UsageChart {...baseProps} chart="tokens" points={timeseriesFixture()} />,
    )
    const legend = screen.getByRole('group', { name: 'Visible token series' })
    const labels = ['Input', 'Output', 'Reasoning', 'Cache read', 'Cache write']
    for (const label of labels.slice(0, -1)) {
      await user.click(within(legend).getByRole('button', { name: label }))
    }
    const last = within(legend).getByRole('button', { name: 'Cache write' })
    await user.click(last)
    expect(last).toHaveAttribute('aria-pressed', 'true')
  })

  it('renders empty, loading and error states', async () => {
    const onRetry = vi.fn()
    const empty = renderWithProviders(<UsageChart {...baseProps} points={[]} />)
    expect(screen.getByText('No usage in this range')).toBeInTheDocument()
    empty.unmount()

    const zero = renderWithProviders(
      <UsageChart
        {...baseProps}
        points={[
          {
            bucket: '2026-01-15',
            inputTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            cacheReadTokens: 0,
            totalTokens: 0,
            costTotal: 0,
            sessionCount: 0,
          },
        ]}
      />,
    )
    expect(screen.getByText('No usage in this range')).toBeInTheDocument()
    zero.unmount()

    const loading = renderWithProviders(<UsageChart {...baseProps} isLoading />)
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    loading.unmount()

    const { user } = renderWithProviders(
      <UsageChart {...baseProps} isError errorMessage="Chart offline" onRetry={onRetry} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the usage chart')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
