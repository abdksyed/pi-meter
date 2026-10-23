# Pi Meter test plan

## Scope and current status

Test implementation has started. Shared infrastructure and frontend page/component suites exist. Dedicated backend suites, frontend library/hook suites, and application-level browser regressions are still pending.

This update reconciles the completed worker reports with files on disk. Counts below are the workers' last reported runs, not new verification runs. No tests or production fixes were executed during this documentation update.

## Handoff status

| Area | Status | Evidence and remaining work |
| --- | --- | --- |
| Worker 1, shared infrastructure | Implemented and smoke-tested | pytest, Vitest, Playwright, synthetic corpus, isolated app/server fixtures, package scripts |
| Worker 2, parser and usage | Not started | Launch failed before implementation. No `tests/unit/test_parser*.py` files exist |
| Worker 3, database and sync | Not started | Launch failed before implementation. Dedicated integration suites are absent |
| Worker 4, ranges/settings/API/aggregation | Not started | Launch failed before implementation. Dedicated unit/integration suites are absent |
| Worker 5, frontend libraries/hooks | Not started | Launch failed before implementation. No library/hook test files exist |
| Worker 6, frontend components/pages | Implemented, failures unresolved | 20 files and 212 tests. Last worker run had 204 passed and 8 failed |
| Worker 7, browser regressions | Not started beyond infrastructure smoke | Launch failed. Only `frontend/e2e/harness.spec.ts` exists with 2 smoke tests |
| Combined verification and production fixes | Pending | Parent agent stopped after worker completion at user request. No combined acceptance run or fixes followed |

Five workers failed to launch because tmux had no space for new panes. Their assignments were not executed. Do not interpret launch attempts as completed work.

### Last reported results

| Command | Result | Source |
| --- | --- | --- |
| `uv run pytest -q` | 28 passed, infrastructure tests only | Worker 1 |
| `uv run pytest --cov=app --cov-report=term-missing` | 81% reported coverage at the infrastructure stage | Worker 1, not comprehensive backend validation |
| `cd frontend && npm run test:run` | 217 passed, 8 failed, 0 skipped across 21 files | Worker 6, includes 13 shared-helper tests |
| `cd frontend && npm run typecheck` | Passed | Workers 1 and 6 |
| `cd frontend && npm run test:e2e` | 2 passed, harness smoke only | Worker 1, before Worker 6 completed |

A high coverage number from smoke tests does not prove parser edge cases, accounting correctness, or endpoint contracts. No full application browser or layout acceptance run has been completed.

### Durable reports

Reports have been copied into the repository so the next session does not depend on temporary files.

- `docs/test-reports/infrastructure.md` contains installed tooling, fixture contracts, commands, and isolation details.
- `docs/test-reports/frontend-ui.md` contains the 20 test files, coverage description, failing test names, and seven reported defects.
- `tests/fixtures/README.md` is the shared fixture contract. Inspect the actual helpers before writing tests.

### Open failures and decisions

Eight frontend assertions fail across seven reported defects. Treat these as reported findings that the next session must reproduce and review. An agent-written expectation is not by itself an approved product requirement.

| ID | Finding | Location | Next action |
| --- | --- | --- | --- |
| D1 | Tool calls/results render twice with duplicate DOM IDs | `components/transcript/TranscriptEntry.test.tsx` | Reproduce and fix duplicate execution rendering in `AssistantMessageBlock`. Retain orphan-result coverage |
| D2 | Transcript search lacks an accessible input name. The count assertion also expects `role=status` | `components/transcript/TranscriptToolbar.test.tsx` | Add an accessible input name. Review live-region semantics before deciding whether an explicit status role is required |
| D3 | Refresh button accessible name differs from visible label | `components/AppShell.test.tsx` | Make the visible label part of the accessible name, including the empty-state button |
| D4 | Removing the search chip or clearing filters restores stale query text | `pages/SessionsPage.test.tsx`, two failures | Highest priority. Reproduce URL and debounce behavior, then fix stale query synchronization |
| D5 | Sub-agent calls displays mapped child count rather than invocation count | `components/session/SessionTotalsRail.test.tsx` | User requested calls. Define and expose a real invocation count. Do not certify the current mapped-child count as calls |
| D6 | Status bar hardcodes port 8743 while backend default is 8787 | `components/AppShell.test.tsx` | Prefer the actual configured/origin endpoint. Check the Vite development proxy too. A hardcoded 8787-only test needs review for custom ports |
| D7 | A total dashboard failure produces repeated panel alerts and retries | `pages/DashboardPage.test.tsx` | UX decision pending. Decide whether to require one page-level error or preserve independent panel errors before changing behavior or assertions |

