# Test infrastructure handoff (Worker 1)

Status: **complete and verified**.
Repo: `/mount/Data2/syed/coding/pi-meter`
Owner scope: shared tooling, fixtures, frontend test harness, isolated E2E server.
No production module under `app/` or `frontend/src/{lib,hooks,components,pages}` was modified.

---

## 1. What was installed

### Python (`pyproject.toml` + `uv.lock`)

`[dependency-groups].dev`:

| Package | Version | Why |
| --- | --- | --- |
| `pytest` | 9.1.1 | runner |
| `pytest-cov` | 7.1.0 | coverage |
| `httpx` | 0.28.1 | async/ASGI client for API tests |
| `httpx2` | 2.16.0 | backend for Starlette 1.9 `TestClient` (avoids its deprecation warning) |

`[tool.pytest.ini_options]`: `testpaths = ["tests"]`, `pythonpath = ["."]`,
`--strict-markers --strict-config --import-mode=importlib -ra`,
markers `slow` and `e2e`, `filterwarnings = ["error::DeprecationWarning:app.*"]`.
`[tool.coverage.run]`: `source=["app"]`, `branch=true`, omits `app/__main__.py`.
`[tool.coverage.report]`: `show_missing`, standard exclusions.
No numeric coverage threshold is set (the plan says to set it after a measured run;
current measured total with only the infrastructure tests is **81 %**).

### Frontend (`frontend/package.json` + lockfile)

`devDependencies` added: `vitest@^3.2.7`, `jsdom@^30`, `@testing-library/react@^16`,
`@testing-library/dom@^10`, `@testing-library/user-event@^14`,
`@testing-library/jest-dom@^7`, `@vitest/coverage-v8@^3`, `@playwright/test@^1.64`.
`@vitejs/plugin-react`, `vite`, `typescript` untouched. Chromium installed at
`~/.cache/ms-playwright` (headless shell 156).

`scripts`:

| Command | Meaning |
| --- | --- |
| `npm run test` | Vitest watch mode |
| `npm run test:run` | Vitest single run (CI form) |
| `npm run test:coverage` | Vitest run + V8 coverage into `frontend/coverage` |
| `npm run test:e2e` | Playwright (starts/stops its own isolated server) |
| `npm run test:e2e:ui` | Playwright UI mode |
| `npm run typecheck`, `npm run build`, `npm run dev`, `npm run preview` | unchanged |

### `.gitignore`

Test-only additions: `coverage.xml`, `frontend/playwright/.cache/`.
Already present and reused: `.pytest_cache/`, `.coverage*`, `htmlcov/`,
`frontend/coverage/`, `frontend/playwright-report/`, `frontend/test-results/`.

---

## 2. Commands (exact, all verified)

```bash
# backend
uv sync
uv run pytest -q                                   # 28 passed
uv run pytest tests/unit -q                        # Workers 2-4
uv run pytest tests/integration -q                 # Workers 3-4
uv run pytest --cov=app --cov-report=term-missing  # 81 % right now

# frontend unit/component
cd frontend
npm run test:run          # 13 passed (harness self-check)
npm run test:coverage
npm run typecheck

# browser
npm run build             # required before e2e (frontend/dist)
npm run test:e2e          # 2 passed, Chromium
npx playwright install chromium   # once per machine

# standalone isolated server (this is the explicitly requested script)
uv run python scripts/serve-test-app.py                 # 127.0.0.1:8899
uv run python scripts/serve-test-app.py --port 9123
uv run python scripts/serve-test-app.py --port 0        # ephemeral port
uv run python scripts/serve-test-app.py --fixtures-dir /tmp/pm --no-reset
PI_METER_E2E_PORT=9123 uv run python scripts/serve-test-app.py
```

Banner when ready (parse this in scripts):
`PI-METER-TEST-APP READY url=http://127.0.0.1:8899 fixtures=<dir> db=<file> dist=<dir>`
Exit codes: `0` clean shutdown, `2` port in use / bad port, `3` missing frontend build.

---

## 3. Isolation guarantees (verified)

- `tests/conftest.py` sets `PI_METER_SESSIONS_DIR`, `PI_METER_DB_PATH`,
  `PI_METER_FRONTEND_DIST`, `PI_METER_SYNC_ON_STARTUP=false`,
  `PI_METER_LOG_LEVEL=WARNING` and `TZ=UTC` **at conftest import time**, i.e.
  before any test module can `import app.main` (which builds a global app and a
  real engine at import). The process-level temp root is deleted in
  `pytest_sessionfinish`, which also disposes that global app's engine.
