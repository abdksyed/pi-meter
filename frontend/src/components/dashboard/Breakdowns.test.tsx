import { describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { modelBreakdownFixture, projectBreakdownFixture } from '../../test/fixtures'
import { ModelBreakdown } from './ModelBreakdown'
import { ProjectBreakdown } from './ProjectBreakdown'

const range = { range: '7d' as const }

describe('ModelBreakdown', () => {
  it('lists models by cost with links that carry the active range', () => {
    renderWithProviders(<ModelBreakdown rows={modelBreakdownFixture()} range={range} />)

    expect(screen.getByRole('heading', { name: 'Cost by model' })).toBeInTheDocument()
    expect(screen.getByText('2 models')).toBeInTheDocument()

    // 0.01547 sorted first; 0.01547 / 0.01941 = 79.7%
    expect(screen.getByText('claude-sonnet-4-5')).toBeInTheDocument()
    expect(screen.getByText('anthropic · 10.6K tokens')).toBeInTheDocument()
    expect(screen.getAllByText('79.7%').length).toBeGreaterThan(0)

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/sessions?range=7d&model=claude-sonnet-4-5')
    expect(links[1]).toHaveAttribute('href', '/sessions?range=7d&model=gpt-5.1')

    expect(screen.getByText('Top model · 79.7% of cost')).toBeInTheDocument()
  })

  it('preserves custom range bounds in the session link', () => {
    renderWithProviders(
      <ModelBreakdown
        rows={modelBreakdownFixture()}
        range={{ range: 'custom', from: '2026-01-01', to: '2026-01-15' }}
      />,
    )
    expect(screen.getAllByRole('link')[0]).toHaveAttribute(
      'href',
      '/sessions?range=custom&from=2026-01-01&to=2026-01-15&model=claude-sonnet-4-5',
    )
  })

  it('renders empty, loading and error states', async () => {
    const onRetry = vi.fn()
    const empty = renderWithProviders(<ModelBreakdown rows={[]} range={range} />)
    expect(screen.getByText('No model usage')).toBeInTheDocument()
    empty.unmount()

    const loading = renderWithProviders(<ModelBreakdown range={range} isLoading />)
    expect(screen.queryByText('No model usage')).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    loading.unmount()

    const { user } = renderWithProviders(
      <ModelBreakdown
        range={range}
        isError
        errorMessage="Model service down"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load models')
    expect(screen.getByRole('alert')).toHaveTextContent('Model service down')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe('ProjectBreakdown', () => {
  it('lists project slugs by cost with filter links', () => {
    renderWithProviders(<ProjectBreakdown rows={projectBreakdownFixture()} range={range} />)

    expect(screen.getByRole('heading', { name: 'Cost by project' })).toBeInTheDocument()
    expect(screen.getByText('2 directories')).toBeInTheDocument()
    expect(screen.getByText('alpha')).toBeInTheDocument()
    expect(screen.getByText('/work/alpha')).toBeInTheDocument()

    const links = screen.getAllByRole('link')
    expect(links[0]).toHaveAttribute('href', '/sessions?range=7d&cwd=%2Fwork%2Falpha')
    expect(links[1]).toHaveAttribute('href', '/sessions?range=7d&cwd=%2Fwork%2Fbeta')
    expect(screen.getByText('Top directory · alpha')).toBeInTheDocument()
  })

  it('renders empty, loading and error states', async () => {
    const onRetry = vi.fn()
    renderWithProviders(<ProjectBreakdown rows={[]} range={range} />)
    expect(screen.getByText('No project usage')).toBeInTheDocument()

    const { user } = renderWithProviders(
      <ProjectBreakdown
        range={range}
        isError
        errorMessage="Directory query failed"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load projects')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})
