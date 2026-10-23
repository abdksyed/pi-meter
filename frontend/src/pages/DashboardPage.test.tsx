import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'

import { jsonResponse, mockApi, renderAppRoutes, renderWithProviders } from '../test/helpers'
import {
  FIXTURE_NOW,
  filtersFixture,
  healthFixture,
  modelBreakdownFixture,
  projectBreakdownFixture,
  sessionsResponseFixture,
  summaryFixture,
  timeseriesFixture,
} from '../test/fixtures'
import { DashboardPage } from './DashboardPage'

function dashboardApi(overrides: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/health': healthFixture(),
    'GET /api/summary': summaryFixture(),
    'GET /api/usage/timeseries': timeseriesFixture(),
    'GET /api/usage/by-model': modelBreakdownFixture(),
    'GET /api/usage/by-project': projectBreakdownFixture(),
    'GET /api/sessions': sessionsResponseFixture(),
    'GET /api/filters': filtersFixture(),
    ...overrides,
  })
}

describe('DashboardPage', () => {
  it('renders populated panels from mocked API data', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    dashboardApi()

    renderWithProviders(<DashboardPage />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Usage overview' })).toBeInTheDocument()
    // Health directory is surfaced in the page meta.
    expect(screen.getByText('/tmp/pi-meter-tests/sessions')).toBeInTheDocument()

    expect(await screen.findByText('Total cost · Last 7 days')).toBeInTheDocument()
    // 0.019409 renders as $0.0194 in the hero and the metric strip.
    expect(screen.getAllByText('$0.0194').length).toBeGreaterThan(0)
    expect(screen.getByText('10,725 tokens')).toBeInTheDocument()

    expect(screen.getByRole('heading', { name: 'Cost composition' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Daily cost' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cost by model' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cost by project' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent sessions' })).toBeInTheDocument()

    const recent = screen.getByRole('link', { name: /Refactor parser pipeline/ })
    expect(recent).toHaveAttribute('href', '/sessions/11111111-1111-4111-8111-111111111111')

    // Every panel shares the same requested 7d range.
    expect(screen.getAllByText('claude-sonnet-4-5').length).toBeGreaterThan(0)
    expect(screen.getAllByText('alpha').length).toBeGreaterThan(0)
  })

  it('shows panel-level errors while other panels keep working', async () => {
    dashboardApi({ 'GET /api/summary': () => jsonResponse({ detail: 'summary down' }, 500) })

    renderWithProviders(<DashboardPage />)

    const alerts = await screen.findAllByRole('alert')
    expect(alerts.length).toBeGreaterThan(0)
    // Hero, cost composition and metric strip all surface the same failure.
    expect(screen.getAllByText('Could not load the summary').length).toBeGreaterThan(0)
    // Panels with their own data still render.
    expect(screen.getByRole('heading', { name: 'Cost by model' })).toBeInTheDocument()
    expect(
      await screen.findByRole('link', { name: /Refactor parser pipeline/ }),
    ).toBeInTheDocument()
  })

  it('shows the global empty state when no sessions are indexed', async () => {
    dashboardApi({ 'GET /api/summary': summaryFixture({ sessionCount: 0, costTotal: 0 }) })

    renderWithProviders(<DashboardPage />)

    expect(await screen.findByText('No Pi sessions found yet')).toBeInTheDocument()
    expect(screen.getByText('No sessions indexed')).toBeInTheDocument()
    // The action's visible label is "Refresh index" but the accessible name is
    // the generic aria-label, so it collides with the header refresh button
    // (known gap D3). Assert it inside the empty state instead.
    const empty = screen.getByText('No Pi sessions found yet').closest('.pm-empty') as HTMLElement
    expect(within(empty).getByRole('button', { name: 'Refresh session index' })).toBeInTheDocument()
    // The empty state replaces the whole panel grid.
    expect(screen.queryByRole('heading', { name: 'Cost by model' })).not.toBeInTheDocument()
  })

  it('keeps panels visible when a project/model filter yields no sessions', async () => {
    dashboardApi({
      'GET /api/summary': summaryFixture({ sessionCount: 0, costTotal: 0 }),
    })

    renderWithProviders(<DashboardPage />, { route: '/?cwd=%2Fwork%2Falpha' })

    // A filter is active, so this is a filtered empty result, not a global empty index.
    expect(await screen.findByRole('heading', { name: 'Cost composition' })).toBeInTheDocument()
    expect(screen.queryByText('No Pi sessions found yet')).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Active filters' })).toBeInTheDocument()
  })

  it('changes the range from the header control and refetches every panel', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = dashboardApi()

    const { user, router } = renderAppRoutes(
      [{ path: '/', element: <DashboardPage /> }],
      { route: '/' },
    )

    await screen.findByText('Total cost · Last 7 days')
    expect(screen.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')

    await user.click(screen.getByRole('button', { name: '30 days' }))

    await waitFor(() => expect(router.state.location.search).toContain('range=30d'))
    expect(await screen.findByText('Total cost · Last 30 days')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '30 days' })).toHaveAttribute('aria-pressed', 'true')

    await waitFor(() => {
      const summaryCalls = api.calls.filter((request) =>
        new URL(request.url).pathname.endsWith('/api/summary'),
      )
      expect(summaryCalls.length).toBeGreaterThan(1)
      expect(summaryCalls.at(-1)?.url).toContain('range=30d')
    })
  })

  it('applies a custom range through the dialog', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    dashboardApi()

    const { user, router } = renderAppRoutes([{ path: '/', element: <DashboardPage /> }], {
      route: '/',
    })
    await screen.findByText('Total cost · Last 7 days')

    await user.click(screen.getByRole('button', { name: 'Custom' }))
    const from = screen.getByLabelText('From')
    const to = screen.getByLabelText('To')
    await user.clear(from)
    await user.type(from, '2026-01-10')
    await user.clear(to)
    await user.type(to, '2026-01-15')
    await user.click(screen.getByRole('button', { name: 'Apply' }))

    await waitFor(() => expect(router.state.location.search).toContain('range=custom'))
    expect(router.state.location.search).toContain('from=2026-01-10')
    expect(router.state.location.search).toContain('to=2026-01-15')
    expect(await screen.findByText(/Total cost · Jan 10/)).toBeInTheDocument()
  })

  it('switches the chart metric from cost to tokens', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = dashboardApi()

    const { user } = renderAppRoutes([{ path: '/', element: <DashboardPage /> }], { route: '/' })
    await screen.findByRole('heading', { name: 'Daily cost' })

    await user.click(screen.getByRole('button', { name: 'Tokens' }))
    expect(await screen.findByRole('heading', { name: 'Daily tokens' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Visible token series' })).toBeInTheDocument()
    api.expectCalled('GET /api/usage/timeseries')
  })

  it('removes an active project chip and requests the unfiltered summary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    const api = dashboardApi()

    const { user, router } = renderAppRoutes([{ path: '/', element: <DashboardPage /> }], {
      route: '/?cwd=%2Fwork%2Falpha',
    })

    expect(await screen.findByRole('group', { name: 'Active filters' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove Project filter' }))

    await waitFor(() => expect(router.state.location.search).not.toContain('cwd='))
    await waitFor(() => {
      const summaryCalls = api.calls.filter((request) =>
        new URL(request.url).pathname.endsWith('/api/summary'),
      )
      expect(summaryCalls.at(-1)?.url).not.toContain('cwd=')
    })
  })

  // Requirement (test_plan.md): "Dashboard loading, failure, empty, populated, and
  // custom-range states." Known defect D7: the six dashboard requests have no
  // shared error gate, so a total failure leaves an empty shell of stacked panel
  // alerts with no page-level message or retry. This asserts a page-level alert.
  it('offers one page-level error with a retry when every panel fails (known defect D7)', async () => {
    const fail = () => jsonResponse({ detail: 'backend offline' }, 500)
    mockApi({
      'GET /api/health': fail,
      'GET /api/summary': fail,
      'GET /api/usage/timeseries': fail,
      'GET /api/usage/by-model': fail,
      'GET /api/usage/by-project': fail,
      'GET /api/sessions': fail,
      'GET /api/filters': fail,
    })

    renderWithProviders(<DashboardPage />)

    expect(await screen.findAllByRole('alert')).toHaveLength(1)
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument()
  })

  it('shows a loading skeleton before the summary resolves', async () => {
    let resolveSummary!: (response: Response) => void
    mockApi({
      'GET /api/health': healthFixture(),
      'GET /api/summary': () =>
        new Promise<Response>((resolve) => {
          resolveSummary = resolve
        }),
      'GET /api/usage/timeseries': timeseriesFixture(),
      'GET /api/usage/by-model': modelBreakdownFixture(),
      'GET /api/usage/by-project': projectBreakdownFixture(),
      'GET /api/sessions': sessionsResponseFixture(),
      'GET /api/filters': filtersFixture(),
    })

    renderWithProviders(<DashboardPage />)
    expect(screen.getByRole('heading', { level: 1, name: 'Usage overview' })).toBeInTheDocument()
    expect(document.querySelector('section[aria-label="Total cost"]')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    // Cost composition also renders its skeleton, not a fake zero.
    expect(screen.getByRole('heading', { name: 'Cost composition' })).toBeInTheDocument()
    expect(screen.queryByText('No cost recorded')).not.toBeInTheDocument()

    resolveSummary(jsonResponse(summaryFixture()))
    expect(await screen.findByText('Total cost · Last 7 days')).toBeInTheDocument()
  })

  it('surfaces all failures when health and summary are unreachable', async () => {
    mockApi({
      'GET /api/health': () => jsonResponse({ detail: 'health down' }, 500),
      'GET /api/summary': () => jsonResponse({ detail: 'summary down' }, 500),
      'GET /api/usage/timeseries': timeseriesFixture(),
      'GET /api/usage/by-model': modelBreakdownFixture(),
      'GET /api/usage/by-project': projectBreakdownFixture(),
      'GET /api/sessions': sessionsResponseFixture(),
      'GET /api/filters': filtersFixture(),
    })

    renderWithProviders(<DashboardPage />)
    expect(await screen.findByText('Could not load the summary')).toBeInTheDocument()
    // The header falls back to the local index description.
    expect(screen.getByText('Local Pi session index')).toBeInTheDocument()
  })
})

describe('Dashboard interactions with real route table', () => {
  it('renders within the page wrapper and keeps controls accessible', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.setSystemTime(new Date(FIXTURE_NOW))
    dashboardApi()

    const { container } = renderWithProviders(<DashboardPage />)
    await screen.findByText('Total cost · Last 7 days')

    const header = container.querySelector('.pm-page-header') as HTMLElement
    expect(within(header).getByRole('button', { name: 'Custom' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Refresh session index' })).toBeInTheDocument()
    expect(container.firstElementChild).not.toBeNull()
  })
})