- Every test additionally gets its own `tmp_path` pointed at by
  `settings`/`_isolate_process_state`; `get_settings.cache_clear()` runs before
  and after each test.
- Verified: `data/pi-meter.sqlite` (mtime 18:48) and `~/.pi` were **never**
  touched; the repository `data/` listing is byte-identical before/after runs.
- `scripts/serve-test-app.py` asserts its resolved settings equal the temp
  paths it created, otherwise it aborts.
- Playwright uses `reuseExistingServer: false` and kills only the process it
  spawns (port 8901 by default; 8787/8743 are untouched). The ephemeral fixture
  directory is removed on SIGTERM/SIGINT.
- Every fixture in `tests/fixtures/` is written under the pytest temp dir;
  `file_hashes`/`assert_files_unchanged` let Workers 3-4 assert source
  immutability across sync/refresh.

---

## 4. Pytest fixture contract (`tests/conftest.py`)

| Fixture | Returns | Notes |
| --- | --- | --- |
| `settings` | `app.config.Settings` | `sessions_dir=<tmp>/sessions`, `db_path=<tmp>/pi-meter.sqlite`, `frontend_dist=<tmp>/dist` (absent), `sync_on_startup=False`, `log_level=WARNING` |
| `make_settings` | `Callable[..., Settings]` | `make_settings(port="9000", sessions_dir=tmp_path/"x", sync_on_startup="true")`; kwargs are env names **without** `PI_METER_`; `None` unsets. Clears the settings cache. Use in `app/config` and `ranges` tests. |
| `app` | `fastapi.FastAPI` | `create_app(settings)`; engine disposed on teardown; `app.state.{engine,session_factory,sync_service,settings}` |
| `client` | `starlette.testclient.TestClient` | enters the real lifespan (startup sync is disabled by settings) |
| `seeded_client` | `TestClient` | `client` after one full-corpus sync |
| `seeded_app_client` | `TestClient` | same, but keeps `app` available in the test body |
| `db` | `sqlalchemy.orm.Session` | bound to `app.state.session_factory`; closed after |
| `session_factory` | `sessionmaker` | for multi-session/transaction tests |
| `sync_service` | `SyncService` | `sync_service.run()` -> `SyncStats` |
| `sync_stats` | `SyncStats` | result of one full-corpus sync (asserted deterministic) |
| `corpus` | `Corpus` | full corpus written, **not** synced; `corpus.root`, `corpus.sessions[key]`, `corpus.path(key)` |
| `empty_corpus` | `Corpus` | sessions dir exists, no files |
| `synced_corpus` | `Corpus` | `corpus` synced once |
| `write_session` | `Callable` | `write_session(records, name="x.jsonl", subdir="alpha") -> Path` |
| `parse_records` | `Callable` | `parse_records(records, **kwargs) -> ParsedSession` (no disk) |
| `parse_text` | `Callable` | `parse_text(text) -> ParsedSession` |
| `frontend_dist` | `Path` | stub build: `index.html`, `assets/app.js`, `assets/app.css`, `fonts/inter.woff2`, `robots.txt` |
| `frontend_client` | `TestClient` | app built with `frontend_dist` so SPA fallback/static tests work |
| `file_hashes` | `Callable[[Path], dict[str,str]]` | `{relpath: sha256}` |
| `assert_files_unchanged` | `Callable[[dict, Path], None]` | asserts a prior snapshot is unchanged (source immutability) |

Autouse fixture `_isolate_process_state` (temp env + settings-cache reset) applies
to every test; no test can opt out, which is deliberate.

**Important corpus fact:** the `full` variant deliberately contains two
unparseable files (`edge/empty.jsonl`, `edge/no_header.jsonl`) and one partial
file (`edge/malformed.jsonl`), so a full sync is **`status="partial"`**,
`files_seen=19`, `files_added=17`, `files_failed=2`. Use
`corpus.FULL_VARIANT_*` constants instead of hardcoding. Tests that need an
all-clean corpus should write their own files via `write_session`.

---

## 5. Fixture corpus contract (`tests/fixtures/corpus.py`)

Constants: `MAIN_ID`, `BETA_ID`, `METADATA_ID`, `LONG_ID`, `PARENT_ID`,
`MAPPED_CHILD_IDS` (5), `DECOY_SESSION_IDS` (3), `EDGE_CASE_FILES`,
`EDGE_CASE_ERROR_FILES`, `EDGE_CASE_PARTIAL_FILES`, `FULL_VARIANT_FILES=19`,
`FULL_VARIANT_INDEXED_SESSIONS=17`, `FULL_VARIANT_SYNC_STATUS="partial"`.

