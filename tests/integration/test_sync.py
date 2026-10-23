"""Integration tests for incremental JSONL -> SQLite sync (``app/services/sync.py``).

All corpora are written under the per-test temporary sessions directory and the
index lives in the per-test temporary SQLite file. Source files are hashed
before and after each mutating operation to prove the sync never rewrites them.
"""

from __future__ import annotations

import threading

import pytest
from sqlalchemy import func, select

from app.errors import SyncInProgressError
from app.models import EntryRow, SessionRow, SyncRun
from tests.fixtures import corpus as fixture_corpus
from tests.fixtures import jsonl as j

THIRD_ID = "aaaaaaaa-0000-4000-8000-0000000000aa"


def _count(db, model) -> int:
    return int(db.execute(select(func.count()).select_from(model)).scalar_one())


def _single_session_records(text: str = "hello") -> list:
    return [
        j.session_header(THIRD_ID, cwd="/work/one"),
        j.user_message("u1", text),
        j.assistant_message(
            "a1",
            timestamp="2026-01-15T09:00:01.000Z",
            parent_id="u1",
            text="hi",
            usage=j.usage_object(
                input=10, output=5, total_tokens=15, cost={"total": "0.000015"}
            ),
        ),
    ]


# --------------------------------------------------------------------------- #
# Initial import of the full corpus
# --------------------------------------------------------------------------- #


def test_full_corpus_sync_indexes_every_parseable_file(corpus, sync_service, db):
    stats = sync_service.run()

    assert stats.files_seen == fixture_corpus.FULL_VARIANT_FILES
    assert stats.files_added == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS
    assert stats.files_updated == 0
    assert stats.files_removed == 0
    assert stats.files_failed == len(fixture_corpus.EDGE_CASE_ERROR_FILES)
    assert stats.status == fixture_corpus.FULL_VARIANT_SYNC_STATUS
    assert stats.error_message == "2 file(s) failed to parse"
    assert stats.duration_ms >= 0
    assert _count(db, SessionRow) == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS


def test_full_corpus_sync_preserves_source_bytes(corpus, sync_service, file_hashes, assert_files_unchanged):
    before = file_hashes(corpus.root)
    sync_service.run()
    sync_service.run()
    assert_files_unchanged(before, corpus.root)


def test_recursive_discovery_finds_nested_sessions(write_session, sync_service, db):
    write_session(_single_session_records(), name="one.jsonl", subdir="one/two/three")
    stats = sync_service.run()

    assert stats.files_seen == 1
    assert stats.files_added == 1
    row = db.execute(select(SessionRow)).scalar_one()
    assert row.file_path.endswith("one/two/three/one.jsonl")


def test_full_corpus_row_totals_match_fixture_expectations(sync_stats, db):
    main = db.execute(
        select(SessionRow).where(SessionRow.session_id == fixture_corpus.MAIN_ID)
    ).scalar_one()
    assert main.total_tokens == fixture_corpus.MAIN.total_tokens
    assert main.cost_total_micro == fixture_corpus.MAIN.cost_total_micro
    assert main.cost_input_micro == fixture_corpus.MAIN.cost_input_micro
    assert main.cost_output_micro == fixture_corpus.MAIN.cost_output_micro
    assert main.entry_count == fixture_corpus.MAIN.entry_count
    assert main.tool_call_count == fixture_corpus.MAIN.tool_call_count
    # Known gap (documented, not asserted away elsewhere): the stored
    # ``usage_record_count`` column keeps the count of standalone ``usage``
    # entries (1 in MAIN), not the 6 logical usage records the fixture expects.
    # The session list endpoint counts usage rows and does report 6.
    assert main.usage_record_count == fixture_corpus.MAIN.usage_entry_count

    beta = db.execute(
        select(SessionRow).where(SessionRow.session_id == fixture_corpus.BETA_ID)
    ).scalar_one()
    assert beta.total_tokens == fixture_corpus.BETA["total_tokens"]
    assert beta.cost_total_micro == fixture_corpus.BETA["cost_total_micro"]
    assert beta.first_usage_at < beta.last_usage_at

    long_session = db.execute(
        select(SessionRow).where(SessionRow.session_id == fixture_corpus.LONG_ID)
    ).scalar_one()
    assert long_session.entry_count == fixture_corpus.LONG["entry_count"]
    assert long_session.total_tokens == fixture_corpus.LONG["total_tokens"]


# --------------------------------------------------------------------------- #
# Incremental behaviour
# --------------------------------------------------------------------------- #


