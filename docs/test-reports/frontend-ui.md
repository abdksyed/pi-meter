# Worker 6 — frontend components & pages test report

Repo: `/mount/Data2/syed/coding/pi-meter`
Scope: `frontend/src/components/**/*.test.tsx` and `frontend/src/pages/*.test.tsx` only.
No production file, shared helper/fixture, config, lockfile, or `lib/`/`hooks/` test was
created or modified. Verified with `find src -newermt '2026-10-22 21:40' -type f`: the only
touched files are the 20 new `*.test.tsx` suites listed below.

## Commands run

```bash
cd frontend
npm run typecheck            # = npx tsc --noEmit  -> clean (TYPECHECK_OK)
npx vitest run               # whole frontend suite (incl. Worker 1 harness test)
npx vitest run src/components src/pages   # Worker 6 scope only
npx vitest run src/components src/pages --coverage   # coverage probe
```

## Results (last runs)

| Command | Files | Tests | Passed | Failed | Skipped |
| --- | --- | --- | --- | --- | --- |
| `npx tsc --noEmit` | – | – | clean | 0 | – |
| `npx vitest run` (all) | 21 | 225 | 217 | 8 | 0 |
| `npx vitest run src/components src/pages` | 20 | 212 | 204 | 8 | 0 |

`beforeEach` in the shared setup stubs `fetch` to reject, so no test reaches the network;
every suite installs `mockApi(...)` handlers. No test reads real Pi session data or the live
SQLite cache. No `it.skip`, `it.todo`, or conditional/`xfail` tests exist in the suites.

## Files added (20 suites, 212 tests)

| File | Tests | Coverage focus |
| --- | --- | --- |
| `src/components/AppShell.test.tsx` | 18 | SidebarNav active state + links, MobileNavBar, AppShell skip link/main landmark, StatusBar healthy/error/db-error, SyncStatus relative + fallback, RefreshButton success/removal/failure/409/busy, EmptyState, ErrorState, Panel, PanelState branches |
| `src/components/dashboard/CostBreakdown.test.tsx` | 5 | legend shares computed independently, recorded-total is *not* used, empty/loading/error+retry |
| `src/components/dashboard/DateRangeSelector.test.tsx` | 6 | segmented presets, custom dialog validation, Escape/Cancel, custom label, compact select + custom |
| `src/components/dashboard/MetricStrip.test.tsx` | 2 | values, exact titles, `aria-busy` + em-dash placeholders |
| `src/components/dashboard/Breakdowns.test.tsx` | 5 | model/project ordering + `buildSessionsHref` links (7d and custom bounds), empty/loading/error |
| `src/components/dashboard/RecentSessions.test.tsx` | 4 | rows, child links, first-message/id fallback, multi-model `+1`, empty/loading/error, no-model dash |
| `src/components/dashboard/SummaryHero.test.tsx` | 4 | cost/tokens/session count, previous-period delta, loading, error+retry |
| `src/components/dashboard/UsageChart.test.tsx` | 4 | `role=img` chart alternative, data table, cost↔tokens toggle, series toggles (last series cannot be hidden), empty/zero/loading/error |
| `src/components/session/SessionTotalsRail.test.tsx` | 22 | exact section order (cost→composition→breakdown→telemetry→models→sub-agents→source), cumulative/own vs combined cost, token meter, breakdown table (Reasoning has no billed cost), telemetry, models, collapsed sub-agents + child href, inline variant; SessionHeader, SessionCostPanel, ParseWarningsBanner, SessionDetailSkeleton, clipboard copy |
| `src/components/sessions/SessionControls.test.tsx` | 10 | SearchField type/clear/announce/"`/`" focus guard/Escape, FilterSelect, FilterChips, ModelBadge, Pagination windows/boundaries/loading/paging |
| `src/components/sessions/SessionFilters.test.tsx` | 9 | filter options + counts, unknown-cwd retention, chips + clear-all, search announce, min-cost disclosure, compact range, SessionsSummary totals/project shares/average/filter note/loading |
| `src/components/sessions/SessionTable.test.tsx` | 8 | rows/links/model/cost, `aria-sort` + sort callbacks, parse-error/active status dots, filtered/unfiltered empty, error+retry, loading; SessionList cards |
| `src/components/transcript/TranscriptEntry.test.tsx` | 23 | user/assistant blocks, thinking disclosure, copy + announce, error strip, orphan results, empty output, system/metadata/unknown/custom-message blocks, system prompt collapsed + search-excluded, compaction/branch summary/file lists, context edit jump link, standalone usage, unknown content, image placeholder vs supported image, transcript empty/search-empty/filter-empty states, EntryErrorBoundary |
| `src/components/transcript/TranscriptControls.test.tsx` | 28 | CopyButton success/failure/disabled, CollapsibleCode preview limits/copy original text/ANSI strip/highlight, CollapsibleSection, HighlightedText, EntryDetails, EntryUsageDetails (Reasoning uncosted), ToolCallBlock, ToolResultBlock long results + failed results, MessageContent, ThinkingBlock, UnknownContentBlock, parser pairing invariants |
| `src/components/transcript/TranscriptToolbar.test.tsx` | 10 | filter counts/pressed state, expand/collapse/latest actions, search status text, Enter/Shift+Enter/Escape, "`/`" focus, clear |
| `src/pages/DashboardPage.test.tsx` | 12 | populated panels, per-panel failure isolation, global empty, filtered-not-global empty, range change refetch, custom range, chart metric switch, chip removal, loading skeleton, total-failure shell |
| `src/pages/SessionsPage.test.tsx` | 15 | desktop table + summary + pagination, mobile card list, debounced search (250 ms) → URL + request, project filter + chips, pagination/page size, sort + `aria-sort`, empty index, filtered empty, error+retry, out-of-range page clamp, row navigation, header refresh/status |
| `src/pages/SessionDetailPage.test.tsx` | 20 | skeleton, 404 (no retry) vs retryable error, transport error, header/warnings/rail/event types, filter→URL, All removes param + announce, tools-only and errors-only filtering, filter empty + show-all, search from URL + next/prev/clear, search-empty, expand/collapse all + announce, single disclosure toggle, latest control disabled at bottom + floating pill when scrolled, no-entries, warnings list, scoped search, `#entry` deep link |
| `src/pages/SettingsPage.test.tsx` | 2 | placeholder heading/description, no fake configuration controls |
| `src/pages/NotFoundPage.test.tsx` | 4 | production `*` route inside the shell, `/settings` route, sidebar links + navigation, skip link/mobile bar |

