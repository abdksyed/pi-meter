import { describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'

import { jsonResponse, mockApi, renderAppRoutes, renderWithProviders } from '../test/helpers'
import { healthFixture } from '../test/fixtures'
import { AppShell } from './AppShell'
import { SidebarNav } from './SidebarNav'
import { MobileNavBar } from './MobileNavBar'
import { StatusBar } from './StatusBar'
import { SyncStatus } from './SyncStatus'
import { RefreshButton } from './RefreshButton'
import { EmptyState } from './EmptyState'
import { ErrorState } from './ErrorState'
import { Panel } from './Panel'
import { PanelState } from './PanelState'

describe('SidebarNav', () => {
  it('renders primary links and marks the active route', () => {
    mockApi({ 'GET /api/health': healthFixture() })
    renderAppRoutes(
      [
        { path: '/', element: <SidebarNav /> },
        { path: '/sessions', element: <SidebarNav /> },
      ],
      { route: '/sessions' },
    )

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = screen.getAllByRole('link', { name: /Overview|Sessions|Settings/ })
    expect(links.map((link) => link.textContent)).toEqual(['Overview', 'Sessions', 'Settings'])
    expect(nav).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sessions' })).toHaveClass('is-active')
    expect(screen.getByRole('link', { name: 'Overview' })).not.toHaveClass('is-active')
    expect(screen.getByRole('link', { name: 'Pi Meter overview' })).toHaveAttribute('href', '/')
    expect(screen.getByText('v0.1.0 · local index')).toBeInTheDocument()
  })
})

describe('MobileNavBar', () => {
  it('renders the compact nav with the same destinations', () => {
    mockApi({ 'GET /api/health': healthFixture() })
    renderWithProviders(<MobileNavBar />)

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute('href', '/')
  })
})

describe('AppShell', () => {
  it('renders the skip link, rail, main landmark and status bar', () => {
    mockApi({ 'GET /api/health': healthFixture() })
    renderAppRoutes([
      {
        path: '/',
        element: <AppShell />,
        children: [{ index: true, element: <p>dashboard body</p> }],
      },
    ])

    expect(screen.getByRole('link', { name: 'Skip to main content' })).toHaveAttribute(
      'href',
      '#main',
    )
    const main = screen.getByRole('main')
    expect(main).toHaveAttribute('id', 'main')
    expect(screen.getByText('dashboard body')).toBeInTheDocument()
    expect(screen.getByRole('contentinfo', { name: 'Local index status' })).toBeInTheDocument()
  })
})

describe('StatusBar', () => {
  it('reports a healthy local database and the bound endpoint', async () => {
    mockApi({ 'GET /api/health': healthFixture() })
    renderWithProviders(<StatusBar />)

    expect(await screen.findByText('SQLite synced')).toBeInTheDocument()
    expect(screen.getByText('Local')).toBeInTheDocument()
    // Known gap: the UI hardcodes port 8743 while the backend default is 8787.
    expect(screen.getByText('127.0.0.1:8743')).toBeInTheDocument()
  })

  // Requirement (test_plan.md, deployment): the status display and the Vite
  // proxy hardcode 8743 while `app/config.py` defaults to 8787. This is known
  // defect D6: the UI advertises an endpoint the backend does not bind by
  // default. The expected source of truth must be decided before the fix.
  it('advertises the backend default port (known defect D6)', async () => {
    mockApi({ 'GET /api/health': healthFixture() })
    renderWithProviders(<StatusBar />)

    expect(await screen.findByText('SQLite synced')).toBeInTheDocument()
    expect(screen.getByText('127.0.0.1:8787')).toBeInTheDocument()
  })

  it('reports an unavailable server when health fails', async () => {
    mockApi({ 'GET /api/health': () => jsonResponse({ detail: 'boom' }, 500) })
    renderWithProviders(<StatusBar />)

    expect(await screen.findByText('Server unavailable')).toBeInTheDocument()
    expect(screen.getByText('Database unavailable')).toBeInTheDocument()
  })

  it('reports a database error without a transport failure', async () => {
    mockApi({ 'GET /api/health': healthFixture({ database: 'error' }) })
    renderWithProviders(<StatusBar />)

    expect(await screen.findByText('Database error')).toBeInTheDocument()
    expect(screen.getByText('Local')).toBeInTheDocument()
  })
})

describe('SyncStatus', () => {
  it('renders the relative last refresh time', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-15T09:00:00.000Z'))
    mockApi({ 'GET /api/health': healthFixture({ lastRefreshAt: '2026-01-15T08:59:00.000Z' }) })
    renderWithProviders(<SyncStatus />)

    await vi.waitFor(() => expect(screen.getByText('Synced 1m ago')).toBeInTheDocument())
    expect(screen.getByText('Synced 1m ago').closest('span.pm-sync')).toHaveAttribute(
      'title',
      expect.stringContaining('2026'),
    )
  })

  it('falls back to "Not synced yet" and surfaces sync failures', async () => {
    mockApi({ 'GET /api/health': healthFixture({ lastRefreshAt: null }) })
    const { unmount } = renderWithProviders(<SyncStatus />)
    expect(await screen.findByText('Not synced yet')).toBeInTheDocument()
    unmount()

    mockApi({ 'GET /api/health': () => jsonResponse({ detail: 'fail' }, 503) })
    renderWithProviders(<SyncStatus />)
    expect(await screen.findByText('Sync unavailable')).toBeInTheDocument()
  })
})