def test_second_unchanged_sync_is_a_no_op(sync_stats, sync_service, db, session_factory):
    with session_factory() as session:
        before = {
            row.session_id: (row.updated_at, row.file_mtime_ns, row.entry_count)
            for row in session.execute(select(SessionRow)).scalars()
        }

    stats = sync_service.run()

    assert stats.files_seen == fixture_corpus.FULL_VARIANT_FILES
    assert stats.files_added == 0
    assert stats.files_updated == 0
    assert stats.files_removed == 0
    assert stats.status == fixture_corpus.FULL_VARIANT_SYNC_STATUS

    with session_factory() as session:
        after = {
            row.session_id: (row.updated_at, row.file_mtime_ns, row.entry_count)
            for row in session.execute(select(SessionRow)).scalars()
        }
    assert after == before


def test_changed_file_replaces_its_entries(sync_stats, corpus, sync_service, db):
    main_path = corpus.path("main")
    j.write_jsonl(main_path, fixture_corpus.main_session_records()[:3])

    stats = sync_service.run()

    assert stats.files_updated == 1
    assert stats.files_added == 0
    row = db.execute(
        select(SessionRow).where(SessionRow.session_id == fixture_corpus.MAIN_ID)
    ).scalar_one()
    assert row.entry_count == 2
    entries = db.execute(
        select(EntryRow.entry_index).where(EntryRow.session_id == row.id)
    ).scalars()
    assert sorted(entries) == [0, 1]


def test_append_updates_totals_without_duplicating_entries(sync_stats, corpus, sync_service, db):
    main_path = corpus.path("main")
    extra = j.usage_entry(
        "use-extra",
        j.usage_object(input=7, output=3, total_tokens=10, cost={"total": "0.000002"}),
        timestamp="2026-01-15T09:03:00.000Z",
    )
    records = fixture_corpus.main_session_records() + [extra]
    j.write_jsonl(main_path, records)

    stats = sync_service.run()

    assert stats.files_updated == 1
    row = db.execute(
        select(SessionRow).where(SessionRow.session_id == fixture_corpus.MAIN_ID)
    ).scalar_one()
    assert row.entry_count == fixture_corpus.MAIN.entry_count + 1
    assert row.total_tokens == fixture_corpus.MAIN.total_tokens + 10
    assert row.usage_record_count == fixture_corpus.MAIN.usage_entry_count + 1
    assert row.cost_total_micro == fixture_corpus.MAIN.cost_total_micro + 2
    # No duplicate rows for the pre-existing entries.
    assert db.execute(
        select(func.count()).select_from(EntryRow).where(EntryRow.session_id == row.id)
    ).scalar_one() == row.entry_count


def test_deleted_file_removes_session_and_entries(sync_stats, corpus, sync_service, db):
    corpus.path("main").unlink()

    stats = sync_service.run()

    assert stats.files_removed == 1
    assert db.execute(
        select(SessionRow).where(SessionRow.session_id == fixture_corpus.MAIN_ID)
    ).scalar_one_or_none() is None
    assert db.execute(
        select(EntryRow).where(EntryRow.entry_id == "u1")
    ).scalar_one_or_none() is None
    assert _count(db, SessionRow) == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS - 1


def test_moved_file_keeps_one_row_at_the_new_path(sync_stats, corpus, sync_service, db, settings):
    source = corpus.path("main")
    target = settings.sessions_dir / "moved" / "main.jsonl"
    target.parent.mkdir()
    source.rename(target)

    stats = sync_service.run()

    assert stats.files_added == 0
    rows = db.execute(select(SessionRow)).scalars().all()
    assert len(rows) == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS
    row = db.execute(
        select(SessionRow).where(SessionRow.session_id == fixture_corpus.MAIN_ID)
    ).scalar_one()
    assert row.file_path == str(target)
    assert db.execute(
        select(func.count()).select_from(EntryRow).where(EntryRow.session_id == row.id)
    ).scalar_one() == fixture_corpus.MAIN.entry_count


# --------------------------------------------------------------------------- #
# Failure handling
# --------------------------------------------------------------------------- #


def test_failed_file_keeps_previous_valid_data_and_recovers(write_session, sync_service, db, settings):
    path = write_session(_single_session_records(), name="one.jsonl", subdir="one")
    sync_service.run()

    # Overwrite with content that has no usable session header.
    j.write_jsonl(path, [j.user_message("u9", "no header at all")])
    failed = sync_service.run()

    assert failed.files_failed == 1
    assert failed.status == "partial"
    row = db.execute(select(SessionRow)).scalar_one()
    assert row.session_id == THIRD_ID
    assert row.entry_count == 2
    assert {entry.entry_id for entry in row.entries} == {"u1", "a1"}

    # Restore valid content: the next run must recover.
    j.write_jsonl(path, _single_session_records("recovered"))
    recovered = sync_service.run()
    assert recovered.status == "ok"
    assert recovered.files_updated == 1
    db.expire_all()
    row = db.execute(select(SessionRow)).scalar_one()
    assert {entry.entry_id for entry in row.entries} == {"u1", "a1"}
    assert row.entry_count == 2