`corpus.micro("0.0012297") == 1230` — independent micro-unit conversion
(Decimal, ROUND_HALF_UP), never `app.services` helpers.
`corpus.main_usage_totals()` recomputes the MAIN totals from the record specs;
`tests/fixtures/test_corpus_contract.py` asserts they equal `corpus.MAIN` so a
typo fails loudly.

### `MAIN` — verified against the real parser and API

| Field | Value |
| --- | --- |
| entries / messages | 18 / 7 (1 user, 3 assistant, 3 toolResult) |
| tool calls | 2 (`call-1` ok, `call-2` broken args + failed result) |
| orphan result | `call-missing` (must be preserved, not paired) |
| usage records | 6 (3 assistant, compaction, branch summary, standalone `usage` entry) |
| input/output/reasoning/cacheRead/cacheWrite | 4210 / 1015 / 260 / 4000 / 1500 |
| total tokens | 10725 (reasoning never added twice) |
| cost micro (in/out/read/write) | 7300 / 8900 / 400 / 2370 |
| cost total micro | **19409** (recorded total 0.0037777 dominates the component sum) |
| models with usage | anthropic/claude-sonnet-4-5 ×2 = 15470 micro; openai/gpt-5.1 ×4 = 3939 micro |
| title / title source | `Refactor parser pipeline` via `session_info` |
| label | `a1 -> first-answer` |
| parse status / issues | `ok`; codes `("unknown_entry_type","multiple_roots")` |
| started / last activity (ms) | `1768467600000` / `1768467760000` |

Also: image content, thinking (incl. redacted), model change, thinking-level
change, compaction (with usage + `firstKeptEntryId`), context edit (replacement
+ omitted variants available), branch summary, custom JSON, custom message,
unknown event with HTML/Markdown/ANSI payloads.

### Other corpora

- `BETA`: 3 entries, 2 identical usage records that **must count twice**
  (600 in / 80 out / 680 total / 1000 micro), one record before and one after
  `2026-01-16T00:00:00.000Z`.
- `PARENT`: 4 entries, 1 usage record, 700 micro. Child ids **and** the three
  decoy ids appear in the transcript text and tool output, so UUID mentions
  alone must never create a relationship. `PARENT["combined_cost_micro_with_mapped_children"] == 100700`
  (700 own + 5 × 20000), `mapped_child_cost_micro == 20000`.
  `EXCLUDED_RELATED_SESSION_IDS` is an empty tuple placeholder — the bug report's
  three ids were **not** supplied with the plan; Worker 4 must fill it in when
  they are known.
- `METADATA`: 17 entries, every metadata type, unknown role (`mysteryRole`),
  unknown block (`futureBlock`), duplicate header, unknown types, cleared label +
  cleared session name → title `(untitled session)`; expected issue codes
  `("unknown_entry_type","duplicate_header","unknown_entry_type")`;
  1 usage record / 15 tokens / 15 micro.
- `LONG`: 81 entries, one 20 000-char unbroken tool output,
  40 × 15 tokens = 600 tokens, 400 micro.
- `EDGE_CASE_FILES`: `header_only`, `empty` (0 bytes), `malformed` (valid entries
  around a broken line → `partial`), `no_header`, `blank_lines`,
  `unsafe_content` (script tag, `onerror`, `javascript:`/`file:` links, ANSI).

Layout written by `write_corpus(dir, "full")`:
`alpha/…_main.jsonl`, `beta/…_beta.jsonl`, `parent/…_parent.jsonl`,
`parent/children/child-{1..5}.jsonl`, `parent/decoy/decoy-{1..3}.jsonl`,
`meta/…_meta.jsonl`, `long/…_long.jsonl`, `edge/*.jsonl`.
`Corpus.sessions` keys: `main, beta, parent, children, decoys, meta, long,
edge:empty, edge:header_only, edge:malformed, edge:no_header, edge:blank_lines,
edge:unsafe_content`.

