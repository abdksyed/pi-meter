/**
 * Sessions list browser regressions.
 *
 * The corpus is fixed to January 2026, so specs open `/sessions?range=all`
 * instead of relying on the default last-30-days window.
 */

import { expect, test } from '@playwright/test'
import { unlink, writeFile } from 'node:fs/promises'
import {
  CORPUS,
  MAIN_ID,
  expectNoHorizontalOverflow,
  openAllTimeSessions,
} from './support'

test.describe('sessions list', () => {
  test('lists indexed sessions with corpus totals and pagination', async ({ page }) => {
    await openAllTimeSessions(page)

    await expect(page.locator('.pm-page-header .pm-badge')).toHaveText('14 sessions')
    await expect(page.locator('table caption')).toContainText('Sessions: 14 total')
    await expect(page.locator('tbody tr')).toHaveCount(14)

    const summary = page.locator('main').getByText('All time total')
    await expect(summary).toBeVisible()
    await expect(page.getByText(CORPUS.totalCostLabel).first()).toBeVisible()
    await expect(page.getByText('13.8K tokens across 14 sessions')).toBeVisible()

    const pagination = page.getByRole('navigation', { name: 'Sessions pagination' })
    await expect(pagination).toContainText('1–14 of 14')
    await expect(pagination).toContainText('1 / 1')
    await expect(pagination.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await expect(pagination.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await expect(pagination.getByLabel('Per page')).toHaveValue('25')

    const mainRow = page.locator('tbody tr', { hasText: 'Refactor parser pipeline' })
    await expect(mainRow).toContainText('/work/alpha')
    await expect(mainRow).toContainText('10.7K')
    await expect(mainRow).toContainText(CORPUS.mainCostLabel)
    await expect(mainRow.locator('a')).toHaveAttribute('href', `/sessions/${MAIN_ID}`)

    // The partially parsed file is still listed, flagged as a parse warning.
    const partialRow = page.locator('tbody tr', { hasText: 'before the broken line' })
    await expect(partialRow).toContainText('1 responses · 2 entries')
    await expect(partialRow.locator('.pm-status-dot')).toHaveAttribute(
      'aria-label',
      'Parse warning',
    )
    await expect(partialRow.locator('.pm-status-dot')).toHaveAttribute(
      'title',
      /line is not valid JSON/,
    )
  })

  test('sorting updates the URL, aria-sort and row order', async ({ page }) => {
    await openAllTimeSessions(page)
    const costHeader = page.getByRole('button', { name: /^Cost/ })

    await costHeader.click()
    await expect(page).toHaveURL(/sort=cost/)
    await expect(page).toHaveURL(/dir=desc/)
    await expect(page.locator('th[aria-sort="descending"]')).toContainText('Cost')
    const descendingCosts = await page
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.querySelector('td:last-child')?.textContent))
    expect(descendingCosts[0]).toBe('$0.0200')
    expect(descendingCosts.at(-1)).toBe('$0.000010')

    await costHeader.click()
    await expect(page).toHaveURL(/dir=asc/)
    await expect(page.locator('th[aria-sort="ascending"]')).toContainText('Cost')
    const ascendingCosts = await page
      .locator('tbody tr')
      .evaluateAll((rows) => rows.map((row) => row.querySelector('td:last-child')?.textContent))
    expect(ascendingCosts[0]).toBe('$0.000010')
    expect(ascendingCosts.at(-1)).toBe('$0.0200')
  })

  test('project, model, search and minimum-cost filters combine and update the URL', async ({
    page,
  }) => {
    await openAllTimeSessions(page)
    const chips = page.getByRole('group', { name: 'Active filters' })
    const search = page.getByLabel('Filter sessions')

    await page.getByLabel('Project').selectOption('/work/alpha')
    await expect(page).toHaveURL(/cwd=%2Fwork%2Falpha/)
    await expect(page.locator('tbody tr')).toHaveCount(10)
    await expect(chips).toContainText('Project')
    await expect(chips).toContainText('alpha')

    await page.getByLabel('Model').selectOption('gpt-5.1')
    await expect(page).toHaveURL(/model=gpt-5.1/)
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.locator('tbody tr').first()).toContainText('Refactor parser pipeline')
    await expect(chips).toContainText('Model')
    await expect(chips).toContainText('gpt-5.1')

    await search.fill('parser')
    // The search input is debounced by 250ms, so poll the URL rather than the UI.
    await expect(page).toHaveURL(/q=parser/)
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(search).toHaveValue('parser')
    await expect(chips).toContainText('Search')
    await expect(page.getByText('1 sessions match')).toBeAttached()

    await page.getByText('More filters').click()
    await page.getByLabel('Minimum cost').fill('0.02')
    await expect(page).toHaveURL(/minCost=0.02/)
    // Parser session costs $0.019409, below the minimum.
    await expect(page.locator('tbody tr')).toHaveCount(0)
    await expect(page.getByText('No sessions match these filters')).toBeVisible()
    await expect(chips).toContainText('Min cost')
  })

  test('clear-all drops project and model filters and restores the full list', async ({ page }) => {
    await openAllTimeSessions(page)
    await page.getByLabel('Project').selectOption('/work/alpha')
    await page.getByLabel('Model').selectOption('gpt-5.1')
    await expect(page.locator('tbody tr')).toHaveCount(1)

    await page.getByRole('button', { name: 'Clear all' }).click()
    await expect(page).toHaveURL(/\/sessions\?range=all$/)
    await expect(page.locator('tbody tr')).toHaveCount(14)
    await expect(page.getByRole('group', { name: 'Active filters' })).toHaveCount(0)
  })

  test('removing the search chip clears the query from URL, input and results', async ({ page }) => {
    // Defect D4: useSessionFilters writes the stale local value back into the
    // URL, so clearing a search never sticks. Expected failure until fixed.
    test.fail(
      true,
      'D4: clearing search leaves ?q= in the URL and the text in the input',
    )

    await openAllTimeSessions(page)
    const search = page.getByLabel('Filter sessions')
    await search.fill('parser')
    await expect(page).toHaveURL(/q=parser/)
    await expect(page.locator('tbody tr')).toHaveCount(1)

    await page.getByRole('button', { name: 'Remove Search filter' }).click()
    // Wait past the debounce so any stale write-back has happened.
    await page.waitForTimeout(700)

    await expect(page).not.toHaveURL(/q=parser/)
    await expect(search).toHaveValue('')
    await expect(page.locator('tbody tr')).toHaveCount(14)
  })

  test('the search clear button also resets the query (defect D4)', async ({ page }) => {
    // Same D4 root cause reached through the SearchField clear button.
    test.fail(true, 'D4: SearchField onClear leaves ?q=parser in the URL')

    await openAllTimeSessions(page)
    const search = page.getByLabel('Filter sessions')
    await search.fill('parser')
    await expect(page).toHaveURL(/q=parser/)

    await page.getByRole('button', { name: 'Clear search' }).click()
    await page.waitForTimeout(700)

    await expect(page).not.toHaveURL(/q=parser/)
    await expect(search).toHaveValue('')
  })

  test('page size and out-of-range page parameters are normalised', async ({ page }) => {
    await openAllTimeSessions(page)
    await page.getByLabel('Per page').selectOption('50')
    await expect(page).toHaveURL(/pageSize=50/)
    const pagination = page.getByRole('navigation', { name: 'Sessions pagination' })
    await expect(pagination).toContainText('1–14 of 14')
    await expect(page.locator('tbody tr')).toHaveCount(14)

    await page.goto('/sessions?range=all&page=9')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await expect(page.locator('tbody tr')).toHaveCount(14)
    await expect(page.getByRole('navigation', { name: 'Sessions pagination' })).toContainText(
      '1–14 of 14',
    )
    await expect(page).not.toHaveURL(/page=9/)
  })

  test('row link opens the matching session detail', async ({ page }) => {
    await openAllTimeSessions(page)
    await page.locator('tbody tr', { hasText: 'Refactor parser pipeline' }).locator('a').click()

    await expect(page).toHaveURL(new RegExp(`/sessions/${MAIN_ID}$`))
    await expect(page.locator('.pm-session-header__title')).toHaveText(
      'Refactor parser pipeline',
    )
    await expect(page.locator('.pm-session-header__cwd')).toHaveText('/work/alpha')

    await page.getByRole('link', { name: '← Sessions' }).click()
    await expect(page).toHaveURL(/\/sessions$/)
    await expect(page.locator('.pm-page-header .pm-badge')).toHaveText('0 sessions')
  })

  test('mobile width renders the card list without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/sessions?range=all')
    await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)

    const cards = page.locator('.pm-sessions-layout li a, main ul li a')
    expect(await cards.count()).toBeGreaterThan(10)
    await expect(cards.first()).toContainText('Check usage around midnight.')
    await expectNoHorizontalOverflow(page)

    // Mobile navigation replaces the desktop rail.
    await expect(page.locator('.pm-rail')).toBeHidden()
    const mobileNav = page.locator('.pm-mobilebar')
    await expect(mobileNav).toBeVisible()
    await expect(mobileNav.getByRole('link', { name: 'Sessions' })).toBeVisible()

    // The mobile bar stays sticky while the document scrolls.
    await page.evaluate(() => window.scrollTo(0, 600))
    await expect(mobileNav).toBeInViewport()
  })

  test('keyboard-only filtering, sorting and pagination controls', async ({ page }) => {
    await openAllTimeSessions(page)

    // Tab from the top reaches the skip link first, then navigation.
    const skipLink = page.getByRole('link', { name: 'Skip to main content' })
    await page.keyboard.press('Tab')
    await expect(skipLink).toBeFocused()
    const skipBox = await skipLink.boundingBox()
    expect(skipBox!.x).toBeGreaterThanOrEqual(0)

    const projectSelect = page.getByLabel('Project', { exact: true })
    await projectSelect.focus()
    await page.keyboard.press('ArrowDown')
    await expect(projectSelect).toHaveValue('/work/alpha')
    await expect(page).toHaveURL(/cwd=%2Fwork%2Falpha/)

    const modelSelect = page.getByLabel('Model', { exact: true })
    await modelSelect.focus()
    await page.keyboard.press('ArrowDown')
    await expect(modelSelect).toHaveValue('claude-sonnet-4-5')

    const search = page.getByLabel('Filter sessions')
    await page.locator('main').click({ position: { x: 400, y: 5 } })
    await page.keyboard.press('/')
    await expect(search).toBeFocused()
    await search.pressSequentially('parser', { delay: 80 })
    await expect(page).toHaveURL(/q=parser/)

    // Focus ring is visibly drawn on the keyboard-focused control.
    const outline = await search.evaluate((element) => {
      const style = getComputedStyle(element)
      return { width: style.outlineWidth, style: style.outlineStyle }
    })
    expect(outline.style).not.toBe('none')
    expect(parseFloat(outline.width)).toBeGreaterThan(0)
  })

  test('refresh picks up a test-added session only when requested', async ({
    page,
    request,
  }) => {
    await openAllTimeSessions(page)
    await expect(page.locator('tbody tr')).toHaveCount(14)

    const health = await (await request.get('/api/health')).json()
    const dir: string = health.sessionsDir
    const file = `${dir}/e2e-added.jsonl`
    const id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
    const records = [
      {
        type: 'session',
        version: 3,
        id,
        timestamp: '2026-01-21T10:00:00.000Z',
        cwd: '/work/alpha',
      },
      {
        type: 'message',
        id: 'e2e-u1',
        timestamp: '2026-01-21T10:00:00.000Z',
        message: {
          role: 'user',
          content: [{ type: 'text', text: 'E2E added session' }],
          timestamp: 1768989600000,
        },
      },
      {
        type: 'message',
        id: 'e2e-a1',
        timestamp: '2026-01-21T10:00:02.000Z',
        parentId: 'e2e-u1',
        message: {
          role: 'assistant',
          content: [{ type: 'text', text: 'Added response.' }],
          provider: 'openai',
          model: 'gpt-5.1',
          usage: {
            input: 100,
            output: 20,
            reasoning: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 120,
            cost: { input: '0.001', output: '0.002', total: '0.003' },
          },
        },
      },
      {
        type: 'session_info',
        id: 'e2e-si',
        timestamp: '2026-01-21T10:00:01.000Z',
        name: 'E2E added session',
      },
    ]
    await writeFile(file, records.map((record) => JSON.stringify(record)).join('\n') + '\n')

    try {
      // No polling or live reload: the list keeps the old counts.
      await page.waitForTimeout(1500)
      await expect(page.locator('tbody tr')).toHaveCount(14)
      await expect(page.getByText('E2E added session')).toHaveCount(0)

      await page.getByRole('button', { name: 'Refresh session index' }).click()
      await expect(page.locator('.pm-refresh__status').first()).toContainText('1 added')
      await expect(page.locator('tbody tr')).toHaveCount(15)
      await expect(page.getByText('E2E added session')).toBeVisible()
      await expect(page.locator('.pm-page-header .pm-badge')).toHaveText('15 sessions')
    } finally {
      await unlink(file)
    }

    await page.getByRole('button', { name: 'Refresh session index' }).click()
    await expect(page.locator('.pm-refresh__status').first()).toContainText('1 removed')
    await expect(page.locator('tbody tr')).toHaveCount(14)
  })

  test('refresh button accessible name includes its visible label', async ({ page }) => {
    // Defect D3: RefreshButton hardcodes aria-label="Refresh session index"
    // even when the visible label is "Refresh index" (empty state).
    test.fail(true, 'D3: visible label "Refresh index" is not part of the accessible name')

    await page.route('**/api/sessions?*', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ sessions: [], total: 0, page: 1, pageSize: 25 }),
      }),
    )
    await page.goto('/sessions?range=all')
    await expect(page.getByText('No Pi sessions found yet')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Refresh index' })).toBeVisible()
  })
})