No production fixes were made by the test workers. Do not hide these failures with skips, weakened assertions, or blanket test rewrites. Confirm semantics first, then fix the product or document an approved test correction.

Additional infrastructure findings remain unverified by dedicated regressions.

- The infrastructure worker reports that `/api/sessions` omits zero-usage sessions through an inner join, while `/api/filters` counts them. Worker 4 must reproduce this with a minimal fixture and confirm expected inclusion semantics.
- Cost storage rounds to micro-units and loses sub-micro precision. Tests must describe the present conversion and keep the precision/product decision separate.
- Hardcoded relationship mapping remains temporary. Neither the existing UI suite nor the harness smoke tests prove general parent-child discovery.
- Recharts may warn about zero-sized containers under jsdom. Use browser geometry checks for actual rendering and do not suppress unrelated warnings globally.
- Actual scrolling, totals-panel spacing, search-icon clearance, keyboard interaction across viewports, and unsafe-content behavior in a real browser are still pending despite component-level coverage.

### Next-session checklist

1. Read this file, both durable reports, `tests/fixtures/README.md`, and the actual test helpers.
2. Run the current backend and frontend suites to reproduce the baseline. Expect the eight reported frontend failures, but record any changed counts or new failures.
3. Check tmux capacity before delegation. Use small batches or sequential workers rather than repeating failed pane launches. Do not terminate unrelated panes or sessions.
4. Resume Workers 2 through 5 and 7 using the ownership table below. Do not regenerate Worker 1 infrastructure or Worker 6's existing suites.
5. Give one owner any shared helper/config changes. Have each worker report exact commands, counts, failures, and changed files.
6. Reproduce and resolve approved D1 through D6 fixes in a separate production-fix phase. Review D7 and any overly specific accessibility/port assertions before implementation.
7. Build the frontend before browser tests. Add real geometry and scrolling assertions, not jsdom-only claims about CSS.
8. Run the combined suites, coverage, typecheck, build, and browser checks after merging. Update this status section with actual results.

No workers are launched by this documentation task.

All tests must use synthetic sessions and temporary databases. Never read, modify, or delete the user's real Pi sessions or live SQLite cache. Avoid network services and paid model calls. App tests must not launch real sub-agents.

The suite must distinguish passing behavior from known defects. Add a failing regression for an approved product requirement rather than weakening an assertion to match a bug. Report production fixes separately from test implementation.

## Installed tooling and target layout

- Use pytest, pytest-cov, and HTTPX for Python unit and API integration tests.
- Use Vitest, jsdom, React Testing Library, user-event, and jest-dom for TypeScript and component tests.
- Use Playwright for browser tests against the built frontend and an isolated backend.
- Use deterministic clocks and explicit timezones. No test may depend on today's date, the workstation timezone, or live session counts.
- Keep fixture costs as decimal strings in fixture builders and calculate expected integer micro-units independently of application helpers.
- Use Chromium for the required browser smoke run. Add Firefox and WebKit runs once the browser suite is stable.

This tree combines existing infrastructure with pending target files. The handoff table, not this tree, determines what is complete. JSONL files are generated in temporary directories by builders rather than committed from real sessions.

