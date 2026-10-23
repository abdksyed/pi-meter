/**
 * Layout, scrolling and responsive browser regressions.
 *
 * These specs measure real geometry in Chromium: the totals panel at six
 * widths, the end-of-conversation gap in the main scroll container, repeated
 * scrolling, and the mobile document-scroll layout.
 */

import { expect, test, type Page } from '@playwright/test'
import {
  LONG_ID,
  MAIN_ID,
  PARENT_ID,
  expectNoHorizontalOverflow,
  openSession,
  railMetrics,
  scrollMainToBottom,
} from './support'

const WIDTHS = [1440, 1280, 1024, 900, 768, 390] as const

/** Bottom padding declared for the main content region. */
const MAIN_INNER_PADDING_BOTTOM = 64

type ScrollSample = {
  scrollTop: number
  scrollHeight: number
  documentScrollHeight: number
  windowScrollY: number
  mainBottom: number
  sentinelBottom: number | null
  gridBottom: number | null
  /** Distance between the transcript sentinel and the bottom of `main`. */
  mainBottomGap: number
  viewport: number
}

async function measureScroll(page: Page): Promise<ScrollSample> {
  return page.evaluate(() => {
    const main = document.querySelector('main')!
    const sentinel = document.querySelector('.pm-transcript__sentinel')
    const grid = document.querySelector('.pm-session-page__grid')
    const mainBottom = main.getBoundingClientRect().bottom
    const sentinelBottom = sentinel?.getBoundingClientRect().bottom ?? null
    return {
      scrollTop: main.scrollTop,
      scrollHeight: main.scrollHeight,
      documentScrollHeight: document.documentElement.scrollHeight,
      windowScrollY: window.scrollY,
      mainBottom,
      sentinelBottom,
      gridBottom: grid?.getBoundingClientRect().bottom ?? null,
      mainBottomGap: sentinelBottom === null ? -1 : mainBottom - sentinelBottom,
      viewport: window.innerHeight,
    }
  })
}

async function measureEndOfConversation(page: Page) {
  await scrollMainToBottom(page)
  const first = await measureScroll(page)
  await scrollMainToBottom(page)
  const second = await measureScroll(page)
  return { first, second }
}

