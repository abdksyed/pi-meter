/**
 * Render helpers for Pi Meter frontend tests.
 *
 * Every helper provides a fresh, retry-free TanStack Query client and a
 * memory router, so component tests never touch the network or the real
 * browser history. Contracts:
 *
 * - `renderWithProviders(ui, { route })` — router + query client only.
 * - `renderWithRoute(element, { path, route })` — adds `Routes`/`Route` so
 *   `useParams` works (e.g. `/sessions/:sessionId`).
 * - `renderAppRoutes(routes, { route })` — full route table for shell tests.
 * - `mockApi(handlers)` — deterministic `fetch` mock keyed by
 *   `"<METHOD> <path-prefix>"`; unmatched requests reject loudly.
 * - `jsonResponse(body, status)` / `deferred()` for loading-state tests.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, type RenderOptions, type RenderResult } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, Route, Routes, type RouteObject } from 'react-router-dom'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// Query client
// ---------------------------------------------------------------------------

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      },
      mutations: { retry: false },
    },
  })
}

export interface RenderWithProvidersOptions extends Omit<RenderOptions, 'wrapper'> {
  /** Initial URL, e.g. `/sessions?search=parser`. Defaults to `/`. */
  route?: string
  queryClient?: QueryClient
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

export function renderWithProviders(
  ui: ReactElement,
  { route = '/', queryClient = createTestQueryClient(), ...options }: RenderWithProvidersOptions = {},
): RenderResult & { queryClient: QueryClient; user: ReturnType<typeof userEvent.setup> } {
  const result = render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
    options,
  )
  return { ...result, queryClient, user: userEvent.setup() }
}

export interface RenderWithRouteOptions extends RenderWithProvidersOptions {
  /** Route pattern the element is mounted at, e.g. `/sessions/:sessionId`. */
  path: string
}

/** Render one element at a route pattern so `useParams`/`useLocation` work. */
export function renderWithRoute(
  element: ReactElement,
  { path, route = '/', ...rest }: RenderWithRouteOptions,
): RenderResult & { queryClient: QueryClient; user: ReturnType<typeof userEvent.setup> } {
  return renderWithProviders(
    <Routes>
      <Route path={path} element={element} />
      <Route path="*" element={<div>unmatched route</div>} />
    </Routes>,
    { route, ...rest },
  )
}

/** Render a full route table through a memory router (shell/page tests). */
export function renderAppRoutes(
  routes: RouteObject[],
  { route = '/', queryClient = createTestQueryClient() }: RenderWithProvidersOptions = {},
) {
  const router = createMemoryRouter(routes, { initialEntries: [route] })
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, queryClient, router, user: userEvent.setup() }
}

/** Provider-only wrapper for `renderHook`. */
export function wrapperFor(
  queryClient: QueryClient = createTestQueryClient(),
  route = '/',
): ({ children }: { children: ReactNode }) => ReactElement {
  return ({ children }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
    </QueryClientProvider>
  )
}

// ---------------------------------------------------------------------------
// Fetch mocking
// ---------------------------------------------------------------------------

export type ApiHandler = (request: Request) => Response | Promise<Response>

export interface MockApi {
  fetchMock: ReturnType<typeof vi.fn>
  calls: Request[]
  /** Assert a handler was hit at least once. */
  expectCalled: (key: string) => void
  restore: () => void
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/** A promise plus its resolvers, for testing loading/busy states. */
export function deferred<T>(): {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
} {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/**
 * Install a deterministic `fetch` mock.
 *
 * Keys are `"GET /api/summary"` style; the longest matching prefix wins, so
 * `"GET /api/sessions"` handles `/api/sessions?range=7d`. A handler may be a
 * `Response`, a plain value (wrapped by `jsonResponse`) or a (possibly async)
 * function returning either. Unmatched requests reject, which
 * `lib/api.ts` surfaces as `ApiError(0, 'Could not reach the local Pi Meter
 * server.')` because that module normalizes transport failures.
 */
export function mockApi(handlers: Record<string, ApiHandler | Response | unknown>): MockApi {
  const calls: Request[] = []
  const hit = new Set<string>()
  const keys = Object.keys(handlers)

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    // jsdom requires absolute URLs; the app calls fetch with relative paths.
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const url = new URL(raw, 'http://localhost').toString()
    const request = input instanceof Request && input.url === url ? input : new Request(url, init)
    calls.push(request)
    const method = (request.method || 'GET').toUpperCase()
    const path = new URL(url).pathname
    const key = keys
      .filter((candidate) => {
        const [candidateMethod, candidatePath] = candidate.split(' ')
        return (candidateMethod || 'GET').toUpperCase() === method && path.startsWith(candidatePath)
      })
      .sort((a, b) => b.length - a.length)[0]
    if (!key) {
      throw new Error(`unexpected fetch: ${method} ${path}`)
    }
    hit.add(key)
    const handler = handlers[key]
    // Await so async handlers may resolve either a Response or a plain value.
    const value = typeof handler === 'function' ? await (handler as ApiHandler)(request) : handler
    return value instanceof Response ? value : jsonResponse(value)
  })

  vi.stubGlobal('fetch', fetchMock)

  return {
    fetchMock,
    calls,
    expectCalled: (key: string) => {
      if (!hit.has(key)) throw new Error(`expected ${key} to be requested; calls=${calls.map((c) => c.url).join(', ')}`)
    },
    restore: () => vi.unstubAllGlobals(),
  }
}
