import { describe, expect, it, vi, afterEach } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { jsonResponse, mockApi, renderAppRoutes } from '../test/helpers'
import {
  FIXTURE_NOW,
  SESSION_IDS,
  filtersFixture,
  healthFixture,
  projectBreakdownFixture,
  sessionListItemFixture,
  sessionsResponseFixture,
  summaryFixture,
} from '../test/fixtures'
import { SessionsPage } from './SessionsPage'

function sessionsApi(overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/health': healthFixture(),
    'GET /api/filters': filtersFixture(),
    'GET /api/summary': summaryFixture(),
    'GET /api/usage/by-project': projectBreakdownFixture(),
    'GET /api/sessions': sessionsResponseFixture(),
    ...overrides,
  })
}

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

/** Force `useMediaQuery('(max-width: 899px)')` to report a mobile viewport. */
function setViewport(mobile: boolean) {
  window.matchMedia = vi.fn((query: string) => ({
    matches: mobile,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia
}

describe('SessionsPage', () => {
  it('renders the desktop table with summary totals and pagination', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi()

    renderWithProviders()

    expect(await screen.findByRole('heading', { level: 1, name: 'Sessions' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: /Sessions/ })).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: /Refactor parser pipeline/ }),
    ).toHaveAttribute('href', `/sessions/${SESSION_IDS.main}`)

    expect(screen.getByRole('complementary', { name: 'Sessions summary' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Sessions pagination' })).toBeInTheDocument()
    expect(screen.getByText('1–1 of 1')).toBeInTheDocument()
    // Count badge comes from the response total.
    expect(screen.getByText('1 sessions')).toBeInTheDocument()
  })

  it('renders responsive cards instead of a table at mobile widths', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    setViewport(true)
    sessionsApi()

    renderWithProviders()

    expect(await screen.findByRole('link', { name: /Refactor parser pipeline/ })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    // The fixture activity time is after the fixed clock, so the row is "active".
    expect(
      screen.getByRole('img', { name: 'Active in the last 15 minutes' }),
    ).toBeInTheDocument()
  })

  it('debounces search input and requests the trimmed query', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = sessionsApi()

    const { user, router } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions',
    })
    await screen.findByRole('searchbox', { name: 'Filter sessions' })

    await user.type(screen.getByRole('searchbox', { name: 'Filter sessions' }), 'beta')

    // Pre-debounce: the URL has not changed yet.
    expect(router.state.location.search).not.toContain('q=beta')

    await waitFor(() => expect(router.state.location.search).toContain('q=beta'), {
      timeout: 3000,
    })
    await waitFor(() => {
      const sessionCalls = api.calls.filter((request) =>
        new URL(request.url).pathname.endsWith('/api/sessions'),
      )
      expect(sessionCalls.at(-1)?.url).toContain('q=beta')
    })
    // Search also resets pagination.
    expect(router.state.location.search).not.toContain('page=')
  })

  it('filters by project and model selects and shows removable chips', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = sessionsApi()

    const { user, router } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions',
    })
    await screen.findByRole('combobox', { name: 'Project' })

    await user.selectOptions(screen.getByRole('combobox', { name: 'Project' }), '/work/beta')
    await waitFor(() => expect(router.state.location.search).toContain('cwd=%2Fwork%2Fbeta'))
    await waitFor(() =>
      expect(
        api.calls.filter((request) => request.url.includes('/api/sessions?')).at(-1)?.url,
      ).toContain('cwd=%2Fwork%2Fbeta'),
    )

    expect(await screen.findByRole('group', { name: 'Active filters' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Project filter' }))
    await waitFor(() => expect(router.state.location.search).not.toContain('cwd='))
  })

  it('advances pagination and changes the page size', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = sessionsApi({
      'GET /api/sessions': (request: Request) => {
        const page = Number(new URL(request.url).searchParams.get('page') ?? 1)
        return jsonResponse(
          sessionsResponseFixture({
            page,
            total: 60,
            totalPages: 3,
            pageSize: 25,
          }),
        )
      },
    })

    const { user, router } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions',
    })
    await screen.findByText('1 / 3')

    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(router.state.location.search).toContain('page=2'))
    expect(await screen.findByText('2 / 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await waitFor(() => expect(router.state.location.search).not.toContain('page=2'))

    await user.selectOptions(screen.getByRole('combobox', { name: /Per page/i }), '50')
    await waitFor(() =>
      expect(
        api.calls.filter((request) => request.url.includes('/api/sessions?')).at(-1)?.url,
      ).toContain('pageSize=50'),
    )
  })

  it('sorts the table and reflects aria-sort state', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi()

    const { user, router } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions',
    })
    await screen.findByRole('columnheader', { name: /Cost/ })

    // First click sorts descending; clicking the active column flips to ascending.
    await user.click(screen.getByRole('button', { name: /Cost/ }))
    await waitFor(() => expect(router.state.location.search).toContain('sort=cost'))
    expect(screen.getByRole('columnheader', { name: /Cost/ })).toHaveAttribute(
      'aria-sort',
      'descending',
    )
    await user.click(screen.getByRole('button', { name: /Cost/ }))
    await waitFor(() => expect(router.state.location.search).toContain('dir=asc'))
    expect(screen.getByRole('columnheader', { name: /Cost/ })).toHaveAttribute(
      'aria-sort',
      'ascending',
    )
  })

  it('renders loading placeholders before sessions resolve', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    mockApi({
      'GET /api/health': healthFixture(),
      'GET /api/filters': filtersFixture(),
      'GET /api/summary': summaryFixture(),
      'GET /api/usage/by-project': projectBreakdownFixture(),
      'GET /api/sessions': () =>
        new Promise<Response>(() => {
          // Never resolves: keeps the loading branch mounted.
        }),
    })

    renderWithProviders()

    expect(await screen.findByRole('heading', { level: 1, name: 'Sessions' })).toBeInTheDocument()
    // Skeleton placeholders replace both the table and the empty states.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
    expect(screen.queryByText('No Pi sessions found yet')).not.toBeInTheDocument()
    expect(screen.getByRole('complementary', { name: 'Sessions summary' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Sessions pagination' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('shows an empty index state without the table', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi({
      'GET /api/filters': filtersFixture({ sessionCount: 0 }),
      'GET /api/sessions': sessionsResponseFixture({ items: [], total: 0, totalPages: 0 }),
    })

    renderWithProviders()

    expect(await screen.findByText('No Pi sessions found yet')).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('shows a filtered empty result with a clear-filters action', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi({
      'GET /api/sessions': sessionsResponseFixture({ items: [], total: 0, totalPages: 0 }),
    })

    renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions?q=nomatch',
    })

    expect(await screen.findByText('No sessions match these filters')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Clear filters' })).toBeInTheDocument()
  })

  // Requirement: clearing a filter must reset the URL and the request. This is
  // known defect D4: the debounced search effect writes the stale query back,
  // so `?q=` survives "Remove Search filter", "Clear all" and "Clear filters".
  it('clears the search filter from the URL (known defect D4)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi()

    const { user, router } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions?q=beta',
    })
    await screen.findByRole('group', { name: 'Active filters' })

    await user.click(screen.getByRole('button', { name: 'Remove Search filter' }))
    // Give the 250 ms debounce several chances to settle.
    await new Promise((resolve) => setTimeout(resolve, 600))
    await waitFor(() => expect(router.state.location.search).not.toContain('q='), {
      timeout: 2000,
    })
  })

  it('clears a search filter through Clear all (known defect D4)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi()

    const { user, router } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions?q=beta',
    })
    await screen.findByRole('group', { name: 'Active filters' })

    await user.click(screen.getByRole('button', { name: 'Clear all' }))
    await new Promise((resolve) => setTimeout(resolve, 600))
    await waitFor(() => expect(router.state.location.search).not.toContain('q='), {
      timeout: 2000,
    })
  })

  it('renders a sessions error with a working retry', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    let attempts = 0
    const api = sessionsApi({
      'GET /api/sessions': () => {
        attempts += 1
        if (attempts === 1) return jsonResponse({ detail: 'sessions offline' }, 500)
        return sessionsResponseFixture()
      },
    })

    const { user } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions',
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load sessions')
    expect(screen.getByRole('alert')).toHaveTextContent('sessions offline')

    await user.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('link', { name: /Refactor parser pipeline/ })).toBeInTheDocument()
    api.expectCalled('GET /api/sessions')
  })

  it('clamps an out-of-range page to the last available page', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi({
      'GET /api/sessions': sessionsResponseFixture({ page: 1, total: 5, totalPages: 1 }),
    })

    const { router } = renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
      route: '/sessions?page=9',
    })

    await screen.findByRole('table')
    await waitFor(() => expect(router.state.location.search).not.toContain('page=9'))
  })

  it('navigates to a session detail route from a table row', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi({
      'GET /api/sessions': sessionsResponseFixture({
        items: [
          sessionListItemFixture(),
          sessionListItemFixture({ sessionId: SESSION_IDS.beta, sessionName: 'Beta session' }),
        ],
        total: 2,
      }),
    })

    const { user, router } = renderAppRoutes(
      [
        { path: '/sessions', element: <SessionsPage /> },
        {
          path: '/sessions/:sessionId',
          element: <p>detail page</p>,
        },
      ],
      { route: '/sessions' },
    )

    await screen.findByRole('table')
    await user.click(screen.getByRole('link', { name: /Beta session/ }))

    expect(await screen.findByText('detail page')).toBeInTheDocument()
    expect(router.state.location.pathname).toBe(`/sessions/${SESSION_IDS.beta}`)
  })

  it('keeps header refresh and status controls available', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    sessionsApi()

    const { container } = renderWithProviders()
    await screen.findByRole('table')
    const header = container.querySelector('.pm-page-header') as HTMLElement
    expect(within(header).getByRole('button', { name: 'Refresh session index' })).toBeInTheDocument()
    expect(within(header).getByText('/tmp/pi-meter-tests/sessions')).toBeInTheDocument()
  })
})

function renderWithProviders() {
  return renderAppRoutes([{ path: '/sessions', element: <SessionsPage /> }], {
    route: '/sessions',
  })
}
