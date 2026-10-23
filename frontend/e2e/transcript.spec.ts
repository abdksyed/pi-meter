/**
 * Session detail / transcript browser regressions.
 *
 * All assertions run against the real API + synthetic corpus served by the
 * isolated test app. Fixed timestamps mean relative labels are not asserted.
 */

import { expect, test } from '@playwright/test'
import {
  LONG_ID,
  MAIN_ID,
  MAPPED_CHILD_ID,
  PARENT_ID,
  UNSAFE_ID,
  openSession,
} from './support'

test.describe('session detail and transcript', () => {
  test('dashboard → session → search transcript → expand arguments → back', async ({ page }) => {
    await page.goto('/?range=all')
    await page
      .locator('section', { hasText: 'Recent sessions' })
      .locator('tbody tr a', { hasText: 'Refactor parser pipeline' })
      .click()

    await expect(page).toHaveURL(new RegExp(`/sessions/${MAIN_ID}$`))
    await expect(page.locator('.pm-session-header__title')).toHaveText(
      'Refactor parser pipeline',
    )
    await expect(page.locator('.pm-session-header__cwd')).toHaveText('/work/alpha')
    await expect(page.locator('.pm-session-header__models')).toContainText('claude-sonnet-4-5')
    await expect(page.locator('.pm-session-header__models')).toContainText('gpt-5.1')

    const search = page.getByRole('searchbox', { name: 'Search transcript' })
    await search.fill('parser')
    await expect(page).toHaveURL(/q=parser/)
    await expect(page.locator('.pm-search__status')).toHaveText('5 entries · 9 matches')
    await expect(page.locator('mark').first()).toBeVisible()

    await page.getByRole('button', { name: 'Next match' }).click()
    await expect(page.locator('.pm-entry.is-active')).toHaveCount(1)

    // The short bash result renders its output inline.
    await expect(page.getByRole('region', { name: 'Tool result 1 for bash' }).first()).toContainText(
      '3 passed in 0.42s',
    )

    // Clear the query so search-driven forced expansion does not apply.
    await search.fill('')
    await expect(page).not.toHaveURL(/q=/)

    // The bash call arguments start expanded and collapse on demand.
    const argsRegion = page.getByRole('region', { name: /^Arguments/ }).first()
    const argsCode = argsRegion.locator('xpath=ancestor::div[contains(@class,"pm-code")][1]')
    const toggle = argsCode.locator('.pm-code__toggle')
    await expect(toggle).toHaveText('Collapse')
    const openHeight = (await argsCode.boundingBox())!.height
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const closedHeight = (await argsCode.boundingBox())!.height
    expect(closedHeight).toBeLessThan(openHeight)

    // One Details disclosure toggles the raw entry panel.
    const details = page.locator('.pm-entry--user').first().locator('.pm-disclosure__trigger', {
      hasText: 'Details',
    })
    await expect(details).toHaveAttribute('aria-expanded', 'false')
    await details.click()
    await expect(details).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('.pm-entry--user').first().locator('.pm-disclosure__panel').first()).toBeVisible()

    await page.getByRole('link', { name: '← Sessions' }).click()
    await expect(page).toHaveURL(/\/sessions$/)
    await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  })

  test('transcript search status, next/prev navigation and clear', async ({ page }) => {
    await openSession(page, MAIN_ID)
    const search = page.getByRole('searchbox', { name: 'Search transcript' })

    await expect(page.locator('.pm-search__status')).toHaveText('Press / to search')
    await page.locator('main').click({ position: { x: 500, y: 5 } })
    await page.keyboard.press('/')
    await expect(search).toBeFocused()

    // `fill` is used here because of the focus-stealing defect covered below.
    await search.fill('parser')
    await expect(search).toHaveValue('parser')
    await expect(page.locator('.pm-search__status')).toHaveText('5 entries · 9 matches')

    await page.getByRole('button', { name: 'Next match' }).click()
    const firstActive = await page.locator('.pm-entry.is-active').getAttribute('id')
    await search.focus()
    await page.keyboard.press('Enter')
    const secondActive = await page.locator('.pm-entry.is-active').getAttribute('id')
    expect(secondActive).not.toBe(firstActive)

    await search.focus()
    await page.keyboard.press('Shift+Enter')
    await expect(page.locator('.pm-entry.is-active')).toHaveAttribute('id', firstActive!)

    await search.focus()
    await page.keyboard.press('Escape')
    await expect(search).toHaveValue('')
    await expect(page).not.toHaveURL(/q=/)
    await expect(page.locator('.pm-search__status')).toHaveText('Press / to search')
    await expect(page.locator('mark')).toHaveCount(0)
  })

  test('typing more than two characters keeps focus in the transcript search (defect)', async ({
    page,
  }) => {
    // Once two characters match, the active-match effect focuses the entry
    // element, so the third keystroke lands outside the input. Typing is
    // effectively limited to two characters.
    test.fail(true, 'Focus is stolen by the active search match after 2 characters')

    await openSession(page, MAIN_ID)
    const search = page.getByRole('searchbox', { name: 'Search transcript' })
    await search.click()
    await search.pressSequentially('parser', { delay: 100 })

    await expect(search).toBeFocused()
    await expect(search).toHaveValue('parser')
    await expect(page).toHaveURL(/q=parser/)
  })

  test('filter buttons drive the URL and the empty result state', async ({ page }) => {
    await openSession(page, MAIN_ID)
    const filters = page.getByRole('group', { name: 'Filter transcript' })

    await filters.getByRole('button', { name: /^User/ }).click()
    await expect(page).toHaveURL(/filter=user/)
    await expect(page.locator('.pm-entry')).toHaveCount(1)
    await expect(page.locator('.pm-entry--user')).toHaveCount(1)

    await filters.getByRole('button', { name: /^Tools/ }).click()
    await expect(page).toHaveURL(/filter=tools/)
    await expect(page.locator('.pm-entry')).toHaveCount(3)

    await filters.getByRole('button', { name: /^Errors/ }).click()
    await expect(page.locator('.pm-entry')).toHaveCount(1)

    await filters.getByRole('button', { name: /^Assistant/ }).click()
    await expect(page.locator('.pm-entry')).toHaveCount(3)

    await filters.getByRole('button', { name: /^All/ }).click()
    await expect(page).not.toHaveURL(/filter=/)
    await expect(page.locator('.pm-entry')).toHaveCount(16)

    // Tools filter combined with a query that only exists outside tools.
    await filters.getByRole('button', { name: /^Tools/ }).click()
    await page.getByRole('searchbox', { name: 'Search transcript' }).fill('refactor parser pipeline')
    await expect(page.getByText(/No matches for/)).toBeVisible()
    await page.getByRole('button', { name: 'Search all entries' }).click()
    await expect(page).not.toHaveURL(/filter=/)
    await expect(page.locator('.pm-entry.is-active')).toHaveCount(1)
  })

  test('expand all / collapse all change disclosure state and height', async ({ page }) => {
    await openSession(page, MAIN_ID)
    const triggers = page.locator('.pm-disclosure__trigger[aria-expanded]')
    const expandedBefore = await triggers.evaluateAll(
      (nodes) => nodes.filter((node) => node.getAttribute('aria-expanded') === 'true').length,
    )

    await page.getByRole('button', { name: 'Expand all' }).click()
    const expandedAfter = await triggers.evaluateAll(
      (nodes) => nodes.filter((node) => node.getAttribute('aria-expanded') === 'true').length,
    )
    expect(expandedAfter).toBeGreaterThan(expandedBefore)
    await expect(page.locator('.pm-sr-only[role="status"]').first()).toHaveText(
      'All sections expanded',
    )

    const expandedHeight = await page.evaluate(
      () => document.querySelector('main')!.scrollHeight,
    )
    await page.getByRole('button', { name: 'Collapse all' }).click()
    await expect
      .poll(() => page.evaluate(() => document.querySelector('main')!.scrollHeight))
      .toBeLessThan(expandedHeight)
    const collapsed = await triggers.evaluateAll(
      (nodes) => nodes.filter((node) => node.getAttribute('aria-expanded') === 'true').length,
    )
    expect(collapsed).toBe(0)
    await expect(page.locator('.pm-sr-only[role="status"]').first()).toHaveText(
      'All sections collapsed',
    )
  })

  test('long transcript: jump-to-latest brings the end of the conversation into view', async ({
    page,
  }) => {
    await openSession(page, LONG_ID)
    await expect(page.locator('.pm-entry')).toHaveCount(81)
    await expect(page.getByRole('group', { name: 'Filter transcript' })).toContainText(
      'All (81)',
    )

    // The floating pill appears only after scrolling away from the sentinel.
    await page.evaluate(() => {
      document.querySelector('main')!.scrollTop = 5000
    })
    const pill = page.locator('.pm-latest-pill')
    await expect(pill).toBeVisible()
    await pill.click()

    await expect
      .poll(() =>
        page.evaluate(() => {
          const main = document.querySelector('main')!
          const sentinel = document.querySelector('.pm-transcript__sentinel')!
          return main.getBoundingClientRect().bottom - sentinel.getBoundingClientRect().bottom
        }),
      )
      .toBeLessThan(900)
    const metrics = await page.evaluate(() => {
      const main = document.querySelector('main')!
      return { scrollTop: main.scrollTop, max: main.scrollHeight - main.clientHeight }
    })
    expect(metrics.scrollTop).toBeGreaterThan(metrics.max * 0.8)
    await expect(page.getByRole('button', { name: '↓ Latest' })).toBeVisible()
  })

  test('jump-to-latest leaves the floating pill visible (defect)', async ({ page }) => {
    // The IntersectionObserver sentinel uses rootMargin -40px while the jump
    // aligns the sentinel with the container bottom, so the pill never
    // disappears after its own click and the control cannot be dismissed.
    test.fail(true, 'Jump-to-latest does not dismiss the floating pill')

    await openSession(page, LONG_ID)
    await page.evaluate(() => {
      document.querySelector('main')!.scrollTop = 5000
    })
    await page.locator('.pm-latest-pill').click()

    await expect(page.locator('.pm-latest-pill')).toHaveCount(0)
  })

  test('long unbroken tool output expands without creating horizontal overflow', async ({
    page,
  }) => {
    await openSession(page, LONG_ID)
    await expect(page.locator('.pm-entry')).toHaveCount(81)

    const code = page.locator('.pm-tool__output').first()
    await code.scrollIntoViewIfNeeded()
    const toggle = code.locator('.pm-code__toggle')
    await expect(toggle).toHaveText('Expand')
    const before = (await code.boundingBox())!.height
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const after = (await code.boundingBox())!.height
    expect(after).toBeGreaterThan(before)
    // The 20 000 character unbroken string is wrapped, not widened.
    const overflow = await page.evaluate(() => {
      const main = document.querySelector('main')!
      return {
        main: main.scrollWidth - main.clientWidth,
        document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      }
    })
    expect(overflow.main).toBeLessThanOrEqual(0)
    expect(overflow.document).toBeLessThanOrEqual(0)
  })

  test('child session link opens the child title and ID, not the parent data', async ({ page }) => {
    await openSession(page, PARENT_ID)
    await expect(page.locator('.pm-session-header__title')).toHaveText(
      'Launch five sub-agents and reconcile their reports.',
    )

    const rail = page.getByRole('complementary', { name: 'Session totals' }).first()
    const disclosure = rail.locator('.pm-sub-agents')
    await expect(disclosure.locator('summary')).toContainText('5')
    await disclosure.locator('summary').click()

    const childLink = disclosure.getByRole('link', { name: 'Mapped child 1' })
    await expect(childLink).toHaveAttribute('href', `/sessions/${MAPPED_CHILD_ID}`)
    await childLink.click()

    await expect(page).toHaveURL(new RegExp(`/sessions/${MAPPED_CHILD_ID}$`))
    await expect(page.locator('.pm-session-header__title')).toHaveText('Mapped child 1')
    await page.locator('.pm-session-header__more summary').click()
    await expect(page.locator('.pm-session-header__more')).toContainText(MAPPED_CHILD_ID)
    await expect(page.locator('main')).not.toContainText(
      'Launch five sub-agents and reconcile their reports.',
    )

    await page.goBack()
    await expect(page).toHaveURL(new RegExp(`/sessions/${PARENT_ID}$`))
    await expect(page.locator('.pm-session-header__title')).toHaveText(
      'Launch five sub-agents and reconcile their reports.',
    )
  })

  test('sub-agent telemetry currently reports mapped children (defect D5)', async ({ page }) => {
    // test_plan D5: "Sub-agent calls" must count invocations (one tool call
    // here), not mapped child sessions (five). Keep this as a failing
    // regression until a real invocation count exists.
    test.fail(true, 'D5: Sub-agent calls shows 5 mapped children instead of 1 invocation')

    await openSession(page, PARENT_ID)
    const rail = page.getByRole('complementary', { name: 'Session totals' }).first()
    const telemetry = rail.locator('dl.pm-telemetry')
    await expect(telemetry).toContainText('Sub-agent calls')
    await expect(telemetry.locator('div', { hasText: 'Sub-agent calls' })).toContainText('1')
  })

  test('parse warnings are surfaced for the main fixture', async ({ page }) => {
    await openSession(page, MAIN_ID)
    const banner = page.locator('.pm-warnings')
    await expect(banner).toContainText('2 lines could not be parsed')
    await expect(banner).toContainText("unknown entry type 'future_event'")
    await expect(banner).toContainText('session has 10 roots')
  })

  test('unsafe fixture content is rendered as text, never as markup or navigation', async ({
    page,
  }) => {
    await openSession(page, UNSAFE_ID)
    await expect(page.locator('main')).toContainText("<script>alert('xss')</script>")
    await expect(page.locator('main')).toContainText('<img src=x onerror="alert(1)">')

    expect(await page.locator('main script').count()).toBe(0)
    expect(await page.locator('main img').count()).toBe(0)
    const hrefs = await page
      .locator('main a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''))
    for (const href of hrefs) {
      expect(href.startsWith('javascript:')).toBe(false)
      expect(href.startsWith('file:')).toBe(false)
    }
  })

  test('unknown session id shows the not-found state with a way back', async ({ page }) => {
    await page.goto('/sessions/not-a-real-session')
    await expect(page.getByRole('heading', { name: 'Session not found' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0)
    await page.getByRole('link', { name: 'Back to sessions' }).click()
    await expect(page).toHaveURL(/\/sessions/)
  })

  test('unknown route renders a page-not-found error', async ({ page }) => {
    await page.goto('/definitely-not-a-route')
    await expect(page.getByRole('alert')).toContainText('Page not found')
    await expect(page.getByRole('alert')).toContainText('That route does not exist in Pi Meter.')
  })

  test('deep-linked entry anchor focuses and scrolls to the entry', async ({ page }) => {
    await page.goto(`/sessions/${MAIN_ID}#entry-3`)
    await expect(page.locator('#entry-3')).toBeVisible()
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id ?? ''))
      .toBe('entry-3')
    const top = await page
      .locator('#entry-3')
      .evaluate((element) => element.getBoundingClientRect().top)
    expect(top).toBeGreaterThanOrEqual(0)
    expect(top).toBeLessThan(900)
  })
})
