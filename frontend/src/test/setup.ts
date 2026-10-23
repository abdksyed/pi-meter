/**
 * Global Vitest setup for Pi Meter component tests.
 *
 * Responsibilities:
 * - register jest-dom matchers on Vitest's `expect`;
 * - reset TanStack Query caches, `localStorage`/`sessionStorage`, and the DOM
 *   between tests;
 * - provide the browser APIs jsdom lacks but the app uses
 *   (`window.matchMedia`, `ResizeObserver`, clipboard, `scrollIntoView`);
 * - fail loudly on unexpected network calls so no component test depends on a
 *   live API.
 *
 * Determinism: tests set their own clock with `vi.useFakeTimers()` +
 * `vi.setSystemTime(new Date('2026-01-15T09:00:00.000Z'))`; this file calls
 * `vi.useRealTimers()` after each test.
 */

import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

import { queryClient } from '../app/queryClient'

// ---------------------------------------------------------------------------
// Browser API stubs
// ---------------------------------------------------------------------------

function matchMediaStub(query: string): MediaQueryList {
  return {
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList
}

if (typeof window !== 'undefined') {
  window.matchMedia ??= vi.fn(matchMediaStub) as unknown as typeof window.matchMedia

  if (!('ResizeObserver' in window)) {
    // @ts-expect-error - test-only global
    window.ResizeObserver = class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    }
  }

  if (!('IntersectionObserver' in window)) {
    // @ts-expect-error - test-only global
    window.IntersectionObserver = class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
      takeRecords = vi.fn(() => [])
      root = null
      rootMargin = ''
      thresholds = []
    }
  }

  if (!('scrollTo' in window)) {
    // @ts-expect-error - test-only global
    window.scrollTo = vi.fn()
  }

  Element.prototype.scrollIntoView ??= vi.fn()

  if (!navigator.clipboard) {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(() => Promise.resolve()),
        readText: vi.fn(() => Promise.resolve('')),
      },
    })
  }
}

// ---------------------------------------------------------------------------
// Per-test reset
// ---------------------------------------------------------------------------

beforeEach(() => {
  queryClient.clear()
  window.localStorage.clear()
  window.sessionStorage.clear()
  // Default: reject any un-mocked network call.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('unexpected fetch: mock fetch in this test'))),
  )
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})
