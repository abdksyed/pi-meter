/** Session detail hook: fetch, normalization, 404 handling and refetch. */

import { describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { act } from 'react'

import { useSessionDetail } from './useSessionDetail'
import { SESSION_IDS, rawSessionDetail } from '../test/fixtures'
import { jsonResponse, mockApi, wrapperFor } from '../test/helpers'

describe('useSessionDetail', () => {
  it('loads and normalizes a session', async () => {
    const api = mockApi({ 'GET /api/sessions': rawSessionDetail() })
    const { result } = renderHook(() => useSessionDetail(SESSION_IDS.main), { wrapper: wrapperFor() })

    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(new URL(api.calls[0].url).pathname).toBe(`/api/sessions/${SESSION_IDS.main}`)
    expect(result.current.data?.session.title).toBe('Refactor parser pipeline')
    expect(result.current.data?.entries).toHaveLength(5)
    expect(result.current.isLoading).toBe(false)
    expect(result.current.error).toBeUndefined()
  })

  it('URL-encodes the session id', async () => {
    const api = mockApi({ 'GET /api/sessions': rawSessionDetail() })
    renderHook(() => useSessionDetail('weird id/with slash'), { wrapper: wrapperFor() })
    await waitFor(() => expect(api.calls).toHaveLength(1))
    expect(api.calls[0].url).toContain('/api/sessions/weird%20id%2Fwith%20slash')
  })

  it('does not fetch without a session id', async () => {
    const api = mockApi({})
    const { result } = renderHook(() => useSessionDetail(undefined), { wrapper: wrapperFor() })
    expect(result.current.isLoading).toBe(false)
    expect(result.current.data).toBeUndefined()
    expect(api.calls).toHaveLength(0)
  })

  it('flags an unknown session as notFound', async () => {
    mockApi({ 'GET /api/sessions': () => jsonResponse({ detail: 'Session not found' }, 404) })
    const { result } = renderHook(() => useSessionDetail('missing-id'), { wrapper: wrapperFor() })

    // `useSessionDetail` opts into one retry, so the error arrives after two attempts.
    await waitFor(() => expect(result.current.error).toBeDefined(), { timeout: 3000 })
    expect(result.current.error).toEqual({
      message: 'Session not found',
      status: 404,
      notFound: true,
    })
  })

  it('reports other failures without a notFound flag', async () => {
    mockApi({ 'GET /api/sessions': () => jsonResponse({ detail: 'boom' }, 500) })
    const { result } = renderHook(() => useSessionDetail(SESSION_IDS.main), { wrapper: wrapperFor() })

    await waitFor(() => expect(result.current.error).toBeDefined(), { timeout: 3000 })
    expect(result.current.error).toMatchObject({ status: 500, notFound: false })
  })

  it('refetches on demand', async () => {
    const api = mockApi({ 'GET /api/sessions': rawSessionDetail() })
    const { result } = renderHook(() => useSessionDetail(SESSION_IDS.main), { wrapper: wrapperFor() })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(api.calls).toHaveLength(1)

    act(() => result.current.refetch())
    await waitFor(() => expect(api.calls).toHaveLength(2))
  })
})
