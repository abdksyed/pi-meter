"""Shared pytest fixtures for Pi Meter.

Environment isolation happens at *this module's import time*, before any test
module can import ``app.main`` (which creates a global FastAPI app and a real
SQLite engine as a side effect). The environment therefore always points at a
process-local temporary directory:

    PI_METER_SESSIONS_DIR  <tmp>/sessions
    PI_METER_DB_PATH       <tmp>/pi-meter.sqlite
    PI_METER_FRONTEND_DIST <tmp>/dist  (missing build by default)
    TZ=UTC

Fixtures point every test at its own ``tmp_path`` and refresh the cached
settings object, so no test reads ``~/.pi`` or ``data/pi-meter.sqlite``.

Fixture contract (also documented in /tmp/pi-meter-tests-infrastructure.md)
----------------------------------------------------------------------------
``settings``            ``app.config.Settings`` for this test, temp paths.
``make_settings``       Callable ``(**env_overrides) -> Settings`` for config tests.
``app``                 FastAPI app built with ``settings`` (no lifespan).
``client``              ``starlette.testclient.TestClient`` (runs lifespan).
``seeded_client``       ``client`` after the full synthetic corpus is synced.
``db``                  SQLAlchemy ``Session`` bound to the app engine.
``session_factory``     ``sessionmaker`` bound to the app engine.
``sync_service``        ``app.services.sync.SyncService`` for ``settings``.
``corpus``              Full synthetic corpus written (not synced); ``Corpus``.
``empty_corpus``        Empty sessions directory; ``Corpus`` with no files.
``sync_stats``          ``SyncStats`` from one full-corpus sync.
``synced_corpus``       ``corpus`` after that sync.
``write_session``       Callable ``(records, name="session.jsonl", subdir=None) -> Path``.
``parse_records``       Callable ``(records, **kwargs) -> ParsedSession`` (no disk).
``parse_text``          Callable ``(text, **kwargs) -> ParsedSession`` (no disk).
``frontend_dist``       Stub built SPA directory (index.html + assets + fonts).
``frontend_client``     ``client`` whose app serves ``frontend_dist``.
``file_hashes``         Callable ``(directory) -> {relpath: sha256}``.
``assert_files_unchanged`` Callable ``(before, directory)`` asserting no writes.
"""

from __future__ import annotations

import hashlib
import os
import shutil
import sys
import tempfile
import time
from collections.abc import Callable, Iterator, Sequence
from pathlib import Path
from typing import Any

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_ROOT) not in sys.path:  # pragma: no cover - import bootstrap
    sys.path.insert(0, str(REPO_ROOT))

# --------------------------------------------------------------------------- #
# Import-time isolation. MUST run before ``app`` (and especially ``app.main``)
# is imported by any test module.
# --------------------------------------------------------------------------- #

_RUN_TMP = Path(tempfile.mkdtemp(prefix="pi-meter-tests-"))
_DEFAULT_SESSIONS = _RUN_TMP / "sessions"
_DEFAULT_DB = _RUN_TMP / "pi-meter.sqlite"
_DEFAULT_DIST = _RUN_TMP / "dist"
_DEFAULT_SESSIONS.mkdir(parents=True, exist_ok=True)

os.environ.update(
    {
        "PI_METER_SESSIONS_DIR": str(_DEFAULT_SESSIONS),
        "PI_METER_DB_PATH": str(_DEFAULT_DB),
        "PI_METER_FRONTEND_DIST": str(_DEFAULT_DIST),
        "PI_METER_SYNC_ON_STARTUP": "false",
        "PI_METER_LOG_LEVEL": "WARNING",
        "TZ": "UTC",
    }
)
os.environ.pop("PI_METER_DEV_CORS_ORIGIN", None)
if hasattr(time, "tzset"):  # pragma: no cover - not available on Windows
    time.tzset()


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    # ``app.main`` creates a module-level app (and engine) at import time; dispose
    # it so pytest does not report an unclosed SQLite connection at shutdown.
    main_module = sys.modules.get("app.main")
    engine = getattr(getattr(main_module, "app", None), "state", None)
    if engine is not None:
        engine.engine.dispose()
    shutil.rmtree(_RUN_TMP, ignore_errors=True)


# --------------------------------------------------------------------------- #
# Settings
# --------------------------------------------------------------------------- #

#: Environment variables this conftest owns; cleared between tests so a stray
#: ``monkeypatch.setenv`` in one test cannot leak into the next.
MANAGED_ENV = (
    "PI_METER_SESSIONS_DIR",
    "PI_METER_DB_PATH",
    "PI_METER_FRONTEND_DIST",
    "PI_METER_HOST",
    "PI_METER_PORT",
    "PI_METER_SYNC_ON_STARTUP",
    "PI_METER_LOG_LEVEL",
    "PI_METER_MAX_PARSE_WARNINGS",
    "PI_METER_ENTRIES_PAGE_SIZE",
    "PI_METER_ENTRIES_PAGE_MAX",
    "PI_METER_SESSIONS_PAGE_SIZE",
    "PI_METER_SYNC_RUN_RETENTION",
    "PI_METER_ENTRY_INSERT_BATCH",
    "PI_METER_DEV_CORS_ORIGIN",
)


