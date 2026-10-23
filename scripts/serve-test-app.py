#!/usr/bin/env python3
"""Isolated test server for Playwright/browser runs.

Serves the built frontend (``frontend/dist``) plus the real API, but indexes
*only synthetic fixtures* written by ``tests/fixtures/corpus.py``. It never
reads ``~/.pi`` and never touches ``data/pi-meter.sqlite``: both the sessions
directory and the SQLite file live under the ``--fixtures-dir`` you give it
(default: a throw-away temp directory).

Usage
-----
    uv run python scripts/serve-test-app.py                       # port 8899
    uv run python scripts/serve-test-app.py --port 9123
    uv run python scripts/serve-test-app.py --port 0             # ephemeral
    uv run python scripts/serve-test-app.py --fixtures-dir /tmp/pm-e2e --no-reset

The script prints one banner line when the server is listening::

    PI-METER-TEST-APP READY url=http://127.0.0.1:8899 fixtures=... db=... dist=...

``frontend/playwright.config.ts`` starts and stops this script itself, so
browser tests never reuse an unrelated server and never kill a process they did
not spawn.

Guarantees
----------
* Loopback only (the ``Settings`` validator also enforces this).
* ``--port`` is checked before startup; an occupied port exits with code 2.
* The generated sessions directory contains exactly the synthetic corpus plus
  the documented edge-case files; ``--no-reset`` keeps an existing directory so
  tests can mutate files and exercise manual refresh.
* On exit the ephemeral fixtures directory is removed (not when passed
  explicitly with ``--fixtures-dir``).
"""

from __future__ import annotations

import argparse
import os
import shutil
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND_DIST = REPO_ROOT / "frontend" / "dist"
DEFAULT_FIXTURES_PREFIX = "pi-meter-e2e-"
DEFAULT_PORT = 8899


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--port", type=int, default=int(os.environ.get("PI_METER_E2E_PORT", DEFAULT_PORT)))
    parser.add_argument("--host", default="127.0.0.1", choices=["127.0.0.1", "localhost", "::1"])
    parser.add_argument("--fixtures-dir", type=Path, default=None)
    parser.add_argument("--dist", type=Path, default=FRONTEND_DIST)
    parser.add_argument("--no-reset", action="store_true", help="keep existing fixture files")
    parser.add_argument("--no-edge", action="store_true", help="skip the malformed/empty edge files")
    parser.add_argument("--log-level", default="warning")
    return parser.parse_args(argv)


def port_is_free(host: str, port: int) -> bool:
    if port == 0:
        return True
    with socket.socket(socket.AF_INET6 if ":" in host else socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind((host, port))
        except OSError:
            return False
    return True


def prepare_fixtures(fixtures_dir: Path, *, reset: bool, include_edge: bool) -> tuple[Path, Path]:
    """Write the synthetic corpus and return ``(sessions_dir, db_path)``."""
    sessions_dir = (fixtures_dir / "sessions").resolve()
    db_path = (fixtures_dir / "pi-meter-e2e.sqlite").resolve()
    if reset:
        shutil.rmtree(fixtures_dir, ignore_errors=True)
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    sessions_dir.mkdir(parents=True, exist_ok=True)
    for suffix in ("", "-wal", "-shm"):
        Path(f"{db_path}{suffix}").unlink(missing_ok=True)

    if reset or not any(sessions_dir.rglob("*.jsonl")):
        sys.path.insert(0, str(REPO_ROOT))
        from tests.fixtures import corpus as fixture_corpus

        if include_edge:
            fixture_corpus.write_corpus(sessions_dir, "full")
        else:
            for relative, records in fixture_corpus.corpus_file_specs():
                from tests.fixtures import jsonl as fixture_jsonl

                fixture_jsonl.write_jsonl(sessions_dir / relative, records)
    return sessions_dir, db_path


def build_app(sessions_dir: Path, db_path: Path, dist: Path, log_level: str):
    """Configure the environment, then import and build the app."""
    os.environ.update(
        {
            "PI_METER_SESSIONS_DIR": str(sessions_dir),
            "PI_METER_DB_PATH": str(db_path),
            "PI_METER_FRONTEND_DIST": str(dist),
            "PI_METER_SYNC_ON_STARTUP": "true",
            "PI_METER_LOG_LEVEL": log_level.upper(),
        }
    )
    os.environ.pop("PI_METER_DEV_CORS_ORIGIN", None)

    from app.config import Settings, get_settings

    get_settings.cache_clear()
    settings = Settings()
    # Defensive: never let configuration point at live data.
    assert settings.sessions_dir == sessions_dir, settings.sessions_dir
    assert settings.db_path == db_path, settings.db_path

    from app.main import create_app

    return create_app(settings)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    if not 0 <= args.port <= 65535:
        print(f"error: invalid port {args.port}", file=sys.stderr)
        return 2
    if not port_is_free(args.host, args.port):
        print(
            f"error: {args.host}:{args.port} is already in use; "
            "choose another --port (or PI_METER_E2E_PORT)",
            file=sys.stderr,
        )
        return 2

    dist = args.dist.resolve()
    if not (dist / "index.html").is_file():
        print(
            f"error: frontend build not found at {dist}\n"
            "       build it first: (cd frontend && npm run build)",
            file=sys.stderr,
        )
        return 3

    ephemeral = args.fixtures_dir is None
    fixtures_dir = (
        Path(tempfile.mkdtemp(prefix=DEFAULT_FIXTURES_PREFIX)).resolve()
        if ephemeral
        else args.fixtures_dir.resolve()
    )
    sessions_dir, db_path = prepare_fixtures(
        fixtures_dir, reset=not args.no_reset, include_edge=not args.no_edge
    )

    import signal

    import uvicorn

    app = build_app(sessions_dir, db_path, dist, args.log_level)
    config = uvicorn.Config(
        app,
        host=args.host,
        port=args.port,
        log_level=args.log_level.lower(),
        access_log=False,
    )
    server = uvicorn.Server(config)

    def announce() -> None:
        deadline = time.monotonic() + 30
        while not server.started and time.monotonic() < deadline:
            time.sleep(0.05)
        if not server.started:
            print("error: server did not start within 30s", file=sys.stderr)
            return
        actual_port = args.port
        try:
            sockets = server.servers[0].sockets
            actual_port = sockets[0].getsockname()[1]
        except (AttributeError, IndexError):  # pragma: no cover - uvicorn internals
            pass
        print(
            f"PI-METER-TEST-APP READY url=http://{args.host}:{actual_port} "
            f"fixtures={fixtures_dir} db={db_path} dist={dist}",
            flush=True,
        )

    threading.Thread(target=announce, daemon=True).start()

    def request_shutdown(_signum, _frame) -> None:
        """Let uvicorn exit cleanly so the ``finally`` cleanup still runs."""
        server.should_exit = True

    signal.signal(signal.SIGTERM, request_shutdown)
    try:
        server.run()
    finally:
        if ephemeral:
            shutil.rmtree(fixtures_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
