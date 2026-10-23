/** API client: URL building, error normalization and transport failures. */

import { describe, expect, it } from 'vitest'

import { ApiError, apiGet, apiPost, getHealth, runRefresh } from './api'
import { jsonResponse, mockApi } from '../test/helpers'
import { healthFixture } from '../test/fixtures'

describe('apiGet', () => {
  it('prefixes /api and serializes params, skipping empty values', async () => {
    const api = mockApi({ 'GET /api/summary': { ok: true } })
    await apiGet('/summary', { range: '7d', cwd: '/work/alpha', model: undefined, q: '', page: 2 })

    const url = new URL(api.calls[0].url)
    expect(url.pathname).toBe('/api/summary')
    expect(url.searchParams.get('range')).toBe('7d')
    expect(url.searchParams.get('cwd')).toBe('/work/alpha')
    expect(url.searchParams.get('page')).toBe('2')
    expect(url.searchParams.has('model')).toBe(false)
    expect(url.searchParams.has('q')).toBe(false)
    expect(api.calls[0].method).toBe('GET')
    expect(api.calls[0].headers.get('Accept')).toBe('application/json')
  })

  it('omits the query string entirely without params', async () => {
    const api = mockApi({ 'GET /api/health': healthFixture() })
    const payload = await getHealth()
    expect(payload.sessionCount).toBe(2)
    expect(new URL(api.calls[0].url).search).toBe('')
  })
})

describe('apiPost', () => {
  it('sends a JSON body only when one is provided', async () => {
    const api = mockApi({ 'POST /api/refresh': { filesSeen: 1 } })
    await apiPost('/refresh', { force: true })
    expect(api.calls[0].method).toBe('POST')
    expect(api.calls[0].headers.get('Content-Type')).toBe('application/json')
    expect(await api.calls[0].json()).toEqual({ force: true })

    const bare = mockApi({ 'POST /api/refresh': { filesSeen: 0 } })
    const result = await runRefresh()
    expect(result.filesSeen).toBe(0)
    expect(bare.calls[0].headers.get('Content-Type')).toBeNull()
  })

  it('returns undefined for 204 responses', async () => {
    mockApi({ 'POST /api/refresh': new Response(null, { status: 204 }) })
    await expect(runRefresh()).resolves.toBeUndefined()
  })
})

describe('error handling', () => {
  it('surfaces a string detail from the error body', async () => {
    mockApi({ 'GET /api/health': jsonResponse({ detail: 'database is locked' }, 500) })
    await expect(getHealth()).rejects.toMatchObject({
      name: 'ApiError',
      status: 500,
      message: 'database is locked',
    })
  })

  it('joins validation error messages', async () => {
    mockApi({
      'GET /api/health': jsonResponse(
        { detail: [{ msg: 'range must be one of today' }, { msg: 'page must be >= 1' }] },
        422,
      ),
    })
    await expect(getHealth()).rejects.toMatchObject({
      status: 422,
      message: 'range must be one of today, page must be >= 1',
    })
  })

  it('falls back to the status text, then to a generic message', async () => {
    mockApi({ 'GET /api/health': new Response('nope', { status: 502, statusText: 'Bad Gateway' }) })
    await expect(getHealth()).rejects.toMatchObject({ status: 502, message: 'Bad Gateway' })

    mockApi({ 'GET /api/health': new Response(null, { status: 500, statusText: '' }) })
    await expect(getHealth()).rejects.toMatchObject({ message: 'Request failed with status 500' })
  })

  it('normalizes transport failures into ApiError(0) with a friendly message', async () => {
    mockApi({ 'GET /api/health': () => Promise.reject(new TypeError('Failed to fetch')) })
    const error = await getHealth().catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({
      status: 0,
      message: 'Could not reach the local Pi Meter server.',
      body: null,
    })
  })

  it('rethrows abort errors unchanged', async () => {
    mockApi({ 'GET /api/health': () => Promise.reject(new DOMException('aborted', 'AbortError')) })
    await expect(getHealth()).rejects.toBeInstanceOf(DOMException)
  })
})