@pytest.fixture(autouse=True)
def _isolate_process_state(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Iterator[None]:
    """Point global settings at this test's temp dir and restore them after."""
    from app.config import get_settings

    monkeypatch.setenv("PI_METER_SESSIONS_DIR", str(tmp_path / "sessions"))
    monkeypatch.setenv("PI_METER_DB_PATH", str(tmp_path / "pi-meter.sqlite"))
    monkeypatch.setenv("PI_METER_FRONTEND_DIST", str(tmp_path / "dist"))
    monkeypatch.setenv("PI_METER_SYNC_ON_STARTUP", "false")
    monkeypatch.setenv("PI_METER_LOG_LEVEL", "WARNING")
    for name in MANAGED_ENV:
        if name not in {
            "PI_METER_SESSIONS_DIR",
            "PI_METER_DB_PATH",
            "PI_METER_FRONTEND_DIST",
            "PI_METER_SYNC_ON_STARTUP",
            "PI_METER_LOG_LEVEL",
        }:
            monkeypatch.delenv(name, raising=False)
    (tmp_path / "sessions").mkdir(parents=True, exist_ok=True)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture
def settings(tmp_path: Path):
    """Test settings with isolated sessions dir, database and (missing) build."""
    from app.config import Settings, get_settings

    sessions_dir = tmp_path / "sessions"
    sessions_dir.mkdir(parents=True, exist_ok=True)
    settings = Settings(
        sessions_dir=sessions_dir,
        db_path=tmp_path / "pi-meter.sqlite",
        frontend_dist=tmp_path / "dist",
        sync_on_startup=False,
        log_level="WARNING",
    )
    get_settings.cache_clear()
    return settings


@pytest.fixture
def make_settings(monkeypatch: pytest.MonkeyPatch) -> Callable[..., Any]:
    """Factory for settings tests: ``make_settings(PI_METER_PORT="9000")``.

    Keyword arguments are names *without* the ``PI_METER_`` prefix. The caller's
    environment is restored by ``monkeypatch`` and the settings cache is cleared
    before each call.
    """
    from app.config import Settings, get_settings

    def factory(**overrides: Any) -> Any:
        for key, value in overrides.items():
            if value is None:
                monkeypatch.delenv(f"PI_METER_{key.upper()}", raising=False)
            else:
                monkeypatch.setenv(f"PI_METER_{key.upper()}", str(value))
        get_settings.cache_clear()
        return Settings()

    return factory


# --------------------------------------------------------------------------- #
# Synthesis helpers (fixtures package)
# --------------------------------------------------------------------------- #


@pytest.fixture
def write_session(settings) -> Callable[..., Path]:
    """Write synthetic JSONL records into the test sessions directory."""
    from tests.fixtures import jsonl as fixture_jsonl

    def write(
        records: Sequence[Any],
        *,
        name: str = "session.jsonl",
        subdir: str | None = None,
    ) -> Path:
        base = settings.sessions_dir / subdir if subdir else settings.sessions_dir
        return fixture_jsonl.write_jsonl(base / name, records)

    return write


@pytest.fixture
def parse_records() -> Callable[..., Any]:
    """Parse synthetic records in memory (no file, no database)."""
    from app.services.parser import parse_session_text
    from tests.fixtures import jsonl as fixture_jsonl

    def parse(records: Sequence[Any], **kwargs: Any) -> Any:
        return parse_session_text(fixture_jsonl.to_jsonl(records), **kwargs)

    return parse


@pytest.fixture
def parse_text() -> Callable[..., Any]:
    """Parse raw JSONL text in memory (no file, no database)."""
    from app.services.parser import parse_session_text

    return parse_session_text


@pytest.fixture
def corpus(settings) -> Any:
    """Full synthetic corpus written under ``settings.sessions_dir`` (not synced)."""
    from tests.fixtures import corpus as fixture_corpus

    return fixture_corpus.write_corpus(settings.sessions_dir, "full")


@pytest.fixture
def empty_corpus(settings) -> Any:
    """Empty sessions directory (no files at all)."""
    from tests.fixtures import corpus as fixture_corpus

    return fixture_corpus.write_corpus(settings.sessions_dir, "empty")


# --------------------------------------------------------------------------- #
# App, client, database
# --------------------------------------------------------------------------- #


@pytest.fixture
def app(settings) -> Iterator[Any]:
    """FastAPI app built with the test settings; engine disposed on teardown."""
    from app.main import create_app

    application = create_app(settings)
    try:
        yield application
    finally:
        application.state.engine.dispose()


@pytest.fixture
def client(app) -> Iterator[Any]:
    """Context-managed TestClient: exercises the real lifespan."""
    from starlette.testclient import TestClient

    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def session_factory(app) -> Any:
    return app.state.session_factory


@pytest.fixture
def db(session_factory) -> Iterator[Any]:
    """SQLAlchemy session for direct database assertions."""
    session = session_factory()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def sync_service(app) -> Any:
    return app.state.sync_service


def _run_full_sync(sync_service: Any) -> Any:
    """Sync the full corpus and assert the documented, deterministic outcome.

    The full corpus deliberately contains two unusable files
    (``edge/empty.jsonl``, ``edge/no_header.jsonl``), so the run is *partial* by
    design. Tests that need an all-clean corpus should write their own files.
    """
    from tests.fixtures import corpus as fixture_corpus

    stats = sync_service.run()
    assert stats.files_seen == fixture_corpus.FULL_VARIANT_FILES, stats
    assert stats.files_failed == len(fixture_corpus.EDGE_CASE_ERROR_FILES), stats
    assert stats.status == fixture_corpus.FULL_VARIANT_SYNC_STATUS, stats
    return stats


@pytest.fixture
def sync_stats(corpus, sync_service) -> Any:
    """SyncStats from one full-corpus sync (contains the two expected failures)."""
    return _run_full_sync(sync_service)


@pytest.fixture
def synced_corpus(corpus, sync_service) -> Any:
    """Full corpus after one sync run (asserted deterministic outcome)."""
    _run_full_sync(sync_service)
    return corpus


@pytest.fixture
def seeded_client(corpus, client, sync_service) -> Any:
    """Client whose database already contains the full synthetic corpus."""
    _run_full_sync(sync_service)
    return client


@pytest.fixture
def seeded_app_client(corpus, app, sync_service) -> Iterator[Any]:
    """Same as ``seeded_client`` but keeps ``app`` reachable for tests."""
    from starlette.testclient import TestClient

    _run_full_sync(sync_service)
    with TestClient(app) as test_client:
        yield test_client


# --------------------------------------------------------------------------- #
# Static frontend build stub
# --------------------------------------------------------------------------- #


@pytest.fixture
def frontend_dist(tmp_path: Path) -> Path:
    """Minimal built-SPA directory: index.html, one asset, one font."""
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "fonts").mkdir(parents=True)
    (dist / "index.html").write_text(
        '<!doctype html><html><head><title>Pi Meter</title></head>'
        '<body><div id="root"></div><script src="/assets/app.js"></script></body></html>',
        encoding="utf-8",
    )
    (dist / "assets" / "app.js").write_text("console.log('pi-meter')\n", encoding="utf-8")
    (dist / "assets" / "app.css").write_text(".pm-shell{}\n", encoding="utf-8")
    (dist / "fonts" / "inter.woff2").write_bytes(b"wOF2-stub-font")
    (dist / "robots.txt").write_text("User-agent: *\nDisallow:\n", encoding="utf-8")
    return dist


