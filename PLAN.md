# Pi Meter implementation plan

## Product direction

Build a local usage dashboard for Pi sessions stored under `~/.pi/agent/sessions`.

The app will have two main jobs.

- Show aggregated usage and cost across sessions.
- Let you open any session and read it as a structured conversation with users, assistants, tool calls, thinking blocks, model changes, and usage details.

The app will run only on the local machine. It will use SQLite as a local index and cache, while the JSONL files remain the source of truth.

The frontend should feel like a focused developer tool rather than a generic admin dashboard. The design should use strong typography, dense but readable information, restrained color, clear hierarchy, and deliberate empty space. The design-taste skill is aimed at public pages rather than app screens, so I would adapt its anti-slop principles rather than copy its page composition literally.

## Recommended stack

### Backend

- FastAPI
- Python 3.12 or newer
- SQLAlchemy 2
- SQLite
- Pydantic
- Uvicorn

### Frontend

- React
- TypeScript
- Vite
- CSS modules or a small global CSS system
- Recharts for charts

React is a reasonable compromise here. The frontend has enough state to justify component-based rendering, but it does not need a large framework or a complex design system.

The frontend can be built and served as static files by FastAPI in production. During development, Vite can run separately with a proxy to FastAPI.

### Why not server-rendered HTML

The session detail view will contain nested content, collapsible tool results, filters, charts, and client-side navigation. React will keep those interactions simple without requiring a large frontend framework.

### Why not Next.js

The app is local-only and has no SEO or server-side rendering requirement. Next.js would add more structure than this project needs.

## Core data flow

```text
~/.pi/agent/sessions/**/*.jsonl
                  |
                  v
        Session discovery and sync
                  |
                  v
             JSONL parser
                  |
                  v
      Normalized session and entry data
                  |
                  v
               SQLite
                  |
                  v
             FastAPI API
                  |
                  v
          React and TypeScript UI
```

SQLite is an index of the session files. It is not a replacement for the original JSONL files.

The app should never rewrite or modify Pi session files.

## Source of truth rules

The JSONL files are authoritative.

SQLite stores

- Parsed session metadata
- Parsed entries
- Usage totals
- Aggregated dimensions
- File modification information
- Parse errors
- Searchable text fields where useful

On refresh, the sync process will

- Discover all JSONL files below the sessions directory
- Compare each file's size and modification time with the database
- Reparse only changed files
- Insert new files
- Remove database records for files that no longer exist
- Preserve the original JSONL file path
- Record parsing errors without stopping the rest of the sync

A file hash can be added later, but file size plus modification time is enough for the first version.

## Database design

The database can use the following tables.

### `sessions`

Stores one row per JSONL file.

Suggested fields

```text
id
session_id
file_path
file_name
cwd
started_at
last_activity_at
session_name
parent_session_path
version
file_size
file_mtime_ns
entry_count
message_count
user_message_count
assistant_message_count
tool_result_count
tool_call_count
model_change_count
compaction_count
context_edit_count
input_tokens
output_tokens
reasoning_tokens
cache_read_tokens
cache_write_tokens
total_tokens
cost_input_micro
cost_output_micro
cost_cache_read_micro
cost_cache_write_micro
cost_total_micro
parse_status
parse_error
created_at
updated_at
```

`session_id` comes from the session header rather than the file name.

Costs should be stored as integer micro-units rather than floating point values. For example, a cost of `0.0012297` can be stored as `1229` or `1229700`, depending on the chosen scale. I recommend storing millionths of the displayed currency unit.

This avoids floating point accumulation errors while preserving the recorded values.

### `entries`

Stores one row per JSONL entry.

Suggested fields

```text
id
session_id
entry_id
parent_id
entry_index
entry_type
timestamp
role
provider
model
thinking_level
tool_name
tool_call_id
is_error
content_json
metadata_json
input_tokens
output_tokens
reasoning_tokens
cache_read_tokens
cache_write_tokens
total_tokens
cost_input_micro
cost_output_micro
cost_cache_read_micro
cost_write_micro
cost_total_micro
```

`content_json` should retain the original message content for rendering.

The database should not attempt to flatten every possible future Pi entry type into columns. Unknown fields should remain in `metadata_json`.

### `sync_runs`

Stores refresh information.

Suggested fields

```text
id
started_at
finished_at
files_seen
files_added
files_updated
files_removed
files_failed
status
error_message
```

