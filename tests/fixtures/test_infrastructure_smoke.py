"""Infrastructure smoke checks: the fixtures themselves must work.

These are not feature tests. They prove that the conftest contract (isolated
settings, app factory, lifespan client, database session, corpus writer) is
usable by Workers 2-7 and that no fixture touches live Pi data.
"""

from __future__ import annotations

from pathlib import Path


def test_settings_are_isolated_and_inside_tmp(settings, tmp_path):
    assert settings.sessions_dir == tmp_path / "sessions"
    assert settings.db_path == tmp_path / "pi-meter.sqlite"
    assert settings.frontend_dist == tmp_path / "dist"
    assert settings.sync_on_startup is False
    assert str(settings.sessions_dir).startswith(str(tmp_path))
    assert "agent/sessions" not in str(settings.sessions_dir)


def test_importing_app_main_does_not_create_real_database(settings):
    from app.config import get_settings
    from app import main  # noqa: PLC0415 - the import side effect is the point

    assert main.app is not None
    current = get_settings()
    assert current.db_path == settings.db_path
    assert current.sessions_dir == settings.sessions_dir
    assert "agent/sessions" not in str(current.sessions_dir)


def test_client_exercises_lifespan_and_health(client, settings):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["databaseOk"] is True
    assert body["sessionsDir"] == str(settings.sessions_dir)
    assert body["syncInProgress"] is False


def test_database_engine_points_at_temp_file(app, settings):
    assert settings.db_path.is_file()
    with app.state.engine.connect() as connection:
        version = connection.exec_driver_sql("PRAGMA user_version").scalar_one()
    assert version == 1


def test_db_fixture_queries_the_temp_database(db):
    from sqlalchemy import text

    assert db.execute(text("SELECT 1")).scalar_one() == 1


def test_corpus_and_sync_are_isolated(corpus, sync_service, db, settings):
    from sqlalchemy import text

    empty = db.execute(text("SELECT COUNT(*) FROM sessions")).scalar_one()
    assert empty == 0

    stats = sync_service.run()
    from tests.fixtures import corpus as fixture_corpus

    assert stats.status == fixture_corpus.FULL_VARIANT_SYNC_STATUS
    assert stats.files_seen == fixture_corpus.FULL_VARIANT_FILES
    assert stats.files_failed == len(fixture_corpus.EDGE_CASE_ERROR_FILES)
    indexed = db.execute(text("SELECT COUNT(*) FROM sessions")).scalar_one()
    assert indexed == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS

    # The database lives in the pytest tmp dir, not in the repository.
    assert settings.db_path.is_file()
    assert settings.db_path.is_relative_to(settings.db_path.parents[0])
    assert not settings.db_path.is_relative_to(Path.cwd() / "data")


def test_seeded_client_returns_synthetic_sessions(seeded_client, corpus):
    response = seeded_client.get("/api/sessions", params={"range": "all", "pageSize": 100})
    assert response.status_code == 200
    session_ids = {row["sessionId"] for row in response.json()["sessions"]}
    from tests.fixtures import corpus as fixture_corpus

    assert fixture_corpus.MAIN_ID in session_ids
    assert fixture_corpus.BETA_ID in session_ids


def test_frontend_client_serves_stub_build(frontend_client, frontend_dist):
    index = frontend_client.get("/")
    assert index.status_code == 200
    assert "Pi Meter" in index.text
    asset = frontend_client.get("/assets/app.js")
    assert asset.status_code == 200
    font = frontend_client.get("/fonts/inter.woff2")
    assert font.status_code == 200
    deep_link = frontend_client.get("/sessions/anything")
    assert deep_link.status_code == 200
    assert deep_link.text == index.text


def test_missing_frontend_build_serves_notice(client):
    response = client.get("/")
    assert response.status_code == 200
    assert "frontend build was not found" in response.text
    assert client.get("/api/unknown").status_code == 404


def test_write_session_and_parser_helpers(write_session, parse_records, settings):
    from tests.fixtures import corpus

    path = write_session(corpus.main_session_records(), name="main.jsonl", subdir="alpha")
    assert path.is_file()
    assert path.parent == settings.sessions_dir / "alpha"

    parsed = parse_records(corpus.main_session_records())
    assert parsed.session_id == corpus.MAIN_ID
    assert parsed.totals.total_tokens == corpus.MAIN.total_tokens


def test_source_immutability_helpers(corpus, file_hashes, assert_files_unchanged, sync_service):
    before = file_hashes(corpus.root)
    sync_service.run()
    assert_files_unchanged(before, corpus.root)


def test_make_settings_factory_overrides_environment(make_settings, tmp_path):
    custom = make_settings(
        sessions_dir=tmp_path / "custom-sessions",
        port="9000",
        sync_on_startup="true",
    )
    assert custom.port == 9000
    assert custom.sync_on_startup is True
    assert custom.sessions_dir == (tmp_path / "custom-sessions").resolve()
    assert custom.database_url.endswith("pi-meter.sqlite")


def test_empty_corpus_fixture_leaves_sessions_dir_empty(empty_corpus, settings):
    assert empty_corpus.sessions == {}
    assert list(settings.sessions_dir.iterdir()) == []


def test_sync_stats_fixture_reports_expected_outcome(sync_stats):
    from tests.fixtures import corpus as fixture_corpus

    assert sync_stats.status == fixture_corpus.FULL_VARIANT_SYNC_STATUS
    assert sync_stats.files_added == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS
    assert sync_stats.files_failed == len(fixture_corpus.EDGE_CASE_ERROR_FILES)
