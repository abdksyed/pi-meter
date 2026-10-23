"""Integration tests for the SQLite index schema (``app/db.py`` + ``app/models.py``).

Every test uses the per-test temporary database created by the shared
``app``/``settings`` fixtures; no test can reach ``data/pi-meter.sqlite`` or the
developer's real Pi data.
"""

from __future__ import annotations

import time
from pathlib import Path

import pytest
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError

from app.db import (
    SCHEMA_VERSION,
    create_db_engine,
    create_session_factory,
    init_db,
    now_ms,
    reset_db,
)
from app.models import EntryRow, SessionRow
from tests.fixtures import corpus
from tests.fixtures import jsonl as j

EXPECTED_TABLES = {"sessions", "entries", "sync_runs"}

EXPECTED_INDEXES = {
    "ix_sessions_started_at",
    "ix_sessions_last_activity_at",
    "ix_sessions_first_usage_at",
    "ix_sessions_last_usage_at",
    "ix_sessions_cwd",
    "ix_sessions_session_name",
    "ix_sessions_cost_total_micro",
    "ix_sessions_cwd_last_activity_at",
    "ix_entries_session_timestamp",
    "ix_entries_timestamp_ms",
    "ix_entries_entry_type",
    "ix_entries_role",
    "ix_entries_model",
    "ix_entries_provider",
    "ix_entries_usage_timestamp",
    "ix_entries_usage_model",
    "ix_sync_runs_started_at",
}


def _make_session(session_id: str, path: str, **overrides) -> SessionRow:
    values = {
        "session_id": session_id,
        "file_path": path,
        "file_name": Path(path).name,
    }
    values.update(overrides)
    return SessionRow(**values)


# --------------------------------------------------------------------------- #
# Bootstrap
# --------------------------------------------------------------------------- #


def test_schema_bootstrap_creates_tables_and_stamps_version(app, settings):
    assert settings.db_path.is_file()
    with app.state.engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA user_version").scalar_one() == SCHEMA_VERSION
        tables = {
            row[0]
            for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
    assert EXPECTED_TABLES <= tables


def test_expected_indexes_exist(app):
    with app.state.engine.connect() as conn:
        indexes = {
            row[0]
            for row in conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type = 'index'"
            )
        }
    # Partial (WHERE usage_present = 1) indexes are part of this set too.
    assert EXPECTED_INDEXES <= indexes


def test_sqlite_pragmas_are_applied(app):
    with app.state.engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA journal_mode").scalar_one().lower() == "wal"
        assert conn.exec_driver_sql("PRAGMA foreign_keys").scalar_one() == 1
        assert conn.exec_driver_sql("PRAGMA busy_timeout").scalar_one() == 5000


def test_entries_foreign_key_cascades_on_delete(app):
    with app.state.engine.connect() as conn:
        foreign_keys = conn.exec_driver_sql("PRAGMA foreign_key_list(entries)").fetchall()

    assert len(foreign_keys) == 1
    # (id, seq, table, from, to, on_update, on_delete, match)
    _pk, _seq, table, from_column, to_column, _on_update, on_delete, _match = foreign_keys[0]
    assert table == "sessions"
    assert from_column == "session_id"
    assert to_column == "id"
    assert on_delete.upper() == "CASCADE"


def test_init_db_is_idempotent(app):
    init_db(app.state.engine)
    init_db(app.state.engine)
    with app.state.engine.connect() as conn:
        assert conn.exec_driver_sql("PRAGMA user_version").scalar_one() == SCHEMA_VERSION


def test_newer_schema_version_is_rejected(app):
    with app.state.engine.begin() as conn:
        conn.exec_driver_sql("PRAGMA user_version = 99")
    with pytest.raises(RuntimeError, match="newer than this app"):
        init_db(app.state.engine)


def test_reset_db_removes_the_database_and_wal_sidecars(tmp_path):
    from app.config import Settings

    settings = Settings(
        sessions_dir=tmp_path / "sessions",
        db_path=tmp_path / "reset.sqlite",
        frontend_dist=tmp_path / "dist",
        sync_on_startup=False,
    )
    engine = create_db_engine(settings)
    init_db(engine)
    factory = create_session_factory(engine)
    with factory() as session:
        session.add(_make_session("aaaaaaaa-0000-4000-8000-000000000001", "/tmp/a.jsonl"))
        session.commit()
    assert settings.db_path.is_file()

    reset_db(engine)

    assert not settings.db_path.exists()
    assert not Path(f"{settings.db_path}-wal").exists()
    assert not Path(f"{settings.db_path}-shm").exists()
    assert engine.url.database == str(settings.db_path)