Builder API (`tests/fixtures/jsonl.py`): `session_header`, `text_block`,
`thinking_block`, `image_block`, `tool_call_block`, `unknown_block`,
`cost_object`, `usage_object`, `message_entry`, `user_message`,
`assistant_message`, `tool_result_message`, `model_change`,
`thinking_level_change`, `usage_entry`, `compaction`, `branch_summary`,
`context_edit`, `custom`, `custom_message`, `label`, `session_info`,
`unknown_entry`, `to_jsonl`, `write_jsonl`, `write_session_text`, `epoch_ms`,
`DEFAULT_TIMESTAMP`. Pass a raw `str` inside the record list to model a
malformed line.

---

## 6. Frontend test harness contract

`frontend/vitest.config.ts`: jsdom, `globals: false`, `setupFiles:
['./src/test/setup.ts']`, includes `src/**/*.{test,spec}.{ts,tsx}`, excludes
`e2e/**`, V8 coverage to `frontend/coverage`.

`frontend/src/test/setup.ts` (automatic for every Vitest file):
- `@testing-library/jest-dom/vitest` matchers;
- stubs `matchMedia` (matches=false), `ResizeObserver`, `IntersectionObserver`,
  `window.scrollTo`, `Element.prototype.scrollIntoView`, `navigator.clipboard`;
- `beforeEach`: clears the shared `queryClient`, `localStorage`,
  `sessionStorage`, and stubs `fetch` to **reject** (any un-mocked request fails
  the test);
- `afterEach`: `cleanup()`, real timers, `unstubAllGlobals`, `restoreAllMocks`.

`frontend/src/test/helpers.tsx`:
- `createTestQueryClient()` — `retry: false, staleTime: 0, gcTime: 0`;
- `renderWithProviders(ui, { route, queryClient })` → `{queryClient, user, ...RTL}`;
- `renderWithRoute(element, { path, route })` — adds `Routes` so `useParams` works;
- `renderAppRoutes(routes, { route })` — `createMemoryRouter` + `RouterProvider`,
  returns `{router, queryClient, user}`;
- `wrapperFor(queryClient, route)` — for `renderHook`;
- `mockApi({"GET /api/summary": summaryFixture(), ...})` → `{fetchMock, calls,
  expectCalled(key), restore()}`; longest matching `"METHOD /path"` prefix wins,
  handlers may be `Response`, any value (wrapped as JSON), or a (possibly async)
  function; unmatched paths reject (surfaced by `lib/api.ts` as
  `ApiError(0, 'Could not reach the local Pi Meter server.')`);
- `jsonResponse(body, status)`, `deferred<T>()`.

`frontend/src/test/fixtures.ts`: `FIXTURE_NOW = '2026-01-15T09:00:00.000Z'`,
`FIXTURE_TIMEZONE='UTC'`, `SESSION_IDS.{main,beta,parent,child}`,
`healthFixture`, `summaryFixture` (cost 0.019409, tokens 10725,
components sum 0.01897 — intentional recorded-total mismatch),
`timeseriesFixture`, `modelBreakdownFixture`, `projectBreakdownFixture`,
`sessionListItemFixture`, `sessionsResponseFixture`, `filtersFixture`,
`rawEntry`, `rawSessionDetail`, `normalizedSessionDetailFixture`,
`longToolOutput`. Use `vi.setSystemTime(new Date(FIXTURE_NOW))` for
range-sensitive assertions (all fixture timestamps are January 2026).

---

## 7. E2E / browser contract

`frontend/playwright.config.ts`: Chromium project, 1 worker, `baseURL`
`http://127.0.0.1:${PI_METER_E2E_PORT:-8901}`, `timezoneId: 'UTC'`,
`reducedMotion: 'reduce'`, traces/screenshots on failure into
`frontend/test-results`, HTML report into `frontend/playwright-report`,
`webServer` runs
`uv run python ../scripts/serve-test-app.py --host 127.0.0.1 --port <PORT> --log-level warning`
with `reuseExistingServer: false`, waits on `/api/health`, 120 s timeout.
`PI_METER_E2E_FIXTURES_DIR` pins the fixture dir (use with `--no-reset` semantics
for tests that mutate fixture files and then click refresh);
`PI_METER_E2E_BASE_URL` overrides `baseURL`.

`frontend/e2e/harness.spec.ts` (2 tests) is a **harness smoke spec** owned by
Worker 1; Worker 7 owns `frontend/e2e/**` and may delete it. It proves the
server serves `frontend/dist`, the API answers from the synthetic corpus
(`sessionsDir` contains `pi-meter-e2e-`, never `.pi/agent/sessions`) and deep
links hit the SPA fallback.