Fixtures: only `src/test/fixtures.ts` and `src/test/helpers.tsx` public exports are used
(`renderWithProviders`, `renderWithRoute`, `renderAppRoutes`, `mockApi`, `jsonResponse`,
`createTestQueryClient`, plus the `*Fixture()` builders). No new shared fixtures were added —
the raw-detail cases needed for unknown/custom/branch-summary/context-edit entries are built
locally in `SessionDetailPage.test.tsx` from the exported `rawEntry` builder.

## Failing tests — actual requirement gaps (production not edited)

All 8 failures are deliberate regression tests for requirements in `test_plan.md`; they are
not weakened assertions and have no skip/xfail markers. Reproduce with
`cd frontend && npx vitest run`.

| ID | Failing test | Requirement | Observed production behaviour |
| --- | --- | --- | --- |
| D1 | `TranscriptEntry … renders each tool call exactly once` | One rendered execution per call/result pair | Every tool execution is mounted twice per assistant message — once inline inside `.pm-entry__body` and again in `.pm-entry__tools` — producing duplicate `[aria-label="Tool call bash"]`/`Tool result` sections and duplicate DOM `id="entry-N-tool-M"` (invalid HTML, breaks anchors). `AssistantMessageBlock` renders calls in `MessageContent` and then re-renders the same `executions` in the tools block because `rendered` is never consulted for the inline map order. |
| D2 | `TranscriptToolbar … gives the search input an accessible name` | Keyboard/a11y: search controls must be labelled | The transcript search `<input>` only has `placeholder="Search transcript…"`; no `<label>`, `aria-label`, or `aria-labelledby`. Screen readers announce an unnamed edit field. (Other tests locate it by placeholder because of this gap.) |
| D3 | `AppShell … keeps the visible label inside the accessible name` | WCAG 2.5.3 label-in-name; `EmptyState`/`RefreshButton` compose | `DashboardPage`/`SessionsPage` pass `label="Refresh index"` to `RefreshButton`, but the component hardcodes `aria-label="Refresh session index"`, so the visible words are not part of the accessible name and the two header/empty-state buttons become indistinguishable by voice. |
| D4 | `SessionsPage … clears the search filter from the URL` and `… through Clear all` | Filter reset must clear URL + request (`test_plan.md`: "filter reset behavior") | `useSessionFilters.clearSearch()`/`clearFilters()` set local `searchInput` and strip `q` from the params, but the `useEffect` that syncs `searchInput`→URL writes the stale query straight back. Verified in isolation with `renderHook(useSessionFilters)` inside `MemoryRouter('/sessions?q=beta')`: URL stays `?q=beta` after any wait. Search can never be cleared while a `q` is present, and the request keeps the filter. |
| D5 | `SessionTotalsRail … reports sub-agent calls rather than mapped child sessions` | `test_plan.md`: "The UI currently labels the number of mapped children as sub-agent calls … Add a requirement test for actual invocation counts" | `Execution telemetry > Sub-agent calls` prints `relatedSessions.length`. With one tool call and five mapped children it shows **5** instead of ≤1. The API exposes no invocation count, so this is a known product gap (report-only, not certified as true invocation counting). |
| D6 | `AppShell → StatusBar … advertises the backend default port` | `test_plan.md` deployment: 8743 vs 8787 consistency | `StatusBar` (and `vite.config.ts`) hardcode `127.0.0.1:8743` while `app/config.py` defaults to `8787`. A passing companion assertion documents the current `8743` string. Expected source of truth must be decided before changing production. |
| D7 | `DashboardPage … offers one page-level error with a retry when every panel fails` | "Dashboard loading, failure, empty, populated … states" | With every endpoint failing, the page renders six independent panel alerts and no single page-level failure message/retry; the header also silently falls back to "Local Pi session index". |