This will help diagnose a malformed file without hiding the problem.

### Indexes

Create indexes on

```text
sessions.started_at
sessions.last_activity_at
sessions.cwd
sessions.session_name
sessions.cost_total_micro
entries.session_id
entries.timestamp
entries.entry_type
entries.role
entries.model
```

The session detail view should fetch entries by `session_id` and `entry_index`.

## JSONL parser behavior

The parser should process files line by line.

Each line should be parsed independently. One malformed line should be recorded as an error and should not prevent later lines from being read.

The parser should identify

- The first `session` header
- `message` entries
- `model_change` entries
- `thinking_level_change` entries
- `usage` entries
- `compaction` entries
- `context_edit` entries
- `branch_summary` entries
- `custom` entries
- `custom_message` entries
- `label` entries
- `session_info` entries
- Unknown entry types

The parser should preserve all entries, including types the first version does not render specially.

### Usage extraction

Usage can occur in more than one place.

The parser should inspect

- `message.usage`
- top-level `usage` entries
- `compaction.usage`
- `branch_summary.usage`
- Any other known entry containing a usage object

The session total should include all model-attributed usage records once.

The parser should avoid double counting the same usage object if a future Pi entry contains nested and top-level representations of the same record.

For assistant messages, usage is normally found under `message.usage`.

For standalone usage entries, usage is found under the entry's top-level `usage`.

### Model tracking

For each entry, preserve the provider and model recorded on that entry.

The session summary should list every model used during the session.

The dashboard should group usage by the actual model recorded in assistant messages and usage entries. A model change record alone should not count as usage.

### Time handling

Store timestamps in UTC.

The frontend should display timestamps in the local browser timezone.

The API should support an explicit timezone or use local-day boundaries calculated by the server. Since this is a local app, the simplest first version is to use the machine's local timezone for views such as today and last seven days.

The API response should include the timezone used for the aggregation so the UI can make the boundary clear.

### Branches and tree structure

The first version should preserve `parent_id` and entry ordering.

For the main session transcript, render entries in file order. This matches what a user sees when inspecting the raw session and avoids hiding branch history.

A later version can add active-branch navigation using the parent tree. The initial session view should show branch metadata where available without trying to reconstruct a single canonical conversation.

### Context edits

Render `context_edit` entries as small timeline markers.

They should explain that an earlier message was removed or replaced in future model context. The original entry should remain available in the raw session timeline.

### Compaction

Render compaction as a visible system event.

Show

- Compaction timestamp
- Tokens before compaction
- Summary
- Any usage attributed to the compaction
- Read and modified file details when present

The compaction summary should be collapsed by default if it is long.

## API design

All endpoints should be local and read-only except for the refresh operation.

### Health

```text
GET /api/health
```

Returns application status, database status, session directory, and last refresh time.

### Refresh

```text
POST /api/refresh
```

Runs a synchronous refresh and returns a summary.

Example response

```json
{
  "filesSeen": 12,
  "filesAdded": 1,
  "filesUpdated": 2,
  "filesRemoved": 0,
  "filesFailed": 0,
  "durationMs": 142
}
```

Manual refresh should be safe to click repeatedly. A second refresh should either wait for the first one or return a clear busy response.

### Dashboard summary

```text
GET /api/summary?range=today
GET /api/summary?range=7d
GET /api/summary?range=30d
GET /api/summary?range=all
```

Returns

- Session count
- Total cost
- Input cost
- Output cost
- Cache read cost
- Cache write cost
- Input tokens
- Output tokens
- Reasoning tokens
- Cache read tokens
- Cache write tokens
- Total tokens
- User message count
- Assistant message count
- Tool call count
- Average session cost
- Most-used model
- Most active project

### Time series

```text
GET /api/usage/timeseries?range=30d&groupBy=day
```

Supported grouping should include

- `hour`
- `day`
- `week`
- `month`

Return one row per time bucket.

```json
{
  "bucket": "2026-10-22",
  "inputTokens": 120000,
  "outputTokens": 5000,
  "reasoningTokens": 3000,
  "cacheReadTokens": 25000,
  "totalTokens": 128000,
  "costTotal": 0.43,
  "sessionCount": 4
}
```

### Model breakdown

```text
GET /api/usage/by-model?range=30d
```

### Project breakdown