@pytest.fixture
def frontend_client(settings, frontend_dist, monkeypatch) -> Iterator[Any]:
    """Client whose app serves ``frontend_dist`` with SPA fallback enabled."""
    from app.config import Settings, get_settings
    from app.main import create_app
    from starlette.testclient import TestClient

    frontend_settings = Settings(
        sessions_dir=settings.sessions_dir,
        db_path=settings.db_path.with_name("pi-meter-frontend.sqlite"),
        frontend_dist=frontend_dist,
        sync_on_startup=False,
        log_level="WARNING",
    )
    monkeypatch.setenv("PI_METER_FRONTEND_DIST", str(frontend_dist))
    get_settings.cache_clear()
    application = create_app(frontend_settings)
    with TestClient(application) as test_client:
        yield test_client
    application.state.engine.dispose()


# --------------------------------------------------------------------------- #
# Source-immutability helpers
# --------------------------------------------------------------------------- #


@pytest.fixture
def file_hashes() -> Callable[[Path], dict[str, str]]:
    """Map every file below ``directory`` to its SHA-256 digest."""

    def snapshot(directory: Path) -> dict[str, str]:
        hashes: dict[str, str] = {}
        for path in sorted(Path(directory).rglob("*")):
            if path.is_file():
                hashes[str(path.relative_to(directory))] = hashlib.sha256(
                    path.read_bytes()
                ).hexdigest()
        return hashes

    return snapshot


@pytest.fixture
def assert_files_unchanged(file_hashes) -> Callable[[dict[str, str], Path], None]:
    """Assert a previously taken snapshot still matches ``directory``."""

    def check(before: dict[str, str], directory: Path) -> None:
        after = file_hashes(directory)
        assert after == before, (
            "fixture source files changed during the test: "
            f"added={sorted(set(after) - set(before))} "
            f"removed={sorted(set(before) - set(after))} "
            f"modified={sorted(k for k in before if k in after and before[k] != after[k])}"
        )

    return check
