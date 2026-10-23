"""Integration tests for parent/child relationships in ``app/services/aggregation.py``.

The production implementation is currently a **hardcoded temporary map**
(``_RELATED_SESSION_IDS``), not a general discovery mechanism. These tests pin
that documented behaviour: only explicitly mapped ids appear, UUID mentions in
transcript text never create links, and child costs are added to the combined
total exactly once.

The three ids below are the extra exclusions named in the bug report. They are
declared here because the shared fixture's ``EXCLUDED_RELATED_SESSION_IDS``
placeholder is still empty (shared files are not edited by this suite).
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models import SessionRow
from app.services import aggregation
from tests.fixtures import corpus as fixture_corpus
from tests.fixtures import jsonl as j

#: Bug-report exclusions: present on disk (as decoys here) but never children.
REPORT_EXCLUDED_IDS = (
    "01a15e80-b38b-7678-a16b-c2fdf189d128",
    "01a15e86-155b-719d-8234-41d992d5faa1",
    "01a16039-8eed-7712-9c93-6a2228eb6fb5",
)

PARENT_ID = fixture_corpus.PARENT_ID
MAPPED = fixture_corpus.MAPPED_CHILD_IDS
DECOYS = fixture_corpus.DECOY_SESSION_IDS


def _child_row(session_id: str, title: str) -> list:
    return fixture_corpus.child_session_records(session_id, title=title)


# --------------------------------------------------------------------------- #
# Explicit map behaviour
# --------------------------------------------------------------------------- #


def test_mapped_children_are_reported_with_their_own_totals(synced_corpus, db):
    detail = aggregation.session_detail(db, PARENT_ID)

    related_ids = [item.session_id for item in detail.related_sessions]
    assert sorted(related_ids) == sorted(MAPPED)
    assert detail.related_cost_total == pytest.approx(
        len(MAPPED) * fixture_corpus.CHILD_COST_MICRO / 1_000_000
    )

    for item in detail.related_sessions:
        assert item.title is not None
        assert item.cost_total == pytest.approx(
            fixture_corpus.CHILD_COST_MICRO / 1_000_000
        )
        assert item.total_tokens == 150


def test_combined_cost_adds_child_costs_once(synced_corpus, db):
    detail = aggregation.session_detail(db, PARENT_ID)
    own_cost_micro = fixture_corpus.PARENT["cost_total_micro"]

    assert detail.totals.cost_total == pytest.approx(own_cost_micro / 1_000_000)
    assert detail.combined_cost_total == pytest.approx(
        (own_cost_micro + len(MAPPED) * fixture_corpus.CHILD_COST_MICRO) / 1_000_000
    )
    # The fixture stores the same expectation independently.
    assert detail.combined_cost_total == pytest.approx(
        fixture_corpus.PARENT["combined_cost_micro_with_mapped_children"] / 1_000_000
    )
    # Own usage columns are untouched by sibling sessions.
    assert detail.totals.total_tokens == fixture_corpus.PARENT["total_tokens"]
    assert detail.session.cost_total == detail.totals.cost_total


def test_child_costs_are_not_double_counted_in_global_summary(synced_corpus, db):
    """Children contribute their own records once, and the parent adds nothing."""
    from datetime import UTC

    from app.services.ranges import RangeSpec

    spec = RangeSpec(
        key="custom",
        start_ms=j.epoch_ms("2026-01-11T00:00:00.000Z"),
        end_ms=j.epoch_ms("2026-01-18T00:00:00.000Z"),
        tz=UTC,
        timezone="UTC",
        group_by="day",
    )
    parent = aggregation.session_detail(db, PARENT_ID)
    summary = aggregation.summary(db, spec)

    children_alone = sum(
        row.cost_total
        for row in aggregation.list_sessions(db, spec, page_size=100).sessions
        if row.session_id in MAPPED
    )
    assert children_alone == pytest.approx(parent.related_cost_total)

    # The global total already contains each child once and is not inflated by
    # the parent's combined (own + children) detail figure.
    assert summary.cost_total == pytest.approx(
        sum(row.cost_total for row in aggregation.by_model(db, spec).models)
    )
    expected_without_combined = (
        summary.cost_total
        - parent.totals.cost_total
        + parent.combined_cost_total
    )
    assert summary.cost_total < expected_without_combined
    assert expected_without_combined - summary.cost_total == pytest.approx(
        parent.related_cost_total
    )


# --------------------------------------------------------------------------- #
# Non-relationships
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("session_id", DECOYS + REPORT_EXCLUDED_IDS)
def test_uuid_mentions_and_decoy_sessions_are_not_children(write_session, sync_service, db, session_id):
    """Decoy ids appear in the parent transcript text and tool output."""
    write_session(fixture_corpus.parent_session_records(), name="parent.jsonl", subdir="parent")
    write_session(_child_row(session_id, "Decoy child"), name=f"{session_id}.jsonl", subdir="parent/decoy")
    for index, child_id in enumerate(MAPPED):
        write_session(_child_row(child_id, f"Mapped child {index + 1}"), name=f"child-{index}.jsonl", subdir="parent/children")
    sync_service.run()

    detail = aggregation.session_detail(db, PARENT_ID)
    related_ids = {item.session_id for item in detail.related_sessions}

    assert session_id not in related_ids
    assert related_ids == set(MAPPED)


def test_session_without_subagent_calls_has_no_children(write_session, sync_service, db):
    for index, child_id in enumerate(MAPPED):
        write_session(_child_row(child_id, f"Mapped child {index + 1}"), name=f"child-{index}.jsonl", subdir="children")
    write_session(
        [
            j.session_header(
                "aaaaaaaa-0000-4000-8000-0000000000c1", cwd="/work/alpha"
            ),
            j.user_message("s-u1", "Just a plain session, no sub-agents."),
            j.assistant_message(
                "s-a1",
                timestamp="2026-01-15T09:00:05.000Z",
                parent_id="s-u1",
                text="Plain answer.",
                usage=j.usage_object(
                    input=10, output=5, total_tokens=15, cost={"total": "0.000015"}
                ),
            ),
        ],
        name="plain.jsonl",
    )
    sync_service.run()

    # All five mapped child rows exist in the database, but this session must
    # not borrow them.
    assert db.execute(
        select(func.count()).select_from(SessionRow).where(SessionRow.session_id.in_(MAPPED))
    ).scalar_one() == len(MAPPED)

    detail = aggregation.session_detail(db, "aaaaaaaa-0000-4000-8000-0000000000c1")
    assert detail.related_sessions == []
    assert detail.related_cost_total == 0.0
    assert detail.combined_cost_total == pytest.approx(detail.totals.cost_total)


def test_missing_child_files_do_not_break_parent_detail(write_session, sync_service, db):
    write_session(fixture_corpus.parent_session_records(), name="parent.jsonl", subdir="parent")
    sync_service.run()

    assert db.execute(
        select(func.count()).select_from(SessionRow).where(SessionRow.session_id.in_(MAPPED))
    ).scalar_one() == 0

    detail = aggregation.session_detail(db, PARENT_ID)
    assert detail.related_sessions == []
    assert detail.related_cost_total == 0.0
    assert detail.combined_cost_total == pytest.approx(
        fixture_corpus.PARENT["cost_total_micro"] / 1_000_000
    )


def test_child_session_links_to_its_own_id(write_session, sync_service, db):
    write_session(fixture_corpus.parent_session_records(), name="parent.jsonl", subdir="parent")
    for index, child_id in enumerate(MAPPED):
        write_session(_child_row(child_id, f"Mapped child {index + 1}"), name=f"child-{index}.jsonl", subdir="parent/children")
    sync_service.run()

    parent = aggregation.session_detail(db, PARENT_ID)
    for item in parent.related_sessions:
        child = aggregation.session_detail(db, item.session_id)
        assert child.session.session_id == item.session_id
        assert child.session.session_id != PARENT_ID
        assert child.session.title == f"Mapped child {MAPPED.index(item.session_id) + 1}"
        assert child.related_sessions == []
        assert child.totals.cost_total == item.cost_total


def test_own_session_usage_is_unchanged_by_children(write_session, sync_service, db):
    """Sync the parent alone, then with children: the parent row must not move."""
    write_session(fixture_corpus.parent_session_records(), name="parent.jsonl", subdir="parent")
    sync_service.run()
    parent_alone = aggregation.session_detail(db, PARENT_ID)
    alone_snapshot = (
        parent_alone.totals.total_tokens,
        parent_alone.totals.cost_total,
        parent_alone.entries_total,
        parent_alone.session.entry_count,
    )

    for index, child_id in enumerate(MAPPED):
        write_session(_child_row(child_id, f"Mapped child {index + 1}"), name=f"child-{index}.jsonl", subdir="parent/children")
    stats = sync_service.run()
    assert stats.files_added == len(MAPPED)

    parent_with_children = aggregation.session_detail(db, PARENT_ID)
    assert (
        parent_with_children.totals.total_tokens,
        parent_with_children.totals.cost_total,
        parent_with_children.entries_total,
        parent_with_children.session.entry_count,
    ) == alone_snapshot
    assert len(parent_with_children.related_sessions) == len(MAPPED)
    assert parent_with_children.combined_cost_total > parent_with_children.totals.cost_total


def test_subagent_invocation_count_differs_from_mapped_child_count(synced_corpus, db):
    """Known gap: the UI's "sub-agent calls" is the mapped-child count.

    PARENT invokes ``subagent`` once (one ``tool_call``) but five sessions are
    mapped. The API exposes ``toolCallCount == 1`` and five related sessions, and
    no endpoint reports a true invocation-vs-children split.
    """
    detail = aggregation.session_detail(db, PARENT_ID)

    assert detail.session.tool_call_count == 1
    assert len(detail.related_sessions) == len(MAPPED) == 5
    assert detail.session.tool_call_count != len(detail.related_sessions)