```text
GET /api/usage/by-project?range=30d
```

Group by `cwd`.

The UI can display the final path segment prominently and the full path in a tooltip or secondary line.

### Sessions

```text
GET /api/sessions?range=30d&cwd=&model=&search=&page=1&pageSize=25
```

Supported filters should include

- Date range
- Working directory
- Model
- Session name
- Search text
- Minimum cost
- Sort order

The response should include summary metrics for each session.

### Session detail

```text
GET /api/sessions/{session_id}
```

Returns

- Session metadata
- Cost breakdown
- Token breakdown
- Models used
- Timeline entries
- Parse warnings
- Source file information

The API should support pagination for very large sessions.

```text
GET /api/sessions/{session_id}/entries?offset=0&limit=100
```

The first implementation can return all entries for ordinary sessions and add pagination before performance becomes an issue.

### Filters metadata

```text
GET /api/filters
```

Returns available

- Working directories
- Models
- Providers
- Date bounds
- Session count

This avoids hard-coding filter options in the frontend.

## Dashboard layout

The main page should be a usage overview.

### Top navigation

Include

- Product name, such as `pi meter`
- Current date range
- Manual refresh button
- Last refreshed timestamp
- Link to settings or diagnostics if needed later

The refresh button should show a small loading state and the number of files updated after completion.

### Summary strip

Use four primary metric cards.

- Total cost
- Total tokens
- Sessions
- Assistant responses

Each card should show a comparison only when there is a meaningful previous period. Avoid fake comparisons when there is not enough data.

The total cost card should be the visual anchor.

### Usage chart

A combined chart should show

- Token volume over time
- Cost over time

Because these values have different scales, use either separate stacked panels or a clear toggle. Do not use a dual-axis chart in the first version.

Recommended interaction

- Token view
- Cost view
- Input and output toggles
- Hover tooltip with the complete bucket breakdown

### Cost composition

Show a horizontal stacked bar or segmented chart for

- Input
- Output
- Reasoning
- Cache read
- Cache write

The labels should include both amount and percentage.

### Model and project panels

Two compact panels should show

- Cost by model
- Tokens by working directory

Each row should be clickable and apply a filter to the session list.

### Recent sessions

Show the latest sessions with

- Session name or first user message
- Project
- Started time
- Duration
- Model
- Total tokens
- Cost

Clicking a row should navigate to the session detail route.

### Empty state

If there are no sessions, explain the expected directory and provide a refresh button.

## Date range behavior

The main range selector should include

- Today
- Last 7 days
- Last 30 days
- All time
- Custom range

The default should be `last 7 days` if the app is opened for the first time. This gives useful context without overwhelming the screen.

Each view should define whether the range is based on

- Session start time
- Session activity time
- Usage entry time

Use usage entry time for aggregate charts and activity. Use session overlap for session lists.

A session should be included in a range if it has usage during the range. This prevents a long-running session from disappearing from a later date window.

## Session detail page

The session page is the most important part of the app after the dashboard.

### Header

Show

- Session name if present
- Fallback session title from the first user message
- Full working directory
- Start time
- Last activity
- Duration
- Models used
- Session file name
- Refresh state

The header should include a link back to the filtered dashboard.

### Session cost panel

Place a compact cost summary near the top.

Show

- Total cost
- Input cost
- Output cost
- Cache read cost
- Cache write cost
- Total tokens
- Input tokens
- Output tokens
- Reasoning tokens
- Cache read tokens
- Cache write tokens

Use the same visual language as the dashboard so the numbers are easy to compare.

### Conversation timeline

Render each entry as a timeline item.

#### User messages

Use a clear user-colored marker and a readable message surface.

Support

- Plain text
- Markdown
- Code blocks
- Images if they appear in the session
- Multiple content blocks

#### Assistant messages

Show

- Model name
- Provider
- Thinking level
- Response timestamp
- Usage summary
- Cost summary
- Assistant content

The assistant usage details should be collapsible so the answer remains the main focus.

#### Tool calls

Render tool calls as distinct nested blocks beneath the assistant response that produced them.

Show

- Tool name
- Call identifier when useful
- Arguments
- Result status
- Duration if it can be derived
- Error state

Tool arguments should be collapsed when they are long.

#### Tool results

Tool results should be collapsed by default when they exceed a reasonable size.

Recommended behavior

