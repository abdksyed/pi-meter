/**
 * Isolated deployment / operational browser checks.
 *
 * The Playwright config starts `scripts/serve-test-app.py` on a dedicated
 * loopback port with a throw-away fixture directory. These specs verify that
 * isolation boundary from the browser: SPA deep links, local asset serving,
 * no external requests, and the documented port inconsistency between the
 * status strip (8743) and the backend default (8787).
 */

import { expect, test } from '@playwright/test'
import { CORPUS, openAllTimeDashboard, openSession } from './support'

test.describe('deployment and isolation', () => {
  test('serves the built SPA with corpus data on the test port', async ({ page, request }) => {
    const health = await request.get('/api/health')
    expect(health.ok()).toBeTruthy()
    const body = await health.json()
    expect(body.status).toBe('ok')
    expect(body.databaseOk).toBe(true)
    // Never the developer's real session directory.
    expect(body.sessionsDir).toContain('pi-meter-e2e-')
    expect(body.sessionsDir).not.toContain('.pi/agent/sessions')
    expect(body.lastSync.filesSeen).toBe(CORPUS.filesSeen)
    expect(body.lastSync.filesFailed).toBe(CORPUS.failedFiles)
    expect(body.lastSync.status).toBe('partial')

    await openAllTimeDashboard(page)
    const pageUrl = new URL(page.url())
    expect(pageUrl.port).not.toBe('8787')
    expect(pageUrl.port).not.toBe('8743')
    await expect(page).toHaveTitle(/Pi Meter/i)
  })

  test('deep links load through the SPA fallback and render the route', async ({ page }) => {
    await page.goto('/settings')
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
    await expect(page.getByText('Settings are not built yet')).toBeVisible()

    await openSession(page, '11111111-1111-4111-8111-111111111111')
    await expect(page.locator('.pm-session-header__title')).toHaveText('Refactor parser pipeline')

    // A hard reload of a deep link still works (server fallback, not history).
    await page.reload()
    await expect(page.locator('.pm-session-header__title')).toHaveText('Refactor parser pipeline')

    const direct = await page.request.get('/sessions/11111111-1111-4111-8111-111111111111')
    expect(direct.ok()).toBeTruthy()
    expect(await direct.text()).toContain('<div id="root">')
  })

  test('loads only local fonts and assets', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => requests.push(request.url()))

    await openAllTimeDashboard(page)
    await page.waitForLoadState('networkidle')

    const origin = new URL(page.url()).origin
    const external = requests.filter((url) => !url.startsWith(origin) && !url.startsWith('data:'))
    expect(external).toEqual([])

    const fonts = requests.filter((url) => url.endsWith('.ttf'))
    expect(fonts.length).toBeGreaterThan(0)
    for (const font of fonts) {
      expect(font.startsWith(origin)).toBe(true)
    }

    const loaded = await page.evaluate(() => document.fonts.check('16px "Plus Jakarta Sans"'))
    expect(loaded).toBe(true)
  })

  test('no console errors or page errors while browsing the main routes', async ({ page }) => {
    const problems: string[] = []
    page.on('console', (message) => {
      if (message.type() === 'error') problems.push(message.text())
    })
    page.on('pageerror', (error) => problems.push(error.message))

    for (const path of [
      '/?range=all',
      '/sessions?range=all',
      '/sessions/11111111-1111-4111-8111-111111111111',
      '/sessions/44444444-4444-4444-8444-444444444444',
      '/sessions/01a16174-80c5-7088-aefb-de5e5b743c5f',
      '/settings',
    ]) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }

    expect(problems).toEqual([])
  })

  test('status strip port currently differs from the backend default (defect D6)', async ({
    page,
  }) => {
    // test_plan: StatusBar and vite.config.ts hardcode 8743 while
    // app/config.py defaults to 8787. The source of truth must be decided
    // before production changes; keep this as a failing regression.
    test.fail(true, 'D6: status strip hardcodes 127.0.0.1:8743 instead of the served endpoint')

    await openAllTimeDashboard(page)
    const status = page.getByLabel('Local index status')
    await expect(status).toContainText('127.0.0.1:8743')
    const origin = new URL(page.url())
    await expect(status).toContainText(origin.host)
  })

  test('status strip renders local database state', async ({ page }) => {
    await openAllTimeDashboard(page)
    const status = page.getByLabel('Local index status')
    await expect(status).toContainText('Local')
    await expect(status).toContainText('SQLite synced')
    await expect(status.locator('.pm-status-dot')).toHaveClass(/is-ok/)
  })

  test('refresh returns the corpus sync summary', async ({ page }) => {
    await page.goto('/sessions?range=all')
    await expect(page.locator('tbody tr').first()).toBeVisible()

    const response = page.waitForResponse(
      (res) => res.url().endsWith('/api/refresh') && res.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Refresh session index' }).click()
    const payload = await (await response).json()
    expect(payload.filesUpdated).toBe(0)
    expect(payload.filesAdded).toBe(0)
    expect(payload.filesRemoved).toBe(0)
    expect(payload.filesFailed).toBe(CORPUS.failedFiles)

    await expect(page.locator('.pm-refresh__status').first()).toContainText('0 updated')
    await expect(page.locator('.pm-refresh__status').first()).toContainText('2 failed')
  })
})