```text
tests/
  conftest.py
  fixtures/
    jsonl.py
    corpus.py
    README.md
    test_corpus_contract.py
    test_infrastructure_smoke.py
    test_serve_test_app.py
  unit/
    test_parser.py
    test_parser_content.py
    test_parser_usage.py
    test_ranges.py
    test_formatting.py
    test_config.py
  integration/
    test_database.py
    test_sync.py
    test_aggregation.py
    test_relationships.py
    test_api.py
    test_static.py
frontend/
  vitest.config.ts
  src/test/
    setup.ts
    fixtures.ts
    helpers.tsx
  src/lib/*.test.ts
  src/hooks/*.test.tsx
  src/components/**/*.test.tsx
  src/pages/*.test.tsx
  e2e/
    harness.spec.ts
    dashboard.spec.ts
    sessions.spec.ts
    transcript.spec.ts
    layout.spec.ts
    deployment.spec.ts
  playwright.config.ts
scripts/
  serve-test-app.py
```

## Isolation requirements

- Create fixture JSONL under pytest's temporary directory. Point `Settings.sessions_dir`, `db_path`, and `frontend_dist` at test-owned paths.
- Verify fixture source bytes remain identical after sync, refresh, and API reads.
- Exercise FastAPI lifespan with a context-managed client and dispose engines after each test.
- `app/main.py` currently creates a global app at import time. Set temporary environment paths before importing that module, or agree on a small factory refactor first. Importing a test must not initialize the real database.
- Clear cached settings between environment configuration tests.
- Reset TanStack Query clients and browser storage between tests. Disable retries in component test providers.
- Start the browser backend with a unique temporary database and fixture session directory. Use a separate loopback port and terminate only processes started by the test run.
- Never run `deploy.sh` against the developer's environment as part of the automated suite.

## Shared fixture corpus

The shared corpus and builders are implemented in `tests/fixtures/`. Consume the existing MAIN, BETA, PARENT, METADATA, LONG, and EDGE cases instead of rebuilding them. Add targeted cases only where needed.

The full corpus deliberately contains 19 files, 17 indexed sessions, and two unparseable files. Its expected sync status is `partial`. Use the `FULL_VARIANT_*` constants rather than assuming a clean full-corpus sync. MAIN expects 10,725 total tokens and 19,409 total cost micro-units. Its recorded total intentionally differs from component sums. BETA contains identical usage records on separate entries that must both count.

The relationship corpus has five mapped children and three decoys. `EXCLUDED_RELATED_SESSION_IDS` is currently an empty placeholder. Worker 4 must create isolated cases for the exact excluded IDs below, rather than assuming that placeholder already covers the bug report.

```text
01a15e80-b38b-7678-a16b-c2fdf189d128
01a15e86-155b-719d-8234-41d992d5faa1
01a16039-8eed-7712-9c93-6a2228eb6fb5
```

Review existing builders against this coverage checklist and fill remaining gaps.

- Empty directory, empty file, header-only file, and a file with malformed lines between valid records.
- Two sessions in different directories with multiple models and timestamps around midnight.
- A full conversation with text, thinking, images, tool arguments, successful tool results, failed tool results, and orphan results.
- Every supported metadata event, unknown events, unknown roles, and unknown content blocks.
- Usage on assistant messages and supported standalone records, repeated usage payloads, cache tokens, reasoning tokens, and missing optional fields.
- Zero usage, zero cost, fractional costs below one micro-unit, and large token counts.
- A long transcript and a long unbroken tool output string for scrolling and overflow checks.
- HTML and Markdown payloads containing script tags, event attributes, unsafe link schemes, and terminal escape sequences.
- A parent session that calls a sub-agent plus unrelated UUIDs in user text, directory listings, copied source, and tool output.
- Date fixtures spanning DST changes, UTC boundaries, leap day, and equal start/end timestamps.

## Backend unit coverage

### Parser and content

Target `app/services/parser.py`, `parser_models.py`, and `parser_content.py`.