describe('RefreshButton', () => {
  it('runs a refresh and reports the sync summary', async () => {
    const api = mockApi({
      'POST /api/refresh': {
        filesSeen: 5,
        filesAdded: 2,
        filesUpdated: 3,
        filesRemoved: 0,
        filesFailed: 0,
        durationMs: 1234,
      },
      'GET /api/health': healthFixture(),
    })
    const { user } = renderWithProviders(<RefreshButton />)

    const button = screen.getByRole('button', { name: 'Refresh session index' })
    expect(button).toHaveAccessibleName('Refresh session index')
    await user.click(button)

    expect(await screen.findByText('3 updated · 2 added · 1234 ms')).toBeInTheDocument()
    api.expectCalled('POST /api/refresh')
    expect(screen.getByRole('status')).toHaveTextContent('3 updated')
  })

  // Requirement (WCAG 2.5.3 "Label in name"): the accessible name must contain
  // the visible label. Known defect D3: `EmptyState` passes label="Refresh index"
  // but `RefreshButton` hardcodes aria-label="Refresh session index", so the
  // visible words are not part of the accessible name.
  it('keeps the visible label inside the accessible name (known defect D3)', () => {
    mockApi({ 'POST /api/refresh': { filesSeen: 0, filesAdded: 0, filesUpdated: 0, filesRemoved: 0, filesFailed: 0, durationMs: 1 } })
    renderWithProviders(<RefreshButton label="Refresh index" />)
    expect(screen.getByRole('button', { name: 'Refresh index' })).toBeInTheDocument()
  })

  it('adds removed and failed counts to the status message', async () => {
    mockApi({
      'POST /api/refresh': {
        filesSeen: 5,
        filesAdded: 0,
        filesUpdated: 1,
        filesRemoved: 4,
        filesFailed: 2,
        durationMs: 10,
      },
    })
    const { user } = renderWithProviders(<RefreshButton />)
    await user.click(screen.getByRole('button', { name: 'Refresh session index' }))
    expect(
      await screen.findByText('1 updated · 0 added · 4 removed · 10 ms · 2 failed'),
    ).toBeInTheDocument()
  })

  it('surfaces a 409 conflict and a generic failure as status messages', async () => {
    mockApi({ 'POST /api/refresh': () => jsonResponse({ detail: 'Refresh in progress' }, 409) })
    const conflict = renderWithProviders(<RefreshButton />)
    await conflict.user.click(screen.getByRole('button', { name: 'Refresh session index' }))
    expect(await screen.findByText('Refresh already in progress')).toBeInTheDocument()
    conflict.unmount()

    mockApi({ 'POST /api/refresh': () => jsonResponse({ detail: 'Disk on fire' }, 500) })
    const failed = renderWithProviders(<RefreshButton />)
    await failed.user.click(screen.getByRole('button', { name: 'Refresh session index' }))
    expect(await screen.findByText('Disk on fire')).toBeInTheDocument()
  })

  it('disables the button and labels it as busy while the refresh is pending', async () => {
    let release!: (response: Response) => void
    mockApi({
      'POST /api/refresh': () =>
        new Promise<Response>((resolve) => {
          release = resolve
        }),
    })
    const { user } = renderWithProviders(<RefreshButton />)

    await user.click(screen.getByRole('button', { name: 'Refresh session index' }))
    const busy = await screen.findByRole('button', { name: 'Refreshing session index' })
    expect(busy).toBeDisabled()
    expect(busy).toHaveAttribute('aria-busy', 'true')

    release(
      jsonResponse({
        filesSeen: 1,
        filesAdded: 1,
        filesUpdated: 0,
        filesRemoved: 0,
        filesFailed: 0,
        durationMs: 5,
      }),
    )
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Refresh session index' })).toBeEnabled(),
    )
  })
})