- Short results stay open
- Long results show the first few lines
- A button expands the full result
- Another button copies the result
- A line count appears beside the expand control
- Errors use a stronger color and remain easy to find
- Large JSON results use syntax highlighting
- Long plain text results use a scrollable code surface

The frontend should avoid rendering thousands of lines into the DOM before the user expands them. The API can return the content, but the component should render a preview first.

#### System and metadata events

Render these with a smaller muted style.

This includes

- Model changes
- Thinking-level changes
- Compaction
- Context edits
- Branch summaries
- Session metadata changes
- Custom entries

They should remain visible because they explain changes in the conversation, but they should not compete visually with user and assistant messages.

### Transcript controls

Add

- Expand all
- Collapse all
- Jump to latest
- Search within session
- Copy message
- Copy tool result
- Show only errors
- Show only tool calls

Search should highlight matching text and scroll to the relevant entry.

## Frontend visual direction

The design should be clean and technical without looking like a generic SaaS template.

### Visual principles

- Use one dark or warm neutral background
- Use a strong ink color for primary text
- Use one accent for interactive states
- Use separate semantic colors for user, assistant, tool, and error states
- Keep borders subtle
- Use dense tables only where comparison matters
- Use larger typography for the main cost and token totals
- Use monospace only for paths, models, tool names, identifiers, and code
- Avoid excessive rounded cards
- Avoid gradients, decorative blobs, and fake dashboard illustrations
- Avoid icon-only controls without labels or tooltips
- Use clear focus states for keyboard navigation

### Proposed palette

The exact palette can be adjusted during implementation, but a useful starting point is

```text
background      #101214
surface         #171A1E
surfaceRaised   #1E2329
border          #2B323A
textPrimary     #F1F3F5
textSecondary   #A7B0BA
accent          #C8F36B
user            #83B9FF
assistant       #D4A7FF
tool            #9AA7B3
success         #8DDBA8
error           #FF8D8D
warning         #F1C978
```

A light theme can be added later, but the first version should optimize for long session reading in a dark local developer environment.

### Typography

Use a readable sans-serif for interface text and a monospace face for technical content.

Suggested roles

- Display numbers at a large size with tight line height
- Page headings at a restrained size
- Body text at 15 to 16 pixels
- Tool output at 13 to 14 pixels
- Metadata at 12 to 13 pixels
- Never use low-contrast gray for important values

### Motion

Use minimal motion.

Acceptable motion includes

- Expand and collapse transitions
- Refresh button progress state
- Chart tooltip transitions
- Page navigation fade

Do not animate every card or list item. This is a utility that should feel quick.

## URL structure

Use browser routes so dashboard state and session links are shareable within the local machine.

```text
/
  dashboard

/sessions
  filtered session list

/sessions/:sessionId
  session detail

/settings
  local configuration and diagnostics
```

The dashboard query state should be stored in the URL.

Example

```text
/?range=30d&cwd=%2Fmount%2FData2%2Fsyed%2Fcoding
```

This makes filtered views easy to bookmark.

## Refresh behavior

The app uses manual refresh only.

The refresh flow should be

1. User clicks refresh.
2. Frontend disables the button.
3. Backend scans for changed files.
4. Backend updates SQLite.
5. Backend returns sync statistics.
6. Frontend invalidates dashboard and session queries.
7. Frontend updates the last refreshed timestamp.
8. A small status message reports added and updated sessions.

The app should not watch the directory or poll automatically.

The app should perform one initial sync when the backend starts. If startup sync is slow later, the API can start first and expose a syncing state.

## Local-only security

Bind Uvicorn to `127.0.0.1`.

Do not bind to `0.0.0.0`.

The server should only accept requests from the local browser. CORS should be disabled unless the Vite development server needs a narrow development rule.

Do not expose raw file paths through arbitrary filesystem endpoints. Session content should only be returned through a session ID that exists in the database.

Do not allow the frontend to request arbitrary files.

## Project structure

A proposed layout is

