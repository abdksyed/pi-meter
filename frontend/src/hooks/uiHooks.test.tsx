/** Small UI hooks: debounce, media queries and clipboard state. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useDebouncedValue } from './useDebouncedValue'
import { useMediaQuery } from './useMediaQuery'
import { useCopyToClipboard } from './useCopyToClipboard'
import { copyText } from '../lib/clipboard'

vi.mock('../lib/clipboard', () => ({ copyText: vi.fn() }))

const originalMatchMedia = window.matchMedia

afterEach(() => {
  window.matchMedia = originalMatchMedia
})

describe('useDebouncedValue', () => {
  it('returns the initial value immediately and the new one after the delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 250), {
      initialProps: { value: 'a' },
    })
    expect(result.current).toBe('a')

    rerender({ value: 'b' })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(249)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('b')
  })

  it('cancels a pending update when the value changes again', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ value }) => useDebouncedValue(value, 100), {
      initialProps: { value: 'a' },
    })

    rerender({ value: 'b' })
    act(() => {
      vi.advanceTimersByTime(50)
    })
    rerender({ value: 'c' })
    act(() => {
      vi.advanceTimersByTime(99)
    })
    expect(result.current).toBe('a')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('c')
  })
})

function stubMatchMedia(matches: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn((_: string, handler: () => void) => listeners.add(handler)),
    removeEventListener: vi.fn((_: string, handler: () => void) => listeners.delete(handler)),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
  window.matchMedia = vi.fn(() => media) as unknown as typeof window.matchMedia
  return { media, listeners }
}

describe('useMediaQuery', () => {
  it('reads the current match state', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useMediaQuery('(max-width: 899px)'))
    expect(result.current).toBe(true)
    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 899px)')
  })

  it('updates on change events and cleans up its listener', () => {
    const { media, listeners } = stubMatchMedia(false)
    const { result, unmount } = renderHook(() => useMediaQuery('(min-width: 900px)'))
    expect(result.current).toBe(false)

    media.matches = true
    act(() => {
      listeners.forEach((listener) => listener())
    })
    expect(result.current).toBe(true)

    unmount()
    expect(media.removeEventListener).toHaveBeenCalled()
  })
})

describe('useCopyToClipboard', () => {
  it('reports success and resets after the timeout', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(copyText).mockResolvedValue(true)
    const { result } = renderHook(() => useCopyToClipboard(1000))

    await act(async () => {
      await expect(result.current.copy('text')).resolves.toBe(true)
    })
    expect(result.current.copied).toBe(true)
    expect(result.current.error).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(result.current.copied).toBe(false)
  })

  it('reports failure', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(copyText).mockResolvedValue(false)
    const { result } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      await expect(result.current.copy('text')).resolves.toBe(false)
    })
    expect(result.current.error).toBe(true)
    expect(result.current.copied).toBe(false)
  })

  it('clears the pending reset timer on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(copyText).mockResolvedValue(true)
    const clearTimeout = vi.spyOn(window, 'clearTimeout')
    const { result, unmount } = renderHook(() => useCopyToClipboard())

    await act(async () => {
      await result.current.copy('text')
    })
    unmount()
    expect(clearTimeout).toHaveBeenCalled()
  })

  it('does not warn about state updates after unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    vi.mocked(copyText).mockResolvedValue(true)
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { result, unmount } = renderHook(() => useCopyToClipboard(10))
    unmount()
    await waitFor(() => expect(errors).not.toHaveBeenCalled())
    expect(result.current.copied).toBe(false)
  })
})
