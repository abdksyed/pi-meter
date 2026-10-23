#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

command -v uv >/dev/null 2>&1 || {
  echo "Error: uv is required. Install it from https://docs.astral.sh/uv/" >&2
  exit 1
}

command -v npm >/dev/null 2>&1 || {
  echo "Error: npm is required to build the frontend." >&2
  exit 1
}

echo "Installing backend dependencies..."
uv sync

echo "Building frontend..."
(
  cd frontend
  npm install
  npm run build
)

PORT="${PI_METER_PORT:-8787}"
# Bind to all interfaces by default so the tailnet address works directly.
HOST="${PI_METER_HOST:-0.0.0.0}"

configure_tailscale_serve() {
  if ! command -v tailscale >/dev/null 2>&1; then
    echo "Warning: tailscale is not installed; skipping tailscale serve." >&2
    return 0
  fi

  if ! tailscale status >/dev/null 2>&1; then
    echo "Warning: tailscale is not running or not logged in; skipping tailscale serve." >&2
    return 0
  fi

  if tailscale serve --bg "http://127.0.0.1:${PORT}"; then
    echo "Tailscale serve configured for port ${PORT}."
    tailscale serve status || true
  else
    echo "Warning: tailscale serve failed; the app is still available on http://127.0.0.1:${PORT}" >&2
  fi
}

configure_tailscale_serve

LOG_FILE="${ROOT_DIR}/data/pi-meter.log"
PID_FILE="${ROOT_DIR}/data/pi-meter.pid"

if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Pi Meter is already running (pid $(cat "$PID_FILE"))."
  exit 0
fi

echo "Starting Pi Meter at http://${HOST}:${PORT}"
echo "Logs: ${LOG_FILE}"
nohup env PI_METER_HOST="$HOST" PI_METER_PORT="$PORT" uv run python -m app >"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
sleep 2
echo "Pi Meter started (pid $(cat "$PID_FILE")). Stop it with: kill \$(cat ${PID_FILE})"
echo "Safe to close this terminal."