describe('state primitives', () => {
  it('EmptyState renders eyebrow, title, body and action', () => {
    renderWithProviders(
      <EmptyState
        eyebrow="No sessions"
        title="Nothing indexed"
        description="Add session files."
        action={<button type="button">Refresh</button>}
      />,
    )
    expect(screen.getByText('No sessions')).toBeInTheDocument()
    expect(screen.getByText('Nothing indexed')).toBeInTheDocument()
    expect(screen.getByText('Add session files.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument()
  })

  it('ErrorState is an alert with optional retry', async () => {
    const onRetry = vi.fn()
    const { user } = renderWithProviders(
      <ErrorState title="Boom" message="Details" onRetry={onRetry} retryLabel="Try again" />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Boom')
    expect(screen.getByRole('alert')).toHaveTextContent('Details')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('Panel renders heading, meta, actions, body and footer', () => {
    renderWithProviders(
      <Panel title="Panel title" eyebrow="Eyebrow" meta="meta" actions={<button>Act</button>} footer="footer">
        body content
      </Panel>,
    )
    expect(screen.getByRole('heading', { name: 'Panel title' })).toBeInTheDocument()
    expect(screen.getByText('Eyebrow')).toBeInTheDocument()
    expect(screen.getByText('meta')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument()
    expect(screen.getByText('body content')).toBeInTheDocument()
    expect(screen.getByText('footer')).toBeInTheDocument()
  })

  it('PanelState picks exactly one branch', () => {
    const { unmount } = renderWithProviders(
      <PanelState status="loading" skeleton={<p>skeleton</p>} empty={<p>empty</p>} error={<p>error</p>}>
        <p>ready</p>
      </PanelState>,
    )
    expect(screen.getByText('skeleton')).toBeInTheDocument()
    expect(screen.queryByText('ready')).not.toBeInTheDocument()
    unmount()

    const error = renderWithProviders(
      <PanelState status="error" skeleton={<p>skeleton</p>} empty={<p>empty</p>} error={<p>error</p>}>
        <p>ready</p>
      </PanelState>,
    )
    expect(screen.getByText('error')).toBeInTheDocument()
    error.unmount()

    const empty = renderWithProviders(
      <PanelState status="empty" skeleton={<p>skeleton</p>} empty={<p>empty</p>} error={<p>error</p>}>
        <p>ready</p>
      </PanelState>,
    )
    expect(screen.getByText('empty')).toBeInTheDocument()
    empty.unmount()

    renderWithProviders(
      <PanelState status="ready" skeleton={<p>skeleton</p>} empty={<p>empty</p>} error={<p>error</p>}>
        <p>ready</p>
      </PanelState>,
    )
    expect(screen.getByText('ready')).toBeInTheDocument()
  })
})
