# Test fixtures (Worker 1 contract)

Everything under `tests/fixtures/` is **worker-owned shared infrastructure**.
Workers 2-7 consume it; only Worker 1 edits it. If you need a new synthetic
case, request it instead of editing these files concurrently.

## Modules

| File | Purpose |
| --- | --- |
| `jsonl.py` | Low-level, dependency-free builders for Pi JSONL records (`session_header`, `user_message`, `assistant_message`, `tool_result_message`, `usage_object`, `cost_object`, `to_jsonl`, `write_jsonl`, ...). Imports no `app` code. |
| `corpus.py` | Named corpora with **independently computed** expectations (`MAIN`, `BETA`, `PARENT`, `METADATA`, `LONG`, `EDGE`, `FULL_VARIANT_*`). Costs are decimal strings; `corpus.micro()` converts to integer micro-units without touching `app.services`. |
| `test_corpus_contract.py` | Self-checks proving the expectations agree with the record definitions. If you change a fixture, this must keep passing. |
| `test_infrastructure_smoke.py` | Proves the pytest fixture contract (settings/app/client/db/corpus) works. |
| `test_serve_test_app.py` | Checks the isolated E2E server helpers. |

## Corpora

`write_corpus(sessions_dir, variant)` variants:

- `"empty"` – directory with no files.
- `"none"` – only the edge-case files (empty file, header-only, malformed line,
  no header, blank lines, unsafe Markdown/ANSI payloads).
- `"full"` – every corpus (19 files, 17 indexed sessions, 2 expected failures).

Logical keys returned in `Corpus.sessions`:
`main`, `beta`, `parent`, `children`, `decoys`, `meta`, `long`,
`edge:empty`, `edge:header_only`, `edge:malformed`, `edge:no_header`,
`edge:blank_lines`, `edge:unsafe_content`.

Highlights:

- `MAIN` – full conversation: text, thinking, image, tool call with broken
  arguments, successful result, failed result, orphan result, model change,
  thinking-level change, compaction, context edit, branch summary, custom,
  custom message, label, standalone usage record, unknown event, session name.
  Two models, mixed recorded/derived totals, and a recorded cost total that
  deliberately differs from its component sum.
- `BETA` – one session straddling UTC midnight with two identical usage records
  (must count twice).
- `PARENT` + `MAPPED_CHILD_IDS` + `DECOY_SESSION_IDS` – the relationship corpus.
  Every child and decoy id appears in the parent transcript text/tool output, so
  UUID mentions alone can never create a relationship.
- `METADATA` – every metadata entry type, unknown role, unknown content block,
  unknown/duplicate-header entry, cleared label and cleared session name.
- `LONG` – 81 entries with one 20 000-character unbroken tool output.

## Frontend fixtures

`frontend/src/test/`:

- `setup.ts` – jest-dom matchers, matchMedia/ResizeObserver/IntersectionObserver
  stubs, query-cache + storage reset, and a default `fetch` that rejects.
- `fixtures.ts` – deterministic API payloads (summary, timeseries, model and
  project breakdowns, sessions, filters, raw + normalized session detail) with
  hand-checked totals.
- `helpers.tsx` – `createTestQueryClient`, `renderWithProviders`,
  `renderWithRoute`, `renderAppRoutes`, `wrapperFor`, `mockApi`, `jsonResponse`,
  `deferred`.
- `helpers.test.tsx` – smoke checks for the helpers themselves.

Rules: set the clock with `vi.setSystemTime(new Date('2026-01-15T09:00:00.000Z'))`
for range-sensitive assertions, never call the real network, and prefer
`mockApi({'GET /api/summary': summaryFixture()})` over ad-hoc fetch stubs.
