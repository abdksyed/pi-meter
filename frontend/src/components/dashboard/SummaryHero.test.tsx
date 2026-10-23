import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { summaryFixture } from '../../test/fixtures'
import { SummaryHero } from './SummaryHero'

describe('SummaryHero', () => {
  it('renders the total cost, token total and session count', () => {
    renderWithProviders(
      <SummaryHero summary={summaryFixture()} rangeLabel="Last 7 days" />,
    )

    expect(screen.getByText('Total cost · Last 7 days')).toBeInTheDocument()
    expect(screen.getByText('$0.0194')).toBeInTheDocument()
    expect(screen.getByText('10,725 tokens')).toBeInTheDocument()
    expect(screen.getByText(/2\s+sessions/)).toBeInTheDocument()
    // No previous-period payload, so no delta badge is invented.
    expect(screen.queryByText(/↑|↓/)).not.toBeInTheDocument()
  })

  it('shows a period delta only when the previous period has data', () => {
    renderWithProviders(
      <SummaryHero
        summary={summaryFixture({
          previous: { costTotal: 0.01, totalTokens: 5000, sessionCount: 1 },
        })}
        rangeLabel="Last 7 days"
      />,
    )
    // (0.019409 - 0.01) / 0.01 = 94.09%
    expect(screen.getByText(/↑\s*94\.1%/)).toBeInTheDocument()
    expect(screen.getByText(/↑\s*94\.1%/)).toHaveAttribute(
      'title',
      '$0.0100 previous period',
    )
  })

  it('renders a skeleton while loading and no summary content', () => {
    renderWithProviders(<SummaryHero rangeLabel="Today" isLoading />)
    expect(document.querySelector('section[aria-label="Total cost"]')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.queryByText('$0.0194')).not.toBeInTheDocument()
  })

  it('renders the failure state with a retry', async () => {
    const onRetry = vi.fn()
    const { user } = renderWithProviders(
      <SummaryHero rangeLabel="Today" isError errorMessage="Summary offline" onRetry={onRetry} />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the summary')
    expect(screen.getByRole('alert')).toHaveTextContent('Summary offline')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
