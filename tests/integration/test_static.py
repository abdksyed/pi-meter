"""Static frontend serving tests (``app/static.py``).

Two states are covered: the built-SPA stub provided by the ``frontend_dist``
fixture and the real "build missing" state used by the ``client`` fixture.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from starlette.testclient import TestClient

from app.config import Settings, get_settings
from app.main import create_app


def _make_client(tmp_path: Path, dist: Path, monkeypatch):
    monkeypatch.setenv("PI_METER_FRONTEND_DIST", str(dist))
    get_settings.cache_clear()
    settings = Settings(
        sessions_dir=tmp_path / "sessions",
        db_path=tmp_path / "static.sqlite",
        frontend_dist=dist,
        sync_on_startup=False,
        log_level="WARNING",
    )
    (tmp_path / "sessions").mkdir(exist_ok=True)
    return settings, create_app(settings)


# --------------------------------------------------------------------------- #
# Missing build
# --------------------------------------------------------------------------- #


def test_missing_build_serves_a_notice_at_root(client, settings):
    assert not (settings.frontend_dist / "index.html").exists()
    response = client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "frontend build was not found" in response.text
    assert "/api/health" in response.text


def test_missing_build_does_not_break_the_api(client):
    assert client.get("/api/health").status_code == 200
    # Unknown API paths stay JSON 404s; they never fall back to HTML.
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert "detail" in response.json()


def test_missing_build_deep_link_is_not_served_as_spa(client):
    # Without a build there is no catch-all route, so client routes 404.
    assert client.get("/sessions/abc").status_code == 404


# --------------------------------------------------------------------------- #
# Built SPA
# --------------------------------------------------------------------------- #


def test_built_index_is_served(frontend_client):
    response = frontend_client.get("/")
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert '<div id="root"></div>' in response.text


@pytest.mark.parametrize(
    "route",
    [
        "/sessions",
        "/sessions/11111111-1111-4111-8111-111111111111",
        "/sessions/11111111-1111-4111-8111-111111111111?entry=12",
        "/settings",
        "/deep/unknown/route",
    ],
)
def test_spa_fallback_serves_index_for_client_routes(frontend_client, route):
    response = frontend_client.get(route)
    assert response.status_code == 200
    assert '<div id="root"></div>' in response.text


def test_hashed_assets_and_fonts_are_served_with_content_types(frontend_client, frontend_dist):
    asset = frontend_client.get("/assets/app.js")
    assert asset.status_code == 200
    assert asset.text == "console.log('pi-meter')\n"
    assert "javascript" in asset.headers["content-type"]

    css = frontend_client.get("/assets/app.css")
    assert css.status_code == 200
    assert css.headers["content-type"].startswith("text/css")

    font = frontend_client.get("/fonts/inter.woff2")
    assert font.status_code == 200
    assert font.content == b"wOF2-stub-font"
    assert font.headers["content-type"] == "font/woff2"

    # Every font is local: no external font host is referenced from the stub.
    assert "fonts.googleapis.com" not in frontend_dist.joinpath("index.html").read_text()


def test_missing_asset_returns_404(frontend_client):
    response = frontend_client.get("/assets/missing.js")
    assert response.status_code == 404
    assert response.json() == {"detail": "Not Found"}


def test_top_level_static_file_is_served_when_present(frontend_client):
    response = frontend_client.get("/robots.txt")
    assert response.status_code == 200
    assert "User-agent" in response.text


def test_unknown_top_level_file_falls_back_to_index(frontend_client):
    # The SPA catch-all serves index.html for unmatched non-API paths.
    response = frontend_client.get("/not-a-real-file.txt")
    assert response.status_code == 200
    assert '<div id="root"></div>' in response.text


@pytest.mark.parametrize(
    "attempt",
    [
        "/../index.html",
        "/../../etc/passwd",
        "/assets/../../etc/passwd",
        "/assets/%2e%2e/%2e%2e/etc/passwd",
        "/assets/..%2f..%2fetc%2fpasswd",
    ],
)
def test_directory_traversal_never_leaks_files_outside_the_build(frontend_client, attempt):
    response = frontend_client.get(attempt)
    # Either the SPA index or a 404 — never host file content.
    assert response.status_code in (200, 404)
    assert "root:" not in response.text
    assert "/etc/passwd" not in response.text
    if response.status_code == 200:
        assert '<div id="root"></div>' in response.text


@pytest.mark.parametrize("api_path", ["/api", "/api/", "/api/nope", "/api/summary/nope"])
def test_api_prefix_never_falls_back_to_the_spa(frontend_client, api_path):
    response = frontend_client.get(api_path)
    assert response.status_code == 404
    assert "text/html" not in response.headers["content-type"]
    assert "detail" in response.json()


def test_api_and_spa_coexist(frontend_client):
    assert frontend_client.get("/api/health").json()["databaseOk"] is True
    assert frontend_client.get("/api/sessions", params={"range": "all"}).json()[
        "total"
    ] == 0
    assert '<div id="root"></div>' in frontend_client.get("/sessions").text


def test_docs_routes_still_work_with_a_build(frontend_client):
    assert frontend_client.get("/docs").status_code == 200
    assert frontend_client.get("/openapi.json").status_code == 200


def test_build_without_optional_directories_still_serves_index(tmp_path, monkeypatch):
    dist = tmp_path / "minimal-dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html>minimal</html>", encoding="utf-8")
    _settings, application = _make_client(tmp_path, dist, monkeypatch)
    try:
        with TestClient(application) as client:
            assert client.get("/").text == "<html>minimal</html>"
            assert client.get("/sessions/x").text == "<html>minimal</html>"
            # No assets/fonts directories exist, so unmatched paths fall back
            # to index.html through the SPA catch-all (never a directory mount).
            assert client.get("/assets/app.js").text == "<html>minimal</html>"
            assert client.get("/fonts/inter.woff2").text == "<html>minimal</html>"
    finally:
        application.state.engine.dispose()
        get_settings.cache_clear()