`scripts/serve-test-app.py`: reads only `tests/fixtures` corpora, serves
`frontend/dist`, loopback only, configurable `--port/--host/--fixtures-dir/
--dist/--no-reset/--no-edge/--log-level`, refuses an occupied port (exit 2),
refuses a missing build (exit 3), prints the READY banner, deletes its ephemeral
fixture dir on SIGTERM/SIGINT, and asserts its settings point at the temp paths.

---

## 8. Verification actually run

| Command | Result |
| --- | --- |
| `uv sync` (dev group) | ok |
| `uv run pytest -q` | **28 passed** |
| `uv run pytest --cov=app --cov-report=term-missing` | 28 passed, total coverage **81 %** |
| `uv run python scripts/serve-test-app.py --port 8899` + `curl /api/health`, `/`, `/api/sessions?range=all` | health `ok` (17 sessions indexed, 2 expected failures), index 200, 14 sessions in range `all` (dates filtered by "all" end=now; fixture dates are Jan 2026) |
| occupied-port run | exit 2 with message |
| missing-dist run | exit 3 with message |
| SIGTERM run | exit 0, ephemeral fixture dir removed |
| `cd frontend && npx tsc --noEmit` | clean |
| `npx vitest run` | **13 passed** |
| `npx vitest run --coverage` | 13 passed, report written |
| `npx playwright install chromium` | headless shell installed |
| `npx playwright test` | **2 passed**, no leftover listener on 8901 afterwards |

Cross-checks against production code (throw-away scripts, not committed):
parser totals for MAIN, BETA, PARENT, METADATA, LONG all equal the fixture
expectations; `/api/sessions/{PARENT_ID}` returns exactly the 5 mapped children
with `relatedCostTotal=0.1`, `combinedCostTotal=0.1007`; `/api/sessions/{MAIN_ID}`
returns 18 entries, 10725 tokens, 0.019409, models `claude-sonnet-4-5 ×2`,
`gpt-5.1 ×4`.

---

## 9. Blockers / notes for the other workers

1. **`app/main.py` global app (known plan risk, not fixed).** `app.main.app = create_app()`
   still exists, so importing `app.main` builds an app with whatever settings are
   cached. The conftest neutralizes this by setting temp env *before* import and
   by autouse-clearing `get_settings`, but test modules must **not** import
   `app.main` at module import time before `tests/conftest.py` has run (it always
   has, since conftest is imported first). Prefer the `app`/`client` fixtures
   over `from app.main import app`. A factory-only refactor would remove the
   hazard; that is production code and outside Worker 1's ownership.
2. **The bug report's three excluded relationship ids were never supplied.**
   `corpus.EXCLUDED_RELATED_SESSION_IDS` is an empty placeholder. Worker 4 should
   add the ids (and a regression asserting they stay absent) once known.
3. **Full-corpus sync is `partial`, by design.** Do not assert `status == "ok"`
   on the full corpus; use a clean corpus (`write_session` with valid files) for
   that.
4. **`python3` on this machine is 3.10.12** while the project targets 3.12+ and
   `.venv` runs 3.14. Always use `uv run python`, never system Python.
5. **`frontend/dist` must be built before `npm run test:e2e`** (`npm run build`);
   the server exits 3 otherwise. Chromium must be installed once.
6. **Coverage thresholds are intentionally unset.** Measured baseline with only
   infrastructure tests: backend 81 %, frontend mostly 0 % (feature suites not
   written yet). Set thresholds after the first full-suite run.
7. `httpx2` is installed only to silence Starlette 1.9's TestClient deprecation
   warning; `httpx` remains available for `ASGITransport`-based tests. If a
   worker prefers `httpx.AsyncClient`, add `pytest-anyio`/markers in your own
   file rather than editing conftest.
8. **Observed production behaviour worth a regression (report, do not fix here):**
   `GET /api/sessions` inner-joins the usage aggregate, so sessions with **zero
   usage records are omitted** from the list while `/api/filters` counts them
   (`sessionCount=17` vs `sessions total=14` for the full corpus). The three
   zero-usage fixture sessions (`edge:header_only`, `edge:blank_lines`,
   `edge:unsafe_content`) are exactly the delta. Worker 4 should decide whether
   that is intended and add a test either way.
9. Shared-fixture edits are Worker 1's responsibility: request additions instead
   of editing `tests/conftest.py`, `tests/fixtures/**`, `frontend/src/test/**`,
   `frontend/vitest.config.ts`, `frontend/playwright.config.ts`,
   `scripts/serve-test-app.py`.
