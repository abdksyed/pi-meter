/**
 * Jump-to-latest hook: sentinel observation, floating-button visibility and
 * listener cleanup. Geometry is stubbed in jsdom; real scrolling is a browser
 * concern (`frontend/e2e`).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useJumpToLatest } from './useJumpToLatest'

const originalIntersectionObserver = window.IntersectionObserver

afterEach(() => {
  window.IntersectionObserver = originalIntersectionObserver
})

interface ObserverCapture {
  callback: IntersectionObserverCallback
  observer: { disconnect: ReturnType<typeof vi.fn>; observe: ReturnType<typeof vi.fn> }
}

function stubIntersectionObserver(): ObserverCapture {
  const capture = {
    callback: undefined as unknown as IntersectionObserverCallback,
    observer: { disconnect: vi.fn(), observe: vi.fn() },
  }
  window.IntersectionObserver = class {
    disconnect = capture.observer.disconnect
    observe = capture.observer.observe
    unobserve = vi.fn()
    takeRecords = vi.fn(() => [])
    root = null
    rootMargin = ''
    thresholds = []
    constructor(callback: IntersectionObserverCallback) {
      capture.callback = callback
    }
  } as unknown as typeof window.IntersectionObserver
  return capture as unknown as ObserverCapture
}

/** Build a scroll parent with a real sentinel child. */
function mountSentinel() {
  const parent = document.createElement('div')
  parent.style.overflowY = 'auto'
  Object.defineProperty(parent, 'scrollHeight', { configurable: true, value: 5000 })
  Object.defineProperty(parent, 'clientHeight', { configurable: true, value: 500 })
  parent.scrollTop = 0
  const sentinel = document.createElement('div')
  sentinel.scrollIntoView = vi.fn()
  parent.appendChild(sentinel)
  document.body.appendChild(parent)
  return { parent, sentinel }
}

describe('useJumpToLatest', () => {
  it('starts at the bottom with no floating button', () => {
    const { result } = renderHook(() => useJumpToLatest())
    expect(result.current.isAtBottom).toBe(true)
    expect(result.current.showFloating).toBe(false)
  })

  it('shows the floating button only after scrolling up past the threshold', () => {
    const { parent, sentinel } = mountSentinel()
    const capture = stubIntersectionObserver()
    const { result } = renderHook(() => useJumpToLatest())

    act(() => result.current.sentinelRef(sentinel))
    expect(capture.observer.observe).toHaveBeenCalledWith(sentinel)

    // The observer reports that the sentinel is out of view.
    act(() => {
      capture.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(result.current.isAtBottom).toBe(false)
    // Still hidden: the scroll offset is below the 400px threshold.
    expect(result.current.showFloating).toBe(false)

    act(() => {
      parent.scrollTop = 500
      parent.dispatchEvent(new Event('scroll'))
    })
    expect(result.current.showFloating).toBe(true)

    // Back at the bottom hides it again.
    act(() => {
      capture.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        {} as IntersectionObserver,
      )
    })
    expect(result.current.isAtBottom).toBe(true)
    expect(result.current.showFloating).toBe(false)

    parent.remove()
  })

  it('scrolls the sentinel into view when jumping', () => {
    const { parent, sentinel } = mountSentinel()
    const { result } = renderHook(() => useJumpToLatest())

    act(() => result.current.sentinelRef(sentinel))
    act(() => result.current.jumpToLatest())
    expect(sentinel.scrollIntoView).toHaveBeenCalled()
    parent.remove()
  })

  it('disconnects the observer and removes scroll listeners on unmount', () => {
    const { parent, sentinel } = mountSentinel()
    const capture = stubIntersectionObserver()
    const removeEventListener = vi.spyOn(parent, 'removeEventListener')

    const { result, unmount } = renderHook(() => useJumpToLatest())
    act(() => result.current.sentinelRef(sentinel))
    unmount()

    expect(capture.observer.disconnect).toHaveBeenCalled()
    expect(removeEventListener).toHaveBeenCalledWith('scroll', expect.any(Function))

    // Scrolling after unmount must not throw.
    expect(() => parent.dispatchEvent(new Event('scroll'))).not.toThrow()
    parent.remove()
  })

  it('does nothing without a sentinel', () => {
    const capture = stubIntersectionObserver()
    const { result } = renderHook(() => useJumpToLatest())
    expect(capture.observer.observe).not.toHaveBeenCalled()
    expect(() => result.current.jumpToLatest()).not.toThrow()
    expect(result.current.showFloating).toBe(false)
  })
})
