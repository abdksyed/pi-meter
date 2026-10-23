/**
 * Harness smoke spec — owned by Worker 1 (test infrastructure).
 *
 * It only proves the isolated browser setup works end to end: Playwright starts
 * `scripts/serve-test-app.py`, the server serves the built SPA from
 * `frontend/dist`, and the API answers from the synthetic fixture corpus.
 *
 * Worker 7 owns `frontend/e2e/**` for real browser regressions and may replace
 * or delete this file; keep the pattern (never touch live data, never reuse a
 * foreign server) when doing so.
 */

import { expect, test } from '@playwright/test'

test.describe('test harness', () => {
  test('serves the built frontend with the synthetic corpus', async ({ page, request }) => {
    const health = await request.get('/api/health')
    expect(health.ok()).toBeTruthy()
    const body = await health.json()
    expect(body.status).toBe('ok')
    expect(body.databaseOk).toBe(true)
    expect(body.sessionsDir).toContain('pi-meter-e2e-')
    expect(body.sessionsDir).not.toContain('.pi/agent/sessions')

    const sessions = await request.get('/api/sessions?range=all&pageSize=100')
    expect(sessions.ok()).toBeTruthy()
    const payload = await sessions.json()
    const ids: string[] = payload.sessions.map((row: { sessionId: string }) => row.sessionId)
    expect(ids).toContain('11111111-1111-4111-8111-111111111111') // main fixture
    expect(ids).toContain('22222222-2222-4222-8222-222222222222') // beta fixture

    await page.goto('/')
    await expect(page.locator('#root')).toBeVisible()
    await expect(page).toHaveTitle(/Pi Meter/i)
  })

  test('serves deep links through the SPA fallback', async ({ page, request }) => {
    const response = await request.get('/settings')
    expect(response.ok()).toBeTruthy()
    expect(await response.text()).toContain('<div id="root">')

    await page.goto('/sessions/11111111-1111-4111-8111-111111111111')
    await expect(page.locator('#root')).toBeVisible()
  })
})