```text
pi-meter/
├── pyproject.toml
├── README.md
├── app/
│   ├── main.py
│   ├── config.py
│   ├── db.py
│   ├── models.py
│   ├── schemas.py
│   ├── api/
│   │   ├── health.py
│   │   ├── refresh.py
│   │   ├── summary.py
│   │   ├── sessions.py
│   │   └── filters.py
│   ├── services/
│   │   ├── sync.py
│   │   ├── parser.py
│   │   ├── aggregation.py
│   │   └── formatting.py
│   └── templates/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
│       ├── main.tsx
│       ├── app/
│       │   ├── router.tsx
│       │   └── queryClient.ts
│       ├── components/
│       │   ├── AppShell.tsx
│       │   ├── MetricCard.tsx
│       │   ├── DateRangeSelector.tsx
│       │   ├── UsageChart.tsx
│       │   ├── CostBreakdown.tsx
│       │   ├── SessionTable.tsx
│       │   ├── Transcript.tsx
│       │   ├── MessageBlock.tsx
│       │   ├── ToolCallBlock.tsx
│       │   ├── ToolResultBlock.tsx
│       │   └── EventBlock.tsx
│       ├── pages/
│       │   ├── DashboardPage.tsx
│       │   ├── SessionsPage.tsx
│       │   └── SessionDetailPage.tsx
│       ├── lib/
│       │   ├── api.ts
│       │   ├── format.ts
│       │   └── content.ts
│       └── styles/
│           ├── tokens.css
│           ├── global.css
│           └── components.css
├── data/
│   └── pi-meter.sqlite
└── scripts/
    └── build-frontend.sh
```

The SQLite database should be outside the source tree or ignored by Git.

## Implementation phases

### Phase 1

Set up the backend and database.

- Create the Python project
- Add FastAPI, SQLAlchemy, Pydantic, and Uvicorn
- Add configuration for the Pi sessions directory
- Create database models
- Create database initialization
- Add health endpoint
- Add startup sync

### Phase 2

Implement session discovery and parsing.

- Discover JSONL files recursively
- Parse session headers
- Parse all known entry types
- Extract message content
- Extract tool calls and tool results
- Extract usage records
- Calculate session totals
- Store parse warnings
- Add file change detection

### Phase 3

Implement the refresh API.

- Add `POST /api/refresh`
- Add sync statistics
- Handle concurrent refresh calls
- Remove records for deleted files
- Preserve malformed-file diagnostics

### Phase 4

Implement aggregate APIs.

- Add date range parsing
- Add summary endpoint
- Add time series endpoint
- Add model breakdown
- Add project breakdown
- Add filter metadata
- Use integer cost storage and convert at the API boundary

### Phase 5

Build the frontend shell.

- Set up Vite and React
- Add routing
- Add CSS tokens
- Build the app shell
- Add date range selector
- Add refresh state
- Add loading and error states
- Add responsive layout

### Phase 6

Build the dashboard.

- Add summary cards
- Add token and cost charts
- Add cost composition
- Add model breakdown
- Add project breakdown
- Add recent sessions
- Connect dashboard filters to the URL

### Phase 7

Build the session detail view.

- Add session header
- Add cost and token breakdown
- Add timeline rendering
- Add user messages
- Add assistant messages
- Add model and thinking metadata
- Add tool calls
- Add collapsible tool results
- Add compaction and branch events
- Add copy controls
- Add transcript search

### Phase 8

Package the local app.

- Build the frontend
- Serve static files through FastAPI
- Add a single startup command
- Bind to `127.0.0.1`
- Document how to change the sessions directory
- Add database location configuration
- Add troubleshooting information

## Formatting rules

The API should return raw values and formatted values separately only where useful.

For example

```json
{
  "costTotal": 3.230584,
  "costTotalFormatted": "$3.2306",
  "totalTokens": 9192386,
  "totalTokensFormatted": "9.19M"
}
```

The frontend should own most presentation formatting so that the API remains reusable.

Recommended display rules

- Tokens under 1,000 show exactly
- Tokens above 1,000 use `1.2K`
- Tokens above 1,000,000 use `1.2M`
- Costs show four or six decimal places when small
- Costs show two decimal places when above one unit
- Never round values before aggregation
- Show the exact value in a tooltip or detail view

## Important data decisions

The plan assumes the following.

- Recorded usage and cost values are authoritative.
- Cost is summed from the stored usage records.
- Costs are displayed in the currency implied by the configured model pricing, probably USD.
- All sessions under the configured sessions directory are included.
- Session names come from `session_info` entries.
- If no name exists, the first user message becomes the display title.
- Manual refresh is the only refresh mechanism after startup.
- The app displays full session content locally.
- Original JSONL files are never modified.
- The transcript initially follows raw file order.
- SQLite is rebuilt incrementally rather than recreated on every request.

