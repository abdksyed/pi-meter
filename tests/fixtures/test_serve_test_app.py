"""Checks for the isolated E2E server script (``scripts/serve-test-app.py``).

Only the pure helpers are imported; the server itself is exercised by
``frontend/playwright.config.ts`` and by running the script manually. Nothing
here starts a listening socket.
"""

from __future__ import annotations

import importlib.util
import socket
from pathlib import Path

import pytest

SCRIPT = Path(__file__).resolve().parents[2] / "scripts" / "serve-test-app.py"


def load_script_module():
    spec = importlib.util.spec_from_file_location("serve_test_app", SCRIPT)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture(scope="module")
def serve_module():
    return load_script_module()


def test_script_exists_and_is_documented(serve_module):
    assert SCRIPT.is_file()
    assert "synthetic fixtures" in serve_module.__doc__
    assert serve_module.DEFAULT_PORT == 8899


def test_prepare_fixtures_writes_only_inside_fixtures_dir(serve_module, tmp_path):
    sessions_dir, db_path = serve_module.prepare_fixtures(
        tmp_path / "e2e", reset=True, include_edge=True
    )
    from tests.fixtures import corpus as fixture_corpus

    assert sessions_dir == (tmp_path / "e2e" / "sessions").resolve()
    assert db_path == (tmp_path / "e2e" / "pi-meter-e2e.sqlite").resolve()
    assert str(sessions_dir).startswith(str(tmp_path.resolve()))
    written = sorted(path.relative_to(sessions_dir).as_posix() for path in sessions_dir.rglob("*.jsonl"))
    assert len(written) == fixture_corpus.FULL_VARIANT_FILES
    assert "alpha/2026-01-15T09-00-00_main.jsonl" in written
    assert not db_path.exists()


def test_prepare_fixtures_without_edge_files(serve_module, tmp_path):
    sessions_dir, _ = serve_module.prepare_fixtures(
        tmp_path / "e2e-no-edge", reset=True, include_edge=False
    )
    from tests.fixtures import corpus as fixture_corpus

    written = list(sessions_dir.rglob("*.jsonl"))
    assert len(written) == fixture_corpus.FULL_VARIANT_FILES - len(
        fixture_corpus.EDGE_CASE_FILES
    )
    assert not (sessions_dir / "edge").exists()


def test_prepare_fixtures_no_reset_keeps_existing_files(serve_module, tmp_path):
    fixtures = tmp_path / "e2e-keep"
    sessions_dir, _ = serve_module.prepare_fixtures(fixtures, reset=True, include_edge=False)
    marker = sessions_dir / "custom" / "added.jsonl"
    marker.parent.mkdir(parents=True, exist_ok=True)
    marker.write_text('{"type": "session", "id": "custom"}\n', encoding="utf-8")

    serve_module.prepare_fixtures(fixtures, reset=False, include_edge=False)
    assert marker.is_file()


def test_port_is_free_reports_occupied_port(serve_module):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        listener.listen(1)
        port = listener.getsockname()[1]
        assert serve_module.port_is_free("127.0.0.1", port) is False
    assert serve_module.port_is_free("127.0.0.1", port) is True
    assert serve_module.port_is_free("127.0.0.1", 0) is True


def test_parse_args_defaults_and_overrides(serve_module, monkeypatch):
    monkeypatch.delenv("PI_METER_E2E_PORT", raising=False)
    assert serve_module.parse_args([]).port == serve_module.DEFAULT_PORT
    assert serve_module.parse_args(["--port", "9123", "--no-reset"]).no_reset is True
    monkeypatch.setenv("PI_METER_E2E_PORT", "9222")
    assert serve_module.parse_args([]).port == 9222