test.describe('layout and scrolling', () => {
  for (const width of WIDTHS) {
    test(`session totals panel keeps its padding and section separation at ${width}px`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 })
      await openSession(page, MAIN_ID)

      if (width < 1280) {
        // Below 1280px the rail is replaced by an inline disclosure.
        await page.locator('.pm-totals-disclosure summary').click()
        await expect(page.locator('.pm-totals-disclosure')).toHaveAttribute('open', '')
      }

      const metrics = await railMetrics(page)
      expect(metrics.documentOverflowX).toBeLessThanOrEqual(0)
      expect(metrics.titles).toHaveLength(6)
      // Section titles are uppercased by CSS, so compare the text content.
      expect(metrics.titles[0]).toContain('Cumulative cost')
      expect(metrics.titles.at(-1)).toContain('Source file')

      // Each section keeps 18px/20px padding and a hairline separator.
      for (const padding of metrics.sectionPadding) {
        expect(padding).toBe('18px 20px 18px 20px')
      }
      expect(metrics.sectionBorderBottom.slice(0, -1)).toEqual(
        Array(metrics.sectionBorderBottom.length - 1).fill('1px'),
      )
      expect(metrics.sectionBorderBottom.at(-1)).toBe('0px')

      // Sections are stacked without gaps or overlap.
      for (const gap of metrics.sectionGaps) {
        expect(gap).toBe(0)
      }

      if (width >= 1280) {
        expect(metrics.railContainerDisplay).not.toBe('none')
        expect(metrics.railDisplay).not.toBe('none')
        expect(metrics.disclosureDisplay).toBe('none')
        expect(metrics.railWidth).toBe(320)
        // The rail scrolls with the page and never pushes the grid sideways.
        await expectNoHorizontalOverflow(page)
      } else {
        // The rail container is hidden; its inner element still has display:block.
        expect(metrics.railContainerDisplay).toBe('none')
        expect(metrics.disclosureDisplay).toBe('block')
      }

      // Screenshots are attached to the HTML report for manual review.
      const screenshot = await page.screenshot({ fullPage: false })
      await testInfo.attach(`totals-${width}px.png`, {
        body: screenshot,
        contentType: 'image/png',
      })
    })
  }

  test('desktop main scroll reaches a stable end without a second blank page', async ({
    page,
  }) => {
    await openSession(page, LONG_ID)
    await expect(page.locator('.pm-entry')).toHaveCount(81)

    const { first, second } = await measureEndOfConversation(page)

    // The first scroll can settle (content-visibility reflow); after that the
    // height must stay fixed while we keep scrolling down.
    expect(second.scrollHeight).toBeLessThanOrEqual(first.scrollHeight + 1)
    expect(second.scrollTop).toBeGreaterThanOrEqual(first.scrollTop)

    const third = await page.evaluate(async () => {
      const main = document.querySelector('main')!
      main.scrollTop = main.scrollHeight
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      return { scrollHeight: main.scrollHeight, scrollTop: main.scrollTop }
    })
    expect(third.scrollHeight).toBe(second.scrollHeight)
    expect(third.scrollTop).toBeGreaterThanOrEqual(second.scrollTop)
    expect(third.scrollTop).toBeLessThanOrEqual(third.scrollHeight)

    // No viewport-sized blank gap below the last entry: the sentinel sits
    // inside the main viewport, within the documented bottom padding.
    const gap = second.mainBottomGap
    expect(gap).toBeGreaterThanOrEqual(0)
    expect(gap).toBeLessThanOrEqual(MAIN_INNER_PADDING_BOTTOM + 120)

    // The status strip stays pinned under the scroll container.
    const footer = await page.locator('.pm-statusbar').boundingBox()
    expect(footer!.y).toBeGreaterThanOrEqual(second.mainBottom - 1)
  })

  test('wheel scrolling stops at the end of the transcript', async ({ page }) => {
    await openSession(page, LONG_ID)
    await page.mouse.move(700, 400)
    const samples: number[] = []
    for (let step = 0; step < 8; step += 1) {
      await page.mouse.wheel(0, 2000)
      await page.waitForTimeout(120)
      samples.push((await measureScroll(page)).scrollHeight)
    }
    // Height stabilises: repeated wheel scrolling does not keep growing the
    // transcript, and the main container is the element that scrolled.
    const tail = samples.slice(-3)
    expect(Math.max(...tail) - Math.min(...tail)).toBeLessThanOrEqual(1)
    const final = await measureScroll(page)
    expect(final.scrollTop).toBeGreaterThan(0)
  })

  test('end-of-conversation gap holds after filter, expansion and jump-to-latest', async ({
    page,
  }) => {
    await openSession(page, LONG_ID)

    await page.getByRole('button', { name: 'Expand all' }).click()
    await page.getByRole('button', { name: 'Collapse all' }).click()
    await expect(page.locator('.pm-entry')).toHaveCount(81)

    await page.getByRole('group', { name: 'Filter transcript' }).getByRole('button', { name: /^Tools/ }).click()
    await expect(page.locator('.pm-entry')).toHaveCount(1)
    await page.getByRole('group', { name: 'Filter transcript' }).getByRole('button', { name: /^All/ }).click()
    await expect(page.locator('.pm-entry')).toHaveCount(81)

    await page.evaluate(() => {
      document.querySelector('main')!.scrollTop = 4000
    })
    await page.locator('.pm-latest-pill').click()
    await page.waitForTimeout(400)

    const { second } = await measureEndOfConversation(page)
    expect(second.mainBottomGap).toBeGreaterThanOrEqual(0)
    expect(second.mainBottomGap).toBeLessThanOrEqual(MAIN_INNER_PADDING_BOTTOM + 120)
  })

  test('decorative overflow must not create a scrollable blank region (defect)', async ({
    page,
  }) => {
    // The shell is height:100dvh/overflow:hidden, but overflowing descendants
    // still increase documentElement.scrollHeight, so window scrolling can
    // reveal an empty canvas below the status bar. Report it as a defect.
    test.fail(true, 'Document scrollHeight exceeds the shell height on long pages')

    await openSession(page, LONG_ID)
    const geometry = await page.evaluate(() => ({
      documentScrollHeight: document.documentElement.scrollHeight,
      viewport: window.innerHeight,
      shellHeight: document.querySelector('.pm-shell')!.getBoundingClientRect().height,
    }))
    expect(geometry.documentScrollHeight).toBeLessThanOrEqual(Math.round(geometry.viewport) + 1)
  })

  test('sub-agent parent page keeps its totals rail inside the viewport', async ({ page }) => {
    await openSession(page, PARENT_ID)
    const rail = await railMetrics(page)
    expect(rail.railContainerDisplay).not.toBe('none')
    expect(rail.railWidth).toBe(320)
    expect(rail.titles).toHaveLength(7)
    expect(rail.documentOverflowX).toBeLessThanOrEqual(0)
    expect(rail.sectionGaps.every((gap) => gap === 0)).toBe(true)
  })

  test('mobile widths scroll the document and keep navigation reachable', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openSession(page, LONG_ID)

    const layout = await page.evaluate(() => {
      const main = document.querySelector('main')!
      return {
        mainOverflow: getComputedStyle(main).overflowY,
        documentScrollHeight: document.documentElement.scrollHeight,
        viewport: window.innerHeight,
        shellHeight: getComputedStyle(document.querySelector('.pm-shell')!).height,
        mobileBarPosition: getComputedStyle(document.querySelector('.pm-mobilebar')!).position,
      }
    })
    expect(layout.mainOverflow).toBe('visible')
    expect(layout.documentScrollHeight).toBeGreaterThan(layout.viewport * 2)
    expect(layout.mobileBarPosition).toBe('sticky')

    await expectNoHorizontalOverflow(page)
    await page.evaluate(() => window.scrollTo(0, 1200))
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(1000)
    await expect(page.locator('.pm-mobilebar')).toBeInViewport()
    // The desktop rail and status bar are hidden on mobile.
    await expect(page.locator('.pm-rail')).toBeHidden()
    await expect(page.locator('.pm-statusbar')).toBeHidden()

    // The totals disclosure is usable and expands without sideways overflow.
    const disclosure = page.locator('.pm-totals-disclosure')
    await expect(disclosure).not.toHaveAttribute('open', '')
    await disclosure.locator('summary').click()
    await expect(disclosure).toHaveAttribute('open', '')
    await expect(disclosure).toContainText('Cumulative cost')
    await expectNoHorizontalOverflow(page)

    await page.locator('.pm-mobilebar').getByRole('link', { name: 'Sessions' }).click()
    await expect(page).toHaveURL(/\/sessions/)
    await page.locator('.pm-mobilebar').getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/settings/)
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible()
  })

  test('sessions search text clears the search icon (placeholder and entered text)', async ({
    page,
  }, testInfo) => {
    // The bundler emits the plain `.pm-field` rule after the CSS-module input
    // rule, so `padding: 0 12px` wins over the intended 40px left padding and
    // the placeholder starts underneath the magnifier icon.
    test.fail(true, 'Search icon overlaps the input text: left padding resolves to 12px, not 40px')

    for (const width of [1440, 768, 390] as const) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/sessions?range=all')
      // Above 900px the table renders, below it the card list; the badge is
      // present once the sessions query resolved in either layout.
      await expect(page.locator('.pm-page-header .pm-badge')).toHaveText('14 sessions')

      const search = page.getByLabel('Filter sessions')
      for (const state of ['placeholder', 'typed'] as const) {
        if (state === 'typed') {
          await search.fill('parser')
          await expect(page).toHaveURL(/q=parser/)
        }
        const geometry = await search.evaluate((input) => {
          const style = getComputedStyle(input)
          const icon = input.parentElement!.querySelector('svg')!
          const inputRect = input.getBoundingClientRect()
          const iconRect = icon.getBoundingClientRect()
          return {
            paddingLeft: parseFloat(style.paddingLeft),
            textStart: inputRect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft),
            iconLeft: iconRect.left,
            iconRight: iconRect.right,
          }
        })
        // The icon is 14px wide starting at the field's left padding; the text
        // must start at least 8px after the icon ends.
        expect(geometry.paddingLeft, `${width}px ${state} padding-left`).toBeGreaterThanOrEqual(32)
        expect(
          geometry.textStart - geometry.iconRight,
          `${width}px ${state} icon/text gap`,
        ).toBeGreaterThanOrEqual(8)
        await testInfo.attach(`search-${width}-${state}.png`, {
          body: await page.screenshot({
            clip: {
              x: Math.max(0, geometry.iconLeft - 12),
              y: (await search.boundingBox())!.y - 8,
              width: 360,
              height: 48,
            },
          }),
          contentType: 'image/png',
        })
      }
    }
  })

  test('reduced motion disables transitions without breaking focus visibility', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await openSession(page, MAIN_ID)

    const durations = await page.evaluate(() => {
      const button = document.querySelector('.pm-btn')!
      return {
        transition: getComputedStyle(button).transitionDuration,
        animation: getComputedStyle(button).animationDuration,
      }
    })
    for (const value of durations.transition.split(',')) {
      expect(parseFloat(value)).toBeLessThanOrEqual(0.001)
    }

    await page.keyboard.press('Tab')
    await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused()
    const focus = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!)
      return { outlineWidth: parseFloat(style.outlineWidth), outlineStyle: style.outlineStyle }
    })
    expect(focus.outlineStyle).not.toBe('none')
    expect(focus.outlineWidth).toBeGreaterThan(0)
  })
})