- Verify all three parser entry points produce equivalent normalized results.
- Preserve raw file order, IDs, parent IDs, raw JSON, and unrecognized payloads.
- Verify header parsing, missing headers, invalid headers, malformed JSON diagnostics, and warning limits.
- Resolve canonical entry timestamps before nested message timestamp fallbacks. Cover invalid timestamps.
- Check model and thinking changes, compaction, context edits, branch summaries, labels, custom messages, and session names.
- Verify title precedence, 120-character first-user fallback, cleared names, and untitled sessions.
- Pair tool calls and results by call ID without dropping orphan results or counting results twice.
- Verify count fields, search text, duration, model distribution, and normalization of Unicode and multiline content.

### Usage and cost accounting

Target `app/services/parser_usage.py` and usage handling in sync.

- Count each logical usage record once and document deduplication boundaries.
- Treat reasoning as a subset of output. Never add it to output or total tokens a second time.
- Keep recorded total cost separate from component sums when source values differ.
- Verify Decimal conversion to integer micro-units at rounding boundaries. Record the current precision loss explicitly.
- Cover missing costs, missing token fields, cache read/write, zero values, and multiple models.
- Verify frontend reasoning rows do not invent a separately billed reasoning cost.

### Ranges, formatting, and settings

Target `app/services/ranges.py`, `formatting.py`, and `app/config.py`.

- Verify today, 7d, 30d, all, and custom ranges with a fixed clock.
- Check local midnight conversion, inclusive/exclusive boundaries, DST transitions, and bucket ordering.
- Verify hour/day/week/month grouping where supported and consistent zero-fill behavior.
- Reject malformed or reversed custom ranges and unsupported grouping values.
- Verify token, currency, duration, byte, zero, and missing-value formatting.
- Verify environment prefix, path expansion, relative path resolution, numeric bounds, and loopback-only host validation.

## Database, sync, and aggregation

Target `app/db.py`, `models.py`, `app/services/sync.py`, and `aggregation.py`.

- Verify schema initialization, version handling, foreign keys, cascade deletion, and expected indexes.
- Verify recursive discovery, initial import, unchanged second sync, changed-file replacement, append behavior, deletion, and moved files.
- Verify duplicate public IDs and malformed files do not silently overwrite unrelated sessions. Document the intended resolution policy before fixing ambiguity.
- Check failures leave previous valid data consistent and later refreshes recover.
- Verify refresh locking, lock release after failure, and sync history retention.
- Cross-check summaries, time buckets, model totals, project totals, and session totals against independent fixture arithmetic.
- Verify range filters use entry usage timestamps and whole-session detail remains whole-session.
- Cover search, cwd/model filters, sorting, pagination boundaries, and empty results.
- Ensure global totals do not double-count child costs when parent detail includes a combined total.

### Relationship regressions

- UUID mentions alone must never create a parent-child relationship.
- A session with no sub-agent calls must not display unrelated sessions as children.
- Child cost must be included once in combined detail cost. Own-session usage and cost stay unchanged.
- Missing child files must not cause errors. Child links must route to their own IDs.
- The current relationship implementation is a hardcoded map in `aggregation.py`. Test it as a documented temporary implementation, not as a general discovery mechanism.
- Verify the three excluded IDs supplied in the bug report remain absent for parent `01a16174-80c5-7088-aefb-de5e5b743c5f`.
- Verify the five explicitly mapped IDs are included when matching rows exist, without depending on the real files.
- The UI currently labels the number of mapped children as sub-agent calls. Add a requirement test for actual invocation counts and report this distinction as a known gap. Do not silently treat unique children and tool calls as equivalent.

## API and static serving

Cover every endpoint through `create_app` with isolated settings.

- Health and refresh endpoints, including successful refresh, concurrent refresh conflict, and failed refresh reporting.
- Summary, timeseries, by-model, by-project, sessions, session detail, entries pagination, and filters.
- Verify camelCase fields, UTC ISO timestamps, numeric costs, status codes, and stable empty-response shapes.
- Verify supported query aliases, invalid query values, unknown sessions, and pagination limits.
- Verify detail returns complete transcript entries and correct related/combined cost fields.
- Verify SPA fallback for deep session routes, local font assets, unknown API paths, missing frontend builds, and traversal attempts.
- Check CORS is absent by default and restricted to the configured development origin when enabled.
- Use OpenAPI as an endpoint checklist, but assert meaningful response values rather than only status 200.

