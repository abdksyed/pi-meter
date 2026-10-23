/**
 * Dashboard browser regressions.
 *
 * Runs against the isolated app server and the synthetic corpus (fixed dates
 * in January 2026), so every spec first selects the all-time range instead of
 * relying on the default 7-day window.
 */

import { expect, test } from '@playwright/test'
import { CORPUS, openAllTimeDashboard } from './support'

test.describe('dashboard', () => {
  test('renders corpus totals, metric strip, breakdowns and recent sessions', async ({ page }) => {
    await openAllTimeDashboard(page)

    const hero = page.locator('section[aria-labelledby="summary-hero-title"]')
    await expect(hero).toContainText('Total cost')
    await expect(hero).toContainText(CORPUS.totalCostLabel)
    await expect(hero).toContainText(CORPUS.totalTokensLabel)
    await expect(hero).toContainText(`· ${CORPUS.indexedSessions} sessions`)

    const metrics = page.getByLabel('Usage metrics')
    await expect(metrics).toContainText('Sessions')
    await expect(metrics).toContainText('14')
    await expect(metrics).toContainText('55 user messages')
    await expect(metrics).toContainText('Assistant responses')
    await expect(metrics).toContainText('57')
    await expect(metrics).toContainText('3 tool calls')
    await expect(metrics).toContainText('13.8K')
    await expect(metrics).toContainText('$0.0130')

    // Cost composition uses the corpus' independently computed components.
    const composition = page.locator('.pm-panel', { hasText: 'Cost composition' })
    await expect(composition).toContainText('$0.1684')
    await expect(composition).toContainText('$0.002370')

    const models = page.locator('.pm-panel', { hasText: 'Cost by model' })
    await expect(models).toContainText('claude-sonnet-4-5')
    await expect(models).toContainText('$0.1766')
    await expect(models).toContainText('gpt-5.1')
    await expect(models).toContainText('$0.004939')

    const projects = page.locator('.pm-panel', { hasText: 'Cost by project' })
    await expect(projects).toContainText('alpha')
    await expect(projects).toContainText('$0.1801')
    await expect(projects).toContainText('/work/beta')

    const recent = page.locator('section', { hasText: 'Recent sessions' })
    await expect(recent).toContainText('6 of 14')
    const recentRows = recent.locator('tbody tr')
    await expect(recentRows).toHaveCount(6)
    await expect(recentRows.first()).toContainText('Check usage around midnight.')
    await expect(recentRows.first()).toContainText('$0.001000')
    await expect(page.getByRole('link', { name: /View all sessions/ })).toHaveAttribute(
      'href',
      '/sessions?range=all',
    )
  })

  test('chart renders with real geometry and toggles between cost and token views', async ({
    page,
  }) => {
    await openAllTimeDashboard(page)

    const chart = page.locator('.pm-panel', { hasText: 'Weekly cost' })
    const surface = chart.locator('svg.recharts-surface')
    await expect(surface).toBeVisible()
    const box = await surface.boundingBox()
    expect(box, 'recharts surface geometry').not.toBeNull()
    expect(box!.width).toBeGreaterThan(400)
    expect(box!.height).toBeGreaterThan(100)

    // Accessible fallback table stays available and matches the corpus buckets.
    await chart.getByText('View data table').click()
    const table = chart.locator('table.pm-table')
    await expect(table.locator('caption')).toContainText('Weekly cost by week for All time')
    await expect(table.locator('tbody tr')).toHaveCount(41)
    await expect(table.locator('tbody tr').last()).toContainText('$')

    await page.getByRole('button', { name: 'Tokens', exact: true }).click()
    await expect(page).toHaveURL(/chart=tokens/)
    await expect(page.getByRole('button', { name: 'Tokens', exact: true })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    const tokenPanel = page.locator('.pm-panel', { hasText: 'Weekly tokens' })
    await expect(tokenPanel).toBeVisible()
    await expect(tokenPanel.locator('svg.recharts-surface')).toBeVisible()

    const legend = tokenPanel.getByRole('group', { name: 'Visible token series' })
    const inputToggle = legend.getByRole('button', { name: 'Input', exact: true })
    await expect(inputToggle).toHaveAttribute('aria-pressed', 'true')
    await inputToggle.click()
    await expect(inputToggle).toHaveAttribute('aria-pressed', 'false')
    // The SVG still has geometry after hiding a stacked series.
    const tokenBox = await tokenPanel.locator('svg.recharts-surface').boundingBox()
    expect(tokenBox!.width).toBeGreaterThan(400)
  })

  test('changing the range updates the URL, labels and empty state', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Usage overview' })).toBeVisible()

    // Fixture dates are in January 2026, so "today" is legitimately empty.
    await page.getByRole('button', { name: 'Today' }).click()
    await expect(page).toHaveURL(/range=today/)
    await expect(page.getByRole('button', { name: 'Today' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    await expect(page.getByText('No Pi sessions found yet')).toBeVisible()

    await page.getByRole('button', { name: 'All time' }).click()
    await expect(page).toHaveURL(/range=all/)
    await expect(page.getByText('No Pi sessions found yet')).toHaveCount(0)
    await expect(
      page.locator('section[aria-labelledby="summary-hero-title"]'),
    ).toContainText(CORPUS.totalCostLabel)
  })

  test('custom range dialog validates input, applies, and closes with Escape', async ({ page }) => {
    await openAllTimeDashboard(page)
    await page.getByRole('button', { name: 'Custom', exact: true }).click()

    const dialog = page.getByRole('dialog', { name: 'Custom date range' })
    await expect(dialog).toBeVisible()

    await dialog.getByLabel('From').fill('2026-02-01')
    await dialog.getByLabel('To').fill('2026-01-01')
    await expect(dialog.getByRole('alert')).toHaveText(/From must be on or before To/)
    await expect(dialog.getByRole('button', { name: 'Apply' })).toBeDisabled()

    await dialog.getByLabel('From').fill('2026-01-01')
    await dialog.getByLabel('To').fill('2026-01-20')
    await dialog.getByRole('button', { name: 'Apply' }).click()
    await expect(page).toHaveURL(/range=custom/)
    await expect(page).toHaveURL(/from=2026-01-01/)
    await expect(page).toHaveURL(/to=2026-01-20/)
    await expect(
      page.locator('section[aria-labelledby="summary-hero-title"]'),
    ).toContainText(/Total cost · Jan 1 – Jan 20/i)
    await expect(
      page.locator('section[aria-labelledby="summary-hero-title"]'),
    ).toContainText(CORPUS.totalCostLabel)

    // Escape closes without another change.
    await page.getByRole('button', { name: /Jan 1 – Jan 20/ }).click()
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(page).toHaveURL(/from=2026-01-01/)
  })

  test('recent session link opens that session detail page', async ({ page }) => {
    await openAllTimeDashboard(page)
    await page
      .locator('section', { hasText: 'Recent sessions' })
      .locator('tbody tr a')
      .first()
      .click()

    await expect(page).toHaveURL(/\/sessions\/22222222-2222-4222-8222-222222222222/)
    await expect(page.locator('.pm-session-header__title')).toHaveText(
      'Check usage around midnight.',
    )
    await expect(page.locator('.pm-session-header__cwd')).toHaveText('/work/beta')
  })

  test('view-all link keeps the active custom range', async ({ page }) => {
    await page.goto('/?range=custom&from=2026-01-01&to=2026-01-20')
    await expect(page.getByRole('heading', { name: 'Usage overview' })).toBeVisible()
    const link = page.getByRole('link', { name: /View all sessions/ })
    await expect(link).toHaveAttribute(
      'href',
      '/sessions?range=custom&from=2026-01-01&to=2026-01-20',
    )
    await link.click()
    await expect(page).toHaveURL(/\/sessions\?range=custom&from=2026-01-01&to=2026-01-20/)
    await expect(page.locator('tbody tr')).toHaveCount(14)
  })

  test('total dashboard failure currently surfaces per-panel errors (defect D7)', async ({
    page,
  }) => {
    // Pending UX decision (test_plan D7): should a total failure be one
    // page-level error with a single retry, or independent panel errors?
    // This test records the current behaviour so a later fix is visible.
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'boom' }),
      }),
    )
    await page.goto('/?range=all')

    const alerts = page.getByRole('alert')
    await expect(alerts.first()).toBeVisible()
    expect(await alerts.count()).toBeGreaterThan(1)
    await expect(page.getByText('Could not load the summary')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(await alerts.count())

    // Unrelated to D7: breakdown data must never be silently invented.
    await expect(page.locator('.pm-panel', { hasText: 'Recent sessions' })).toContainText(
      'boom',
    )

    // Header also falls back to the generic meta label while health fails.
    await expect(page.locator('.pm-page-header__meta')).toHaveText('Local Pi session index')
  })

  test('exposes a labelled primary navigation and status strip', async ({ page }) => {
    await openAllTimeDashboard(page)
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav.getByRole('link', { name: 'Overview' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Sessions' })).toHaveAttribute('href', '/sessions')
    await expect(nav.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')

    const status = page.getByLabel('Local index status')
    await expect(status).toContainText('Local')
    await expect(status).toContainText('SQLite synced')
  })
})
