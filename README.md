# Pi Meter

A local dashboard for Pi coding-agent session usage, recorded costs, and conversations. FastAPI serves a React frontend and indexes JSONL sessions in SQLite. Source sessions remain unchanged. Refresh is manual after the initial startup sync.

## Run locally

Requires Python 3.12 or newer, uv, and Node.js with npm.

```bash
./deploy.sh
```

The script installs dependencies, builds the frontend, and starts the server in the background. The default address is `http://127.0.0.1:8787`. Logs go to `data/pi-meter.log`; stop the server with `kill $(cat data/pi-meter.pid)`.

When Tailscale is available and logged in, the script also runs `tailscale serve` and the app is reachable at `https://<machine>.<tailnet>.ts.net/` for devices on your tailnet. Funnel is not enabled, so it is not exposed to the public internet.

```bash
PI_METER_PORT=9000 ./deploy.sh
```

Settings use the `PI_METER_` environment prefix and can also be placed in `.env`. The sessions directory defaults to `~/.pi/agent/sessions`. The disposable index defaults to `data/pi-meter.sqlite`. Do not delete the database or its WAL files while the server is running.

## Project layout

- `app/` contains the backend, parser, database models, sync service, and API routes.
- `frontend/src/` contains the application UI.
- `frontend/public/fonts/` contains the canonical local font files.
- `assets/design-reference/` contains the design screenshots and HTML drafts. These are references, not runtime application pages.
- `data/` contains the local SQLite index and is excluded from version control except for `.gitkeep`.
- `scripts/` contains supporting build commands.
- `deploy.sh` builds and starts the app.
- `PLAN.md` contains the original implementation plan. Historical file locations in that document may predate the cleanup.
- `test_plan.md` contains the testing scope, regression checklist, and file ownership for future test workers.

Dependencies in `.venv/` and `frontend/node_modules/`, plus the built `frontend/dist/`, are generated and ignored. They are retained locally so cleanup does not break the running app.

## Current checks

```bash
cd frontend
npm run typecheck
npm run build
```

Automated test tooling is not installed yet. Follow `test_plan.md` before implementing the suites.

## Known limitations

Sub-agent relationships currently use an explicit map for the known local sessions. UUID mentions in transcript text do not establish relationships. The displayed sub-agent call count currently counts mapped children rather than actual tool invocations.

The frontend development proxy and status display currently use port 8743, while the backend default is 8787. The testing plan tracks this mismatch. Production builds are served by FastAPI on its configured port.
