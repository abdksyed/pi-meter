import type { ApiErrorBody, HealthResponse, RefreshResponse } from './api.types'

const API_BASE = '/api'

export class ApiError extends Error {
  readonly status: number
  readonly body: unknown

  constructor(status: number, message: string, body: unknown = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
  }
}

export type QueryParams = object

function buildPath(path: string, params?: QueryParams): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params ?? {}) as [string, unknown][]) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return `${API_BASE}${path}${query ? `?${query}` : ''}`
}

async function toApiError(response: Response): Promise<ApiError> {
  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  const detail = (body as ApiErrorBody | null)?.detail
  let message = response.statusText
  if (typeof detail === 'string') {
    message = detail
  } else if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg).filter((msg): msg is string => Boolean(msg))
    if (messages.length > 0) message = messages.join(', ')
  }

  return new ApiError(response.status, message || `Request failed with status ${response.status}`, body)
}

async function request<T>(method: string, path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, method, headers: { Accept: 'application/json', ...init.headers } })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Could not reach the local Pi Meter server.', null)
  }

  if (!response.ok) throw await toApiError(response)
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function apiGet<T>(path: string, params?: QueryParams, signal?: AbortSignal): Promise<T> {
  return request<T>('GET', buildPath(path, params), { signal })
}

export function apiPost<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  return request<T>('POST', buildPath(path), {
    signal,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

export function getHealth(signal?: AbortSignal): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health', undefined, signal)
}

export function runRefresh(signal?: AbortSignal): Promise<RefreshResponse> {
  return apiPost<RefreshResponse>('/refresh', undefined, signal)
}
