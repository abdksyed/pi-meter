import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import userEvent from '@testing-library/user-event'

import { router } from '../app/router'
import { createTestQueryClient, mockApi } from '../test/helpers'
import { healthFixture } from '../test/fixtures'

/** Render the production route table so the real `*` and `/settings` entries run. */
function renderProductionRoute(route: string) {
  vi.stubGlobal('fetch', undefined)
  const api = mockApi({ 'GET /api/health': healthFixture() })
  const memoryRouter = createMemoryRouter(router.routes, { initialEntries: [route] })
  const utils = render(
    <QueryClientProvider client={createTestQueryClient()}>
      <RouterProvider router={memoryRouter} />
    </QueryClientProvider>,
  )
  return { ...utils, api, user: userEvent.setup(), memoryRouter }
}

describe('unknown routes', () => {
  it('renders the not-found page inside the app shell', async () => {
    renderProductionRoute('/does-not-exist')

    expect(await screen.findByText('Page not found')).toBeInTheDocument()
    expect(screen.getByText('That route does not exist in Pi Meter.')).toBeInTheDocument()
    // Still framed by the shell navigation and status bar.
    expect(screen.getAllByRole('navigation', { name: 'Primary' }).length).toBeGreaterThan(0)
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('contentinfo', { name: 'Local index status' })).toBeInTheDocument()
  })

  it('serves the settings route from the production router', async () => {
    renderProductionRoute('/settings')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument()
  })

  it('keeps the sidebar links correct from the not-found page and navigates home', async () => {
    const { user, memoryRouter } = renderProductionRoute('/nope')
    await screen.findByText('Page not found')

    const rail = document.querySelector('.pm-rail') as HTMLElement
    expect(within(rail).getByRole('link', { name: 'Sessions' })).toHaveAttribute(
      'href',
      '/sessions',
    )
    expect(within(rail).getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/')
    expect(within(rail).getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings',
    )

    await user.click(within(rail).getByRole('link', { name: 'Settings' }))
    expect(memoryRouter.state.location.pathname).toBe('/settings')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeInTheDocument()
  })

  it('renders the shell skip link and mobile navigation on unknown routes', async () => {
    renderProductionRoute('/still-unknown')
    await screen.findByText('Page not found')
    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    )
    expect(document.querySelector('.pm-mobilebar')).not.toBeNull()
  })
})
