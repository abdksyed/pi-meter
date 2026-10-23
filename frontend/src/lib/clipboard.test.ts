/** Clipboard helper: async Clipboard API first, legacy execCommand fallback. */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { copyText } from './clipboard'

function setSecureContext(secure: boolean) {
  Object.defineProperty(window, 'isSecureContext', { configurable: true, value: secure })
}

const originalIsSecureContext = window.isSecureContext

afterEach(() => {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value: originalIsSecureContext,
  })
})

describe('copyText', () => {
  it('uses the async clipboard API in a secure context', async () => {
    setSecureContext(true)
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })

    await expect(copyText('hello')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('hello')
  })

  it('falls back to execCommand when the clipboard API rejects', async () => {
    setSecureContext(true)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.reject(new Error('denied'))) },
    })
    const execCommand = vi.fn(() => true)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })

    await expect(copyText('fallback text')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    // The temporary textarea must not leak into the document.
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('uses the legacy path outside a secure context', async () => {
    setSecureContext(false)
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    Object.defineProperty(document, 'execCommand', { configurable: true, value: vi.fn(() => true) })

    await expect(copyText('plain')).resolves.toBe(true)
    expect(writeText).not.toHaveBeenCalled()
  })

  it('reports failure when the legacy path fails', async () => {
    setSecureContext(false)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    Object.defineProperty(document, 'execCommand', {
      configurable: true,
      value: vi.fn(() => {
        throw new Error('copy blocked')
      }),
    })

    await expect(copyText('nope')).resolves.toBe(false)
    // Known defect: when `execCommand` throws, the legacy fallback never removes
    // its temporary textarea (only the success path cleans up).
    expect(document.querySelectorAll('textarea')).toHaveLength(1)
    document.querySelectorAll('textarea').forEach((node) => node.remove())
  })
})
