import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { summaryFixture } from '../../test/fixtures'
import { MetricStrip } from './MetricStrip'

describe('MetricStrip', () => {
  it('renders totals from the summary payload', () => {
    renderWithProviders(<MetricStrip summary={summaryFixture()} />)

    expect(document.querySelector('dl[aria-label="Usage metrics"]')).toBeInTheDocument()
    expect(screen.getByText('Sessions')).toBeInTheDocument()
    expect(screen.getByText('3 user messages')).toBeInTheDocument()

    // 10725 tokens -> compact "10.7K"
    expect(screen.getByText('10.7K')).toBeInTheDocument()
    // 260 / 10725 = 2.4% reasoning
    expect(screen.getByText('2.4% reasoning')).toBeInTheDocument()

    // 0.019409 / 2 = 0.0097045 -> below $0.01 so six decimals are shown.
    expect(screen.getByText('$0.009704')).toBeInTheDocument()
    expect(screen.getByText('$0.0194 total')).toBeInTheDocument()
    expect(screen.getByText('Assistant responses')).toBeInTheDocument()
    expect(screen.getByText('4 tool calls')).toBeInTheDocument()
  })

  it('exposes exact values via titles and marks loading', () => {
    const { unmount } = renderWithProviders(<MetricStrip summary={summaryFixture()} />)

    const tokens = screen.getByText('10.7K')
    expect(tokens.closest('[title]')).toHaveAttribute('title', '10,725 tokens')
    expect(screen.getByText('$0.009704').closest('[title]')).toHaveAttribute(
      'title',
      'Exact average $0.009704',
    )
    unmount()

    renderWithProviders(<MetricStrip isLoading />)
    expect(document.querySelector('dl[aria-label="Usage metrics"]')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