## Frontend unit and component coverage

### Data and hooks

- Verify API adapters and normalization for wrapped and direct responses, camelCase fields, missing optional fields, and unknown content.
- Cover transcript item ordering, tool pairing, filtering, search matching, highlight escaping, and active-match navigation.
- Verify URL state parsing, default date ranges, filter reset behavior, and query keys.
- Cover manual refresh invalidation and busy states. Assert there is no polling or filesystem watch behavior.
- Check expand/collapse persistence, clipboard success/failure, jump-to-latest visibility, and listener cleanup.
- Verify safe Markdown and ANSI rendering. Unsafe content must not execute or create executable links.

### Pages and panels

- Dashboard loading, failure, empty, populated, and custom-range states.
- Session filtering, debounced search, pagination, row navigation, and responsive cards.
- Session detail loading, unknown session, parse warnings, all event types, and entry error boundaries.
- Tool result preview limits, argument disclosures, copy buttons, expand/collapse all, and errors-only filters.
- Totals rail order must be cumulative cost, token composition, cost/volume breakdown, telemetry, models, collapsible sub-agents, then source file.
- Sub-agents start collapsed, expose accessible disclosure controls, and link to the correct session route.
- Settings, unknown routes, sidebar links, refresh controls, and status indicators.

## Browser regressions

Run against real API responses from the synthetic corpus, not only mocked requests.

- Open dashboard, change range, open a session, search its transcript, expand a tool result, and navigate back.
- Refresh after changing a fixture session through a test-controlled operation. Confirm new usage appears only after manual refresh.
- Open a child link and confirm the child title and ID, not the previous parent's data.
- Measure search input icon/text separation with entered text and placeholder text.
- Check totals rail padding and section separation at widths 1440, 1280, 1024, 900, 768, and 390 pixels. Capture screenshots and inspect bounding boxes.
- At desktop widths, scroll the main scroll container to its maximum. Assert repeated downward scrolling does not increase scroll height or reveal a second blank page below the footer.
- Measure the last visible transcript entry, sentinel, grid bottom, main container bottom, and footer. Allow documented bottom padding, not a viewport-sized empty gap.
- Repeat the end-of-conversation check after collapsing long content, changing filters, opening sub-agents, and using jump-to-latest.
- At mobile widths, verify document scrolling, no horizontal overflow, usable totals disclosures, and reachable navigation.
- Verify keyboard-only search, disclosures, filters, pagination, and child links. Check visible focus and reduced-motion behavior.
- Run accessibility checks with a browser accessibility tool if added by the infrastructure owner, then manually inspect chart alternatives and disclosure names.

## Deployment and operational checks

- Run shell syntax validation for `deploy.sh` and `scripts/build-frontend.sh`.
- Verify dependency checks, build failure propagation, directory independence, and foreground execution using controlled command stubs rather than installing packages in a test.
- Verify loopback binding, environment port override, startup sync, shutdown, and deep-link reload with an isolated process.
- Check all shipped local fonts load without external font requests.
- Record the current frontend development proxy and status display using 8743 while the backend default is 8787. Add a consistency regression and decide the expected source of truth before changing production code.
- Record the current Vite chunk-size warning separately from functional failures.
- Run a bounded long-transcript load and scroll check. Record fixture entry count, timings, and browser version rather than setting an arbitrary performance gate.

## Parallel implementation assignments

Resume only pending assignments in the next implementation session. Worker 1 is complete and Worker 6 has delivered suites with unresolved failures. Do not launch agents merely to test sub-agent accounting. All test runs use synthetic records.