## Future additions

These should stay out of the first version.

- Automatic filesystem watching
- User accounts
- Remote deployment
- Multi-machine support
- Session editing
- Deleting sessions
- Export to HTML or Markdown
- Active branch-only transcript reconstruction
- Cost projections
- Budget alerts
- Model price editing
- Full-text search across all sessions
- Light theme
- Custom session tags

## Recommended first milestone

The first usable milestone should include

- SQLite sync
- Dashboard summary
- Today, seven-day, thirty-day, and all-time ranges
- Total cost and complete cost breakdown
- Token breakdown
- Session table
- Clickable session detail page
- User and assistant message rendering
- Collapsible tool calls and results
- Manual refresh
- Local-only server

That gives you the main product value without spending time on secondary features.

## Generated UI design references

The first visual pass uses the `minimalist-ui` direction. It is a warm editorial developer tool rather than a generic dark SaaS dashboard.

Design references are stored in `assets/design-reference/`.

- `dashboard.jpg` covers the usage overview with date range controls, cost and token metrics, usage charts, model and project summaries, and recent sessions.
- `sessions-index.jpg` covers the sessions table with filters, project paths, model labels, token totals, cost, and a 30-day project summary.
- `session-detail-desktop.png` covers the desktop transcript view with cost metrics, the conversation timeline, tool blocks, system events, and session totals.
- `session-detail-mobile.png` covers the narrow session detail layout with stacked metrics and collapsed tool results.
- `sessions-index.html` is an interactive HTML reference for the sessions page.
- `session-detail.html` is an interactive HTML reference for the desktop transcript page.
- `mobile-detail.html` is an interactive HTML reference for the narrow transcript page.

### Visual decisions

- Use a warm bone canvas such as `#F7F6F3` instead of the earlier dark palette.
- Use flat white surfaces, charcoal text, and `1px` hairline borders.
- Keep container corners crisp, between `4px` and `8px`. Avoid large rounded cards.
- Use a refined serif for large cost figures and key editorial headings.
- Use a geometric sans for interface text.
- Use a technical monospace face for file paths, model IDs, tool names, and output.
- Use pale blue for user content, pale lavender for assistant content, pale yellow for system metadata, pale green for successful states, and pale red for errors.
- Keep gradients, glass effects, heavy shadows, neon colors, emojis, and decorative illustrations out of the interface.
- Use typographic hierarchy, whitespace, and borders to separate regions instead of card-heavy layouts.
- Keep the left navigation rail narrow on desktop. Collapse it into a compact top bar on narrow screens.
- Keep the dashboard dense enough for comparison. Use the session detail page for reading and give the transcript more vertical room.

### Page-specific design changes

The dashboard should make total cost the main visual anchor. Place the selected date range and manual refresh control in the header, followed by summary metrics, cost composition, the usage chart, model and project breakdowns, and recent sessions.

The sessions page should prioritize scanning. Use a wide table with realistic session titles, project paths, model names, last activity, token counts, and cost. Keep the project summary as a narrow side column on desktop and place it above the table on smaller screens.

The session detail page should use a vertical event timeline. User messages and assistant messages need distinct edge accents. Tool calls and long tool results should use monospace surfaces and remain collapsed when they exceed the preview threshold. Errors should stay visible and use the pale red treatment. Model changes, compactions, and context edits should appear as quiet metadata events between conversation blocks.

The mobile detail view should stack cost metrics into a two-column grid, keep the transcript readable at the full viewport width, and make expand controls large enough to use with a thumb.

### Frontend implementation notes from the references

- Treat the images and HTML files as visual references, not runtime content.
- Build the actual interface with semantic HTML and real API data.
- Use a maximum content width around `1440px` on desktop.
- Keep the main content column readable and allow the transcript detail view to use a wider layout than ordinary message text.
- Use compact uppercase metadata labels with generous letter spacing.
- Use monospace numerals for tabular metrics so columns align.
- Use small status markers and pastel tags only where they communicate model, state, or event type.
- Use no imagery in the product UI. The generated images are interface references because the app is a data tool and decorative artwork would weaken its focus.
- Support `prefers-reduced-motion`. Keep transitions limited to refresh feedback, chart state changes, and transcript expand or collapse.