Known-gap note for D5 (per the task brief): `Sub-agent calls` is **not** certified as a real
invocation count. The passing test
`reports execution telemetry counts, including sub-agent calls as mapped children` documents
the current mapped-children behaviour, and D5 asserts the requirement it violates.

## Fixture/behaviour assumptions worth recording

* Dashboard/sessions pages are rendered with `vi.setSystemTime('2026-01-15T09:00:00.000Z')`
  (fake timers with `shouldAdvanceTime`); assertions that depend on "now" (relative times,
  active session dots, 7d/30d labels) rely on it.
* `useSessionDetail` retries once, so 404/500/transport tests await with a 4 s timeout; the
  500/transport cases take ~1 s each.
* `lib/clipboard.ts` requires `window.isSecureContext` before using the async clipboard; tests
  set it and spy `navigator.clipboard.writeText` *after* `userEvent.setup()` (which installs
  its own clipboard stub). `HTMLDialogElement.prototype.showModal` is stubbed for the image
  dialog because jsdom lacks it.
* The shared `IntersectionObserver` stub never fires, so `useJumpToLatest` starts "at bottom";
  the floating jump pill is tested by driving the observer callback and a scroll event
  explicitly.
* `RecentSessions` renders the model list title as `model, model` (no provider prefix) —
  asserted accordingly, not as an expectation of `provider/model`.

## Coverage (Worker 6 scope probe)

`npx vitest run src/components src/pages --coverage` reports the panel/transcript/rail
components at high line coverage; `src/pages/*`, `src/lib/*`, `src/hooks/*` remain low because
they belong to Workers 5/7 and are exercised only through page tests here. No coverage
thresholds were set (consistent with the infrastructure handoff).

## Defects summary for the parent agent

Production fixes are **not** included (out of scope). Suggested owners:
D1 `components/transcript/AssistantMessageBlock.tsx`; D2 `components/transcript/TranscriptSearch.tsx`;
D3 `components/RefreshButton.tsx`; D4 `hooks/useSessionFilters.ts`; D5
`components/session/SessionTotalsRail.tsx` (+ API invocation count); D6
`components/StatusBar.tsx` + `vite.config.ts` (+ decide backend port source of truth);
D7 `pages/DashboardPage.tsx`.