| Worker | Owned files | Deliverable |
| --- | --- | --- |
| 1 | `pyproject.toml`, `uv.lock`, `tests/conftest.py`, `tests/fixtures/`, `frontend/package.json`, `frontend/package-lock.json`, `frontend/vitest.config.ts`, `frontend/src/test/`, `frontend/playwright.config.ts`, `scripts/serve-test-app.py`, test ignore entries | Shared tooling, deterministic fixtures, isolated app factory, documented commands |
| 2 | `tests/unit/test_parser*.py` | Parser, content, usage, and accounting coverage |
| 3 | `tests/integration/test_database.py`, `test_sync.py` | Index lifecycle, failures, locking, and source immutability |
| 4 | Remaining backend test files | Ranges, settings, aggregation, relationships, API, and static serving |
| 5 | `frontend/src/lib/*.test.*`, `frontend/src/hooks/*.test.*` | Normalization, API data, transcript state, search, and formatting |
| 6 | `frontend/src/components/**/*.test.*`, `frontend/src/pages/*.test.*` | Page and component interaction coverage |
| 7 | `frontend/e2e/` | Browser workflows, layout regressions, accessibility, and isolated deployment checks |

Worker 1's fixture contracts are already established. Workers 2 through 5 can proceed in small parallel batches if tmux has capacity. Worker 7 can use the existing isolated server. Assign an infrastructure maintainer before allowing shared configuration or lockfile edits. Other workers request shared fixture additions instead of editing helpers concurrently.

Current fixture names include `settings`, `make_settings`, `app`, `client`, `seeded_client`, `db`, `session_factory`, `sync_service`, `corpus`, `synced_corpus`, `write_session`, `parse_records`, `parse_text`, `frontend_dist`, `frontend_client`, `file_hashes`, and `assert_files_unchanged`. Read their implementations for exact signatures.

Frontend helpers include `createTestQueryClient`, `renderWithProviders`, `renderWithRoute`, `renderAppRoutes`, `wrapperFor`, `mockApi`, `jsonResponse`, and `deferred`. The default fetch stub rejects unexpected requests. Keep those isolation guarantees.

Each worker reads this plan and its production modules before coding. Keep production fixes small and report them to the parent agent. Reports must list files changed, commands run, passed/failed/skipped counts, unresolved defects, and fixture assumptions. Never claim a check passed without running it.

## Execution commands

These commands are installed now. The current frontend suite is expected to fail until the reported regressions are reviewed and resolved.

```bash
uv sync
uv run pytest -q
uv run pytest tests --cov=app --cov-report=term-missing
bash -n deploy.sh scripts/build-frontend.sh
cd frontend
npm ci
npm run test:run
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

The targeted commands below become useful once the pending backend files exist. The `tests/unit/` and `tests/integration/` directories do not exist at this handoff.

```bash
uv run pytest tests/unit -q
uv run pytest tests/integration -q
cd frontend
npm run test:run -- src/components src/pages
npm run test:run -- src/lib src/hooks
npm run test:coverage
```

The browser config uses a dedicated loopback port, 8901 by default, and `reuseExistingServer=false`. The standalone isolated server defaults to 8899. Do not point browser tests at the real app or reuse a foreign listener.

```bash
uv run python scripts/serve-test-app.py --port 9123
```

The isolated server needs an existing `frontend/dist` build. Its fixture dates are fixed, so browser tests must select an appropriate range such as all time rather than assume the default recent range contains those sessions.

## Completion criteria

- All endpoints and supported JSONL event categories have at least one meaningful assertion.
- Independent fixture totals agree across parser, SQLite, API, and visible UI values.
- No production session files or live database were touched by tests.
- The false-child attribution, cramped totals rail, search icon overlap, and trailing blank-scroll regressions have explicit coverage.
- All required suites pass, or failures are listed with reproducible commands and an owner. No silent skips for known bugs.
- Browser screenshots and layout measurements are reviewed at desktop and mobile widths.
- Coverage reports identify untested branches. Set numerical coverage thresholds after the first measured run rather than inventing a target now.
- Keep this file updated with actual commands, suite results, known gaps, and approved changes to the temporary relationship model.
