/**
 * Shared constants and helpers for the Pi Meter browser regressions.
 *
 * Every spec runs against `scripts/serve-test-app.py` (started by
 * `playwright.config.ts`) which indexes only the synthetic corpus from
 * `tests/fixtures/corpus.py`. The numbers below are the corpus' own
 * independently computed expectations, not values re-derived from the app.
 */

import { expect, type Page } from '@playwright/test'

// Stable ids from tests/fixtures/corpus.py.
export const MAIN_ID = '11111111-1111-4111-8111-111111111111'
export const BETA_ID = '22222222-2222-4222-8222-222222222222'
export const METADATA_ID = '33333333-3333-4333-8333-333333333333'
export const LONG_ID = '44444444-4444-4444-8444-444444444444'
export const MALFORMED_ID = '66666666-6666-4666-8666-666666666666'
export const BLANK_LINES_ID = '77777777-7777-4777-8777-777777777777'
export const UNSAFE_ID = '88888888-8888-4888-8888-888888888888'
export const PARENT_ID = '01a16174-80c5-7088-aefb-de5e5b743c5f'
export const MAPPED_CHILD_ID = '01a162e4-2f54-72b8-a3ae-9ac22276c51e'

/** Expectations for the unchanged `full` corpus (see tests/fixtures/README.md). */
export const CORPUS = {
  filesSeen: 19,
  indexedSessions: 14,
  failedFiles: 2,
  totalCost: 0.181534,
  totalTokens: 13_830,
  mainCost: 0.019409,
  mainTokens: 10_725,
  /** `formatCost(0.181534)` and the `formatTokens` sum shown on the dashboard. */
  totalCostLabel: '$0.1815',
  totalTokensLabel: '13,830 tokens',
  mainCostLabel: '$0.0194',
  mainTokensLabel: '10,725 tokens',
} as const

/** All-time dashboard, where the fixed fixture dates are inside the range. */
export async function openAllTimeDashboard(page: Page) {
  await page.goto('/?range=all')
  await expect(page.getByRole('heading', { name: 'Usage overview' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'All time' })).toHaveAttribute('aria-pressed', 'true')
}

/** All-time sessions list with the desktop table rendered. */
export async function openAllTimeSessions(page: Page) {
  await page.goto('/sessions?range=all')
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible()
  await expect(page.locator('tbody tr').first()).toBeVisible()
}

export async function openSession(page: Page, sessionId: string) {
  await page.goto(`/sessions/${sessionId}`)
  await expect(page.locator('.pm-session-header__title')).toBeVisible()
  await expect(page.locator('.pm-transcript')).toBeVisible()
}

export async function mainScrollMetrics(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    const sentinel = document.querySelector('.pm-transcript__sentinel')
    const mainRect = main.getBoundingClientRect()
    const sentinelRect = sentinel?.getBoundingClientRect()
    return {
      scrollTop: main.scrollTop,
      scrollHeight: main.scrollHeight,
      clientHeight: main.clientHeight,
      mainBottom: mainRect.bottom,
      sentinelBottom: sentinelRect?.bottom ?? null,
      documentScrollHeight: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight,
      windowScrollY: window.scrollY,
    }
  })
}

/** Scroll the main region to its maximum and let layout settle. */
export async function scrollMainToBottom(page: Page) {
  await page.evaluate(() => {
    const main = document.querySelector('main')
    if (main) main.scrollTop = main.scrollHeight
  })
  await page.waitForTimeout(350)
}

/** Fail if the page can be scrolled sideways (mobile and narrow layouts). */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    body: document.body.scrollWidth - document.body.clientWidth,
  }))
  expect(overflow.document, 'document horizontal overflow').toBeLessThanOrEqual(0)
  expect(overflow.body, 'body horizontal overflow').toBeLessThanOrEqual(0)
}

export type RailMetrics = {
  railDisplay: string
  railContainerDisplay: string
  disclosureDisplay: string
  sectionPadding: string[]
  sectionBorderBottom: string[]
  sectionGaps: number[]
  railWidth: number | null
  titles: string[]
  documentOverflowX: number
}

/**
 * Measurements for the session totals panel: the sticky desktop rail
 * (>=1280px) or the inline `<details>` disclosure used on narrower widths.
 */
export async function railMetrics(page: Page): Promise<RailMetrics> {
  return page.evaluate(() => {
    const rail = document.querySelector('.pm-totals-rail')!
    const railContainer = document.querySelector('.pm-session-page__rail')!
    const disclosure = document.querySelector('.pm-totals-disclosure')!
    const railVisible = getComputedStyle(rail).display !== 'none'
    const container = railVisible ? rail : disclosure.querySelector('.pm-totals-inline')!
    const sections = [...container.querySelectorAll(':scope > .pm-rail__section')]
    const rects = sections.map((section) => section.getBoundingClientRect())
    return {
      railDisplay: getComputedStyle(rail).display,
      railContainerDisplay: getComputedStyle(railContainer).display,
      disclosureDisplay: getComputedStyle(disclosure).display,
      sectionPadding: sections.map((section) => {
        const style = getComputedStyle(section)
        return `${style.paddingTop} ${style.paddingRight} ${style.paddingBottom} ${style.paddingLeft}`
      }),
      sectionBorderBottom: sections.map((section) => getComputedStyle(section).borderBottomWidth),
      sectionGaps: rects.slice(1).map((rect, index) => Math.round(rect.top - rects[index].bottom)),
      railWidth: railVisible ? Math.round(rail.getBoundingClientRect().width) : null,
      titles: sections.map((section) => section.querySelector('.pm-rail__title')?.textContent ?? ''),
      documentOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
}