def test_now_ms_is_utc_epoch_milliseconds():
    before = int(time.time() * 1000)
    value = now_ms()
    after = int(time.time() * 1000)
    assert isinstance(value, int)
    assert before <= value <= after
    # Epoch milliseconds, not seconds or microseconds.
    assert value > 1_600_000_000_000


# --------------------------------------------------------------------------- #
# Constraints
# --------------------------------------------------------------------------- #


def test_parse_status_check_constraint(session_factory):
    session = session_factory()
    try:
        session.add(
            _make_session(
                "aaaaaaaa-0000-4000-8000-000000000002",
                "/tmp/bad-status.jsonl",
                parse_status="bogus",
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.rollback()
        session.close()


def test_sync_run_status_check_constraint(session_factory):
    from app.models import SyncRun

    session = session_factory()
    try:
        session.add(SyncRun(status="bogus"))
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.rollback()
        session.close()


def test_session_id_and_file_path_are_unique(session_factory):
    first = session_factory()
    try:
        first.add(_make_session("aaaaaaaa-0000-4000-8000-000000000003", "/tmp/one.jsonl"))
        first.commit()
    finally:
        first.close()

    duplicate_id = session_factory()
    try:
        duplicate_id.add(
            _make_session("aaaaaaaa-0000-4000-8000-000000000003", "/tmp/two.jsonl")
        )
        with pytest.raises(IntegrityError):
            duplicate_id.commit()
    finally:
        duplicate_id.rollback()
        duplicate_id.close()

    duplicate_path = session_factory()
    try:
        duplicate_path.add(
            _make_session("aaaaaaaa-0000-4000-8000-000000000004", "/tmp/one.jsonl")
        )
        with pytest.raises(IntegrityError):
            duplicate_path.commit()
    finally:
        duplicate_path.rollback()
        duplicate_path.close()


def test_entry_index_is_unique_per_session(session_factory):
    session = session_factory()
    try:
        row = _make_session("aaaaaaaa-0000-4000-8000-000000000005", "/tmp/e.jsonl")
        session.add(row)
        session.commit()
        session.add(
            EntryRow(session_id=row.id, entry_index=0, entry_type="message", role="user")
        )
        session.commit()
        session.add(
            EntryRow(session_id=row.id, entry_index=0, entry_type="message", role="user")
        )
        with pytest.raises(IntegrityError):
            session.commit()
    finally:
        session.rollback()
        session.close()


# --------------------------------------------------------------------------- #
# Persistence behaviour
# --------------------------------------------------------------------------- #


def test_deleting_a_session_cascades_to_its_entries(write_session, sync_service, db):
    write_session(corpus.main_session_records(), name="main.jsonl", subdir="alpha")
    sync_service.run()

    entries_before = db.execute(select(func.count()).select_from(EntryRow)).scalar_one()
    assert entries_before == corpus.MAIN.entry_count

    db.execute(delete(SessionRow).where(SessionRow.session_id == corpus.MAIN_ID))
    db.commit()

    assert db.execute(select(func.count()).select_from(SessionRow)).scalar_one() == 0
    assert db.execute(select(func.count()).select_from(EntryRow)).scalar_one() == 0


def test_synced_rows_store_documented_units(write_session, sync_service, db):
    write_session(corpus.main_session_records(), name="main.jsonl", subdir="alpha")
    sync_service.run()

    row = db.execute(
        select(SessionRow).where(SessionRow.session_id == corpus.MAIN_ID)
    ).scalar_one()

    # Timestamps are UTC epoch milliseconds.
    assert row.started_at == j.epoch_ms(corpus.MAIN.started_at)
    assert row.last_activity_at == j.epoch_ms(corpus.MAIN.last_activity_at)
    # Costs are integer micro-units.
    assert row.cost_total_micro == corpus.MAIN.cost_total_micro
    assert row.total_tokens == corpus.MAIN.total_tokens
    assert row.parse_status == corpus.MAIN.parse_status

    entry = db.execute(
        select(EntryRow).where(EntryRow.entry_id == "a1")
    ).scalar_one()
    assert entry.session_id == row.id
    assert entry.model == "claude-sonnet-4-5"
    assert entry.usage_present is True
    assert entry.total_tokens == 6040  # input + output + cache read + cache write
    assert entry.timestamp_ms == j.epoch_ms(corpus.MAIN_TIMES["assistant1"])


def test_database_file_lives_inside_the_test_tmp_directory(app, settings, tmp_path):
    assert settings.db_path.is_file()
    assert settings.db_path.resolve().is_relative_to(tmp_path.resolve())
    assert "data/pi-meter.sqlite" not in str(settings.db_path)