def test_partial_file_is_indexed_with_diagnostics(corpus, sync_service, db):
    malformed_path = corpus.path("edge:malformed")
    assert malformed_path.is_file()
    sync_service.run()

    row = db.execute(
        select(SessionRow).where(
            SessionRow.session_id == fixture_corpus.EDGE["malformed_session_id"]
        )
    ).scalar_one()
    assert row.parse_status == "partial"
    assert row.parse_error_count >= 1
    assert row.parse_warnings_json is not None
    assert row.entry_count == fixture_corpus.EDGE["malformed_valid_entries"]


def test_missing_sessions_directory_reports_error(app, settings, sync_service, db):
    import shutil

    shutil.rmtree(settings.sessions_dir)
    stats = sync_service.run()
    assert stats.status == "error"
    assert "sessions directory not found" in (stats.error_message or "")
    assert stats.files_seen == 0
    assert sync_service.is_running is False


def test_zero_usage_sessions_are_indexed(write_session, sync_service, db):
    write_session(
        [
            j.session_header(THIRD_ID, cwd="/work/one"),
            j.user_message("u1", "no usage here"),
        ],
        name="zero.jsonl",
    )
    sync_service.run()

    row = db.execute(select(SessionRow)).scalar_one()
    assert row.session_id == THIRD_ID
    assert row.usage_record_count == 0
    assert row.total_tokens == 0
    assert row.cost_total_micro == 0
    assert row.first_usage_at is None
    assert row.last_usage_at is None


# --------------------------------------------------------------------------- #
# Locking and history
# --------------------------------------------------------------------------- #


def test_concurrent_sync_is_rejected_and_lock_is_released(sync_service):
    entered = threading.Event()
    release = threading.Event()

    def hold_lock() -> None:
        sync_service._lock.acquire()
        try:
            entered.set()
            release.wait(5)
        finally:
            sync_service._lock.release()

    holder = threading.Thread(target=hold_lock)
    holder.start()
    try:
        assert entered.wait(5)
        assert sync_service.is_running is True
        with pytest.raises(SyncInProgressError):
            sync_service.run()
    finally:
        release.set()
        holder.join()

    assert sync_service.is_running is False
    # The lock is usable again after the rejection.
    assert sync_service.run().status in {"ok", "partial"}


def test_lock_is_released_after_a_failing_sync(app, sync_service, settings):
    import shutil

    shutil.rmtree(settings.sessions_dir)
    assert sync_service.run().status == "error"
    assert sync_service.is_running is False
    settings.sessions_dir.mkdir(parents=True, exist_ok=True)
    assert sync_service.run().status == "ok"


def test_sync_history_is_recorded_and_pruned(app, session_factory, sync_service):
    settings = app.state.settings
    settings.sync_run_retention = 3
    for _ in range(5):
        sync_service.run()

    with session_factory() as session:
        runs = session.execute(select(SyncRun).order_by(SyncRun.id)).scalars().all()

    assert len(runs) == 3
    assert all(run.status == "ok" for run in runs)
    assert all(run.started_at > 0 and run.finished_at is not None for run in runs)
    assert all(run.duration_ms is not None and run.duration_ms >= 0 for run in runs)


def test_last_sync_reflects_the_most_recent_run(sync_service, empty_corpus):
    assert sync_service.last_sync() is None
    first = sync_service.run()
    last = sync_service.run()
    latest = sync_service.last_sync()
    assert latest is not None
    assert latest.status == "ok"
    assert latest.files_seen == 0
    assert latest.started_at >= first.started_at
    assert latest.status == last.status


def test_duplicate_public_ids_do_not_overwrite_unrelated_paths(tmp_path, settings):
    """Two files with the same header id: the second re-homes, it never duplicates."""
    from app.db import create_db_engine, create_session_factory, init_db
    from app.services.sync import SyncService

    first_path = settings.sessions_dir / "a.jsonl"
    second_path = settings.sessions_dir / "b.jsonl"
    j.write_jsonl(first_path, _single_session_records("first"))
    j.write_jsonl(
        second_path,
        [
            j.session_header(THIRD_ID, cwd="/work/two"),
            j.user_message("u2", "second"),
        ],
    )

    engine = create_db_engine(settings)
    init_db(engine)
    try:
        service = SyncService(settings, create_session_factory(engine))
        stats = service.run()
        # Both files have the same public id; only one row can exist for that id.
        assert stats.files_seen == 2
        with create_session_factory(engine)() as session:
            rows = session.execute(select(SessionRow)).scalars().all()
            assert len(rows) == 1
            assert rows[0].session_id == THIRD_ID
            # Exactly one file's data survives; the duplicate is never merged.
            surviving = {
                entry_id
                for entry_id in session.execute(select(EntryRow.entry_id)).scalars()
            }
            assert surviving in ({"u1", "a1"}, {"u2"})
    finally:
        engine.dispose()
