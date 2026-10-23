import { describe, expect, it, vi } from 'vitest'
import { screen, within } from '@testing-library/react'

import { renderWithProviders } from '../../test/helpers'
import { sessionListItemFixture, sessionsResponseFixture, SESSION_IDS } from '../../test/fixtures'
import { RecentSessions } from './RecentSessions'

const range = { range: '7d' as const }

describe('RecentSessions', () => {
  it('renders recent rows and links to the detail route and all sessions', () => {
    renderWithProviders(
      <RecentSessions
        data={sessionsResponseFixture({
          items: [
            sessionListItemFixture(),
            sessionListItemFixture({
              sessionId: SESSION_IDS.beta,
              sessionName: null,
              firstUserMessage: 'Understand beta timing',
              cwd: '/work/beta',
              models: [
                { provider: 'openai', model: 'gpt-5.1' },
                { provider: 'anthropic', model: 'claude-sonnet-4-5' },
              ],
            }),
          ],
          total: 9,
        })}
        range={range}
      />,
    )

    expect(screen.getByRole('heading', { name: 'Recent sessions' })).toBeInTheDocument()
    expect(screen.getByText('2 of 9')).toBeInTheDocument()

    const title = screen.getByRole('link', { name: /Refactor parser pipeline/ })
    expect(title).toHaveAttribute('href', `/sessions/${SESSION_IDS.main}`)
    expect(title).toHaveTextContent('3 responses · 18 entries')

    // Falls back to the first user message when the session has no name.
    expect(
      screen.getByRole('link', { name: /Understand beta timing/ }),
    ).toHaveAttribute('href', `/sessions/${SESSION_IDS.beta}`)

    // Multiple models render the first plus a "+n" suffix and keep the rest in a title.
    const modelTag = screen.getByText('gpt-5.1 +1')
    expect(modelTag).toHaveAttribute('title', 'gpt-5.1, claude-sonnet-4-5')

    // Independent arithmetic: 10,725 tokens -> 10.7K and $0.019409 -> $0.0194.
    expect(screen.getAllByText('10.7K').length).toBe(2)
    expect(screen.getAllByText('$0.0194').length).toBe(2)

    expect(screen.getByRole('link', { name: 'View all sessions →' })).toHaveAttribute(
      'href',
      '/sessions?range=7d',
    )
  })

  it('falls back to the session id when there is no title', () => {
    renderWithProviders(
      <RecentSessions
        data={sessionsResponseFixture({
          items: [sessionListItemFixture({ sessionName: null, firstUserMessage: null })],
        })}
        range={range}
      />,
    )
    expect(screen.getByText(SESSION_IDS.main)).toBeInTheDocument()
  })

  it('renders loading, empty and error states', async () => {
    const onRetry = vi.fn()
    const loading = renderWithProviders(<RecentSessions range={range} isLoading />)
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    loading.unmount()

    const empty = renderWithProviders(
      <RecentSessions data={sessionsResponseFixture({ items: [], total: 0 })} range={range} />,
    )
    expect(screen.getByText('No sessions yet')).toBeInTheDocument()
    empty.unmount()

    const { user } = renderWithProviders(
      <RecentSessions
        range={range}
        isError
        errorMessage="Sessions query failed"
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load recent sessions')
    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('renders a status-neutral dash when a row has no model', () => {
    renderWithProviders(
      <RecentSessions
        data={sessionsResponseFixture({ items: [sessionListItemFixture({ models: [] })] })}
        range={range}
      />,
    )
    const row = screen.getByRole('row', { name: /Refactor parser pipeline/ })
    expect(within(row).getByText('—')).toBeInTheDocument()
  })
})
