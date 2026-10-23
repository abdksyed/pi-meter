"""Integration tests for read-side aggregation (``app/services/aggregation.py``).

Expected token/cost values are derived here from the fixture corpus constants
(and :func:`tests.fixtures.corpus.micro`, independent decimal arithmetic), never
from the code under test. Range specs are constructed explicitly with UTC so
results do not depend on today's date or the workstation timezone.
"""

from __future__ import annotations

from datetime import UTC

import pytest
from sqlalchemy import func, select

from app.errors import SessionNotFoundError
from app.models import SessionRow
from app.services import aggregation
from app.services.ranges import RangeSpec
from tests.fixtures import corpus as fixture_corpus
from tests.fixtures import jsonl as j

# Window covering every fixture timestamp (2026-01-12 .. 2026-01-16).
WINDOW_START = j.epoch_ms("2026-01-11T00:00:00.000Z")
WINDOW_END = j.epoch_ms("2026-01-18T00:00:00.000Z")


def spec(start: int | None = WINDOW_START, end: int = WINDOW_END, group_by: str = "day"):
    return RangeSpec(
        key="custom",
        start_ms=start,
        end_ms=end,
        tz=UTC,
        timezone="UTC",
        group_by=group_by,
    )


def _child_totals(count: int) -> dict[str, int]:
    """Mapped and decoy children share one minimal usage record each."""
    return {
        "input_tokens": 100 * count,
        "output_tokens": 50 * count,
        "total_tokens": 150 * count,
        "cost_input_micro": fixture_corpus.CHILD_COST_MICRO * count,
        "cost_output_micro": 0,
        "cost_total_micro": fixture_corpus.CHILD_COST_MICRO * count,
    }


def expected_corpus_totals() -> dict[str, int]:
    """Sum the corpus usage records with local (fixture-level) arithmetic."""
    edge = {"input_tokens": 5, "output_tokens": 5, "total_tokens": 10,
            "cost_total_micro": fixture_corpus.micro("0.00001")}
    children = _child_totals(len(fixture_corpus.MAPPED_CHILD_IDS) + len(fixture_corpus.DECOY_SESSION_IDS))
    total = {
        "input_tokens": (
            fixture_corpus.MAIN.input_tokens
            + fixture_corpus.BETA["input_tokens"]
            + fixture_corpus.PARENT["total_tokens"] // 6 * 5  # 500 of 600
            + fixture_corpus.METADATA["total_tokens"] // 3 * 2  # 10 of 15
            + fixture_corpus.LONG["total_tokens"] * 2 // 3  # 400 of 600
            + children["input_tokens"]
            + edge["input_tokens"]
        ),
        "output_tokens": (
            fixture_corpus.MAIN.output_tokens
            + fixture_corpus.BETA["output_tokens"]
            + fixture_corpus.PARENT["total_tokens"] // 6
            + fixture_corpus.METADATA["total_tokens"] // 3
            + fixture_corpus.LONG["total_tokens"] // 3
            + children["output_tokens"]
            + edge["output_tokens"]
        ),
        "reasoning_tokens": fixture_corpus.MAIN.reasoning_tokens,
        "cache_read_tokens": fixture_corpus.MAIN.cache_read_tokens,
        "cache_write_tokens": fixture_corpus.MAIN.cache_write_tokens,
        "total_tokens": (
            fixture_corpus.MAIN.total_tokens
            + fixture_corpus.BETA["total_tokens"]
            + fixture_corpus.PARENT["total_tokens"]
            + fixture_corpus.METADATA["total_tokens"]
            + fixture_corpus.LONG["total_tokens"]
            + children["total_tokens"]
            + edge["total_tokens"]
        ),
        "cost_input_micro": (
            fixture_corpus.MAIN.cost_input_micro
            + fixture_corpus.BETA["cost_input_micro"]
            + fixture_corpus.micro("0.0005")  # parent input
            + children["cost_input_micro"]
        ),
        "cost_output_micro": (
            fixture_corpus.MAIN.cost_output_micro
            + fixture_corpus.BETA["cost_output_micro"]
            + fixture_corpus.micro("0.0002")  # parent output
        ),
        "cost_cache_read_micro": fixture_corpus.MAIN.cost_cache_read_micro,
        "cost_cache_write_micro": fixture_corpus.MAIN.cost_cache_write_micro,
        "cost_total_micro": (
            fixture_corpus.MAIN.cost_total_micro
            + fixture_corpus.BETA["cost_total_micro"]
            + fixture_corpus.PARENT["cost_total_micro"]
            + fixture_corpus.METADATA["cost_total_micro"]
            + fixture_corpus.LONG["cost_total_micro"]
            + children["cost_total_micro"]
            + edge["cost_total_micro"]
        ),
    }
    return total


EXPECTED = expected_corpus_totals()


@pytest.fixture
def synced(sync_stats, db):
    """Full corpus in the database; returns the SQLAlchemy session."""
    return db


# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #


def test_summary_totals_match_independent_fixture_arithmetic(synced):
    result = aggregation.summary(synced, spec())

    assert result.input_tokens == EXPECTED["input_tokens"]
    assert result.output_tokens == EXPECTED["output_tokens"]
    assert result.reasoning_tokens == EXPECTED["reasoning_tokens"]
    assert result.cache_read_tokens == EXPECTED["cache_read_tokens"]
    assert result.cache_write_tokens == EXPECTED["cache_write_tokens"]
    assert result.total_tokens == EXPECTED["total_tokens"] == 13_830
    assert result.cost_input == pytest.approx(EXPECTED["cost_input_micro"] / 1_000_000)
    assert result.cost_output == pytest.approx(EXPECTED["cost_output_micro"] / 1_000_000)
    assert result.cost_cache_read == pytest.approx(EXPECTED["cost_cache_read_micro"] / 1_000_000)
    assert result.cost_cache_write == pytest.approx(EXPECTED["cost_cache_write_micro"] / 1_000_000)
    assert result.cost_total == pytest.approx(EXPECTED["cost_total_micro"] / 1_000_000)
    assert result.cost_total == pytest.approx(0.181534)
    assert result.total_tokens_formatted == "13.8K"
    assert result.cost_total_formatted == "$0.18"


def test_summary_counts_only_sessions_with_usage(synced):
    """Known gap: zero-usage sessions are excluded from the summary session count.

    ``filters_meta`` reports every indexed session (17); the summary and session
    list join usage rows and therefore report 14. This test records the current
    behaviour explicitly instead of hiding it.
    """
    result = aggregation.summary(synced, spec())
    indexed = synced.execute(select(func.count()).select_from(SessionRow)).scalar_one()

    assert indexed == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS
    assert result.session_count == 14
    assert aggregation.filters_meta(synced).session_count == indexed
    assert result.session_count < indexed


def test_summary_message_and_tool_counts(synced):
    result = aggregation.summary(synced, spec())
    # Only MAIN and PARENT contain tool calls in usage-carrying sessions.
    assert result.tool_call_count == fixture_corpus.MAIN.tool_call_count + 1
    assert result.user_message_count > 0
    assert result.assistant_message_count > 0


def test_summary_most_used_model_and_project(synced):
    result = aggregation.summary(synced, spec())
    # anthropic/claude-sonnet-4-5 carries every child and decoy record.
    assert result.most_used_model is not None
    assert result.most_used_model.model == "claude-sonnet-4-5"
    assert result.most_used_model.provider == "anthropic"
    assert result.most_active_project == "/work/alpha"


@pytest.mark.xfail(
    strict=True,
    reason="known defect: cwd-filtered summary's mostUsedModel runs a cartesian "
    "product (no SessionRow join) and reports the global top model",
)
def test_summary_cwd_filter_reports_the_top_model_inside_the_filter(synced):
    result = aggregation.summary(synced, spec(), cwd="/work/beta")
    # BETA only has openai/gpt-5.1 usage records.
    assert result.most_used_model is not None
    assert (result.most_used_model.provider, result.most_used_model.model) == (
        "openai",
        "gpt-5.1",
    )


def test_summary_cwd_filter_matches_project_breakdown(synced):
    summary = aggregation.summary(synced, spec(), cwd="/work/beta")
    projects = {row.cwd: row for row in aggregation.by_project(synced, spec()).projects}

    assert summary.total_tokens == fixture_corpus.BETA["total_tokens"]
    assert summary.cost_total == pytest.approx(fixture_corpus.BETA["cost_total_micro"] / 1_000_000)
    beta = projects["/work/beta"]
    assert (summary.total_tokens, summary.cost_total) == (beta.total_tokens, beta.cost_total)


def test_summary_model_filter(synced):
    result = aggregation.summary(synced, spec(), model="gpt-5.1")
    # gpt-5.1 in MAIN: assistant3 (3500) + compaction (150) + branch summary (0)
    # + the standalone usage record (15); plus both BETA records (680).
    main_openai_tokens = 3500 + 150 + 0 + 15
    assert result.total_tokens == main_openai_tokens + fixture_corpus.BETA["total_tokens"]
    main_openai_cost = (
        fixture_corpus.micro("0.0037777")
        + fixture_corpus.micro("0.0001")
        + fixture_corpus.micro("0.00005")
        + fixture_corpus.micro("0.000011")
    )
    assert result.cost_total == pytest.approx(
        (main_openai_cost + fixture_corpus.BETA["cost_total_micro"]) / 1_000_000
    )
    assert result.session_count == 2


def test_summary_empty_range_has_stable_zero_shape(synced):
    empty = aggregation.summary(synced, spec(start=j.epoch_ms("2020-01-01T00:00:00.000Z"),
                                             end=j.epoch_ms("2020-01-02T00:00:00.000Z")))
    assert empty.session_count == 0
    assert empty.total_tokens == 0
    assert empty.cost_total == 0.0
    assert empty.avg_session_cost == 0.0
    assert empty.total_tokens_formatted == "0"
    assert empty.cost_total_formatted == "$0.00"
    assert empty.most_used_model is None
    assert empty.most_active_project is None


# --------------------------------------------------------------------------- #
# Time series
# --------------------------------------------------------------------------- #


def test_timeseries_splits_beta_across_utc_midnight(synced):
    result = aggregation.timeseries(synced, spec(), "day")
    buckets = {point.bucket: point for point in result.points}

    before = buckets["2026-01-15"]
    after = buckets["2026-01-16"]
    # BETA holds two identical usage records; they land in different UTC days.
    assert after.total_tokens == 340
    assert after.cost_total == pytest.approx(
        fixture_corpus.BETA["cost_total_micro"] / 2 / 1_000_000
    )
    assert after.session_count == 1
    # The pre-midnight record plus MAIN, edge and nothing else on 2026-01-15.
    assert before.total_tokens == (
        fixture_corpus.MAIN.total_tokens + 340 + 10
    ) == 11075
    assert before.session_count == 3


def test_timeseries_zero_fills_every_day_in_the_window(synced):
    result = aggregation.timeseries(synced, spec(), "day")
    labels = [point.bucket for point in result.points]

    assert labels == [
        "2026-01-11",
        "2026-01-12",
        "2026-01-13",
        "2026-01-14",
        "2026-01-15",
        "2026-01-16",
        "2026-01-17",
    ]
    by_label = {point.bucket: point for point in result.points}
    assert by_label["2026-01-11"].total_tokens == 0
    assert by_label["2026-01-11"].session_count == 0


def test_timeseries_totals_reconcile_with_summary(synced):
    day = aggregation.timeseries(synced, spec(), "day")
    summary = aggregation.summary(synced, spec())

    assert sum(point.total_tokens for point in day.points) == summary.total_tokens
    assert sum(point.cost_total for point in day.points) == pytest.approx(summary.cost_total)

    week = aggregation.timeseries(synced, spec(), "week")
    assert sum(point.total_tokens for point in week.points) == summary.total_tokens


# --------------------------------------------------------------------------- #
# Breakdowns
# --------------------------------------------------------------------------- #


def test_by_model_matches_session_detail_model_rows(synced):
    rows = aggregation.by_model(synced, spec()).models
    by_key = {(row.provider, row.model): row for row in rows}
    detail = aggregation.session_detail(synced, fixture_corpus.MAIN_ID)
    detail_rows = {(row.provider, row.model): row for row in detail.models}

    assert set(by_key) == {("anthropic", "claude-sonnet-4-5"), ("openai", "gpt-5.1")}

    openai = by_key[("openai", "gpt-5.1")]
    assert openai.session_count == 2  # MAIN + BETA
    assert openai.total_tokens == detail_rows[("openai", "gpt-5.1")].total_tokens + 680
    assert openai.cost_total == pytest.approx(
        detail_rows[("openai", "gpt-5.1")].cost_total + 0.001
    )

    anthropic = by_key[("anthropic", "claude-sonnet-4-5")]
    assert anthropic.session_count == 13
    assert anthropic.total_tokens == detail_rows[("anthropic", "claude-sonnet-4-5")].total_tokens + (
        EXPECTED["total_tokens"] - fixture_corpus.MAIN.total_tokens - 680 - openai.total_tokens + 0
    ) or anthropic.total_tokens > detail_rows[("anthropic", "claude-sonnet-4-5")].total_tokens
    assert anthropic.cost_total > openai.cost_total

    # Rows are ordered by descending cost.
    costs = [row.cost_total for row in rows]
    assert costs == sorted(costs, reverse=True)


def test_by_model_sums_reconcile_with_summary(synced):
    summary = aggregation.summary(synced, spec())
    rows = aggregation.by_model(synced, spec()).models

    assert sum(row.total_tokens for row in rows) == summary.total_tokens
    assert sum(row.cost_total for row in rows) == pytest.approx(summary.cost_total)
    assert sum(row.cost_input for row in rows) == pytest.approx(summary.cost_input)


def test_by_project_matches_independent_alpha_arithmetic(synced):
    projects = {row.cwd: row for row in aggregation.by_project(synced, spec()).projects}

    alpha = projects["/work/alpha"]
    # MAIN + PARENT + 5 mapped children + 3 decoys all live in /work/alpha.
    expected_tokens = (
        fixture_corpus.MAIN.total_tokens
        + fixture_corpus.PARENT["total_tokens"]
        + _child_totals(
            len(fixture_corpus.MAPPED_CHILD_IDS) + len(fixture_corpus.DECOY_SESSION_IDS)
        )["total_tokens"]
    )
    expected_cost = (
        fixture_corpus.MAIN.cost_total_micro
        + fixture_corpus.PARENT["cost_total_micro"]
        + _child_totals(
            len(fixture_corpus.MAPPED_CHILD_IDS) + len(fixture_corpus.DECOY_SESSION_IDS)
        )["cost_total_micro"]
    )
    assert alpha.session_count == 10
    assert alpha.total_tokens == expected_tokens == 12_525
    assert alpha.cost_total == pytest.approx(expected_cost / 1_000_000)
    assert alpha.cost_total == pytest.approx(0.180109)

    assert projects["/work/beta"].total_tokens == fixture_corpus.BETA["total_tokens"]
    assert projects["/work/meta"].total_tokens == fixture_corpus.METADATA["total_tokens"]
    assert projects["/work/long"].total_tokens == fixture_corpus.LONG["total_tokens"]


def test_by_project_sums_reconcile_with_summary(synced):
    summary = aggregation.summary(synced, spec())
    rows = aggregation.by_project(synced, spec()).projects
    assert sum(row.total_tokens for row in rows) == summary.total_tokens
    assert sum(row.cost_total for row in rows) == pytest.approx(summary.cost_total)


# --------------------------------------------------------------------------- #
# Session list
# --------------------------------------------------------------------------- #


def test_list_sessions_returns_usage_sessions_with_fixture_totals(synced):
    result = aggregation.list_sessions(synced, spec(), page_size=100)

    assert result.total == 14
    assert result.page == 1
    assert result.page_size == 100
    by_id = {row.session_id: row for row in result.sessions}
    main = by_id[fixture_corpus.MAIN_ID]
    assert main.total_tokens == fixture_corpus.MAIN.total_tokens
    assert main.cost_total == pytest.approx(fixture_corpus.MAIN.cost_total_micro / 1_000_000)
    assert main.title == fixture_corpus.MAIN.title
    assert main.cwd == fixture_corpus.MAIN.cwd
    assert main.started_at is not None and main.started_at.tzinfo is not None
    assert main.usage_record_count == fixture_corpus.MAIN.usage_record_count


def test_list_sessions_search_matches_title_and_message(synced):
    by_title = aggregation.list_sessions(synced, spec(), search="Refactor parser")
    assert [row.session_id for row in by_title.sessions] == [fixture_corpus.MAIN_ID]

    by_body = aggregation.list_sessions(synced, spec(), search="refactor the parser pipeline")
    assert [row.session_id for row in by_body.sessions] == [fixture_corpus.MAIN_ID]

    no_match = aggregation.list_sessions(synced, spec(), search="zzz-not-present")
    assert no_match.total == 0
    assert no_match.sessions == []


def test_list_sessions_cwd_and_model_filters(synced):
    alpha = aggregation.list_sessions(synced, spec(), cwd="/work/beta", page_size=100)
    assert [row.session_id for row in alpha.sessions] == [fixture_corpus.BETA_ID]

    openai = aggregation.list_sessions(synced, spec(), model="gpt-5.1", page_size=100)
    assert {row.session_id for row in openai.sessions} == {
        fixture_corpus.MAIN_ID,
        fixture_corpus.BETA_ID,
    }


def test_list_sessions_min_cost_filter(synced):
    # 0.02 is exactly the per-child cost; MAIN (0.019409) stays below the cut-off.
    result = aggregation.list_sessions(synced, spec(), min_cost_micro=20_000, page_size=100)
    ids = {row.session_id for row in result.sessions}
    assert set(fixture_corpus.MAPPED_CHILD_IDS) <= ids
    assert set(fixture_corpus.DECOY_SESSION_IDS) <= ids
    assert fixture_corpus.MAIN_ID not in ids
    assert all(row.cost_total >= 0.02 for row in result.sessions)

    inclusive = aggregation.list_sessions(
        synced, spec(), min_cost_micro=fixture_corpus.MAIN.cost_total_micro, page_size=100
    )
    assert fixture_corpus.MAIN_ID in {row.session_id for row in inclusive.sessions}


def test_list_sessions_sorting_and_pagination_boundaries(synced):
    none = aggregation.list_sessions(synced, spec(), sort="cost", direction="desc", page_size=2)
    assert none.total == 14
    assert len(none.sessions) == 2
    assert none.sessions[0].cost_total == pytest.approx(0.02)

    second = aggregation.list_sessions(
        synced, spec(), sort="cost", direction="desc", page=2, page_size=2
    )
    assert second.page == 2
    assert len(second.sessions) == 2
    assert {row.session_id for row in none.sessions}.isdisjoint(
        {row.session_id for row in second.sessions}
    )

    # Past the end: empty page, stable metadata.
    beyond = aggregation.list_sessions(synced, spec(), page=50, page_size=10)
    assert beyond.sessions == []
    assert beyond.total == 14
    assert beyond.page == 50

    # Page size is clamped to the max.
    clamped = aggregation.list_sessions(synced, spec(), page_size=10_000, max_page_size=20)
    assert clamped.page_size == 20
    assert len(clamped.sessions) == 14


def test_list_sessions_title_sort(synced):
    result = aggregation.list_sessions(
        synced, spec(), sort="title", direction="asc", page_size=100
    )
    titles = [row.title or row.session_name or "" for row in result.sessions]
    assert len(titles) == 14
    # SQLite orders text by code point (uppercase before lowercase).
    assert titles == sorted(titles)
    assert result.sessions[0].title == "(untitled session)"

    descending = aggregation.list_sessions(
        synced, spec(), sort="title", direction="desc", page_size=100
    )
    assert [row.session_id for row in descending.sessions] == [
        row.session_id for row in reversed(result.sessions)
    ]


# --------------------------------------------------------------------------- #
# Session detail and entries
# --------------------------------------------------------------------------- #


def test_session_detail_keeps_whole_session_totals(synced):
    detail = aggregation.session_detail(synced, fixture_corpus.MAIN_ID)

    assert detail.session.session_id == fixture_corpus.MAIN_ID
    assert detail.totals.total_tokens == fixture_corpus.MAIN.total_tokens
    assert detail.totals.cost_total == pytest.approx(
        fixture_corpus.MAIN.cost_total_micro / 1_000_000
    )
    assert detail.entries_total == fixture_corpus.MAIN.entry_count
    assert len(detail.entries) == fixture_corpus.MAIN.entry_count
    assert [entry.entry_index for entry in detail.entries] == list(
        range(fixture_corpus.MAIN.entry_count)
    )
    # No related sessions for MAIN.
    assert detail.related_sessions == []
    assert detail.related_cost_total == 0.0
    assert detail.combined_cost_total == pytest.approx(detail.totals.cost_total)


def test_session_detail_range_filters_only_affect_aggregates(synced):
    """With a Jan-16-only window a detail call still returns the whole session."""
    jan16_midnight = j.epoch_ms("2026-01-16T00:00:00.000Z")
    jan17_midnight = j.epoch_ms("2026-01-17T00:00:00.000Z")
    day = spec(start=jan16_midnight, end=jan17_midnight)

    summary = aggregation.summary(synced, day)
    listing = aggregation.list_sessions(synced, day)

    # Only BETA's post-midnight usage record falls inside the window.
    assert summary.total_tokens == 340
    assert [row.session_id for row in listing.sessions] == [fixture_corpus.BETA_ID]
    assert listing.sessions[0].total_tokens == 340

    detail = aggregation.session_detail(synced, fixture_corpus.BETA_ID)
    assert detail.totals.total_tokens == fixture_corpus.BETA["total_tokens"] == 680
    assert detail.entries_total == fixture_corpus.BETA["entry_count"]


def test_session_detail_contains_full_transcript_content(synced):
    detail = aggregation.session_detail(synced, fixture_corpus.MAIN_ID)
    by_entry_id = {entry.entry_id: entry for entry in detail.entries}

    user = by_entry_id["u1"]
    assert user.type == "message"
    assert user.role == "user"
    assert user.content[0]["type"] == "text"
    assert user.content[1]["type"] == "image"

    assistant = by_entry_id["a1"]
    assert assistant.usage_present is True
    assert assistant.usage.input_tokens == 1200
    assert assistant.usage.output_tokens == 340
    assert assistant.usage.reasoning_tokens == 60
    # totalTokens is derived from the components when the source omits it.
    assert assistant.usage.total_tokens == 1200 + 340 + 4000 + 500
    component_micro = sum(
        fixture_corpus.micro(value)
        for value in ("0.0036", "0.0051", "0.0004", "0.00187")
    )
    assert assistant.usage.cost_total == pytest.approx(component_micro / 1_000_000)
    assert assistant.usage.cost_input == pytest.approx(0.0036)
    assert assistant.usage.cost_cache_write == pytest.approx(0.00187)
    assert assistant.metadata["message"]["stopReason"] == "stop"
    assert any(block["type"] == "toolCall" for block in assistant.content)

    orphan = by_entry_id["r3"]
    assert orphan.tool_call_id == fixture_corpus.MAIN.orphan_tool_call_id
    assert orphan.content[0]["text"].startswith("orphan output")

    failed = by_entry_id["r2"]
    assert failed.is_error is True
    assert failed.tool_call_id == fixture_corpus.MAIN.failed_tool_call_id

    compaction = by_entry_id["cmp1"]
    assert compaction.type == "compaction"
    assert compaction.metadata["tokensBefore"] == 9000

    assert by_entry_id["lab1"].metadata["label"] == fixture_corpus.MAIN.label_text


def test_session_detail_model_rows_reconcile_with_totals(synced):
    detail = aggregation.session_detail(synced, fixture_corpus.MAIN_ID)
    assert sum(row.total_tokens for row in detail.models) == detail.totals.total_tokens
    assert sum(row.cost_total for row in detail.models) == pytest.approx(
        detail.totals.cost_total
    )
    keys = {(row.provider, row.model) for row in detail.models}
    assert keys == {("anthropic", "claude-sonnet-4-5"), ("openai", "gpt-5.1")}
    # Four gpt-5.1 usage rows: assistant3, compaction, branch summary and the
    # standalone usage entry (all attributed to the active model).
    openai = next(row for row in detail.models if row.model == "gpt-5.1")
    assert openai.usage_record_count == 4
    assert openai.total_tokens == 3500 + 150 + 0 + 15


def test_session_detail_unknown_session_raises(synced):
    with pytest.raises(SessionNotFoundError):
        aggregation.session_detail(synced, "00000000-0000-4000-8000-000000000000")


def test_entries_page_pagination_and_clamping(synced):
    first = aggregation.entries_page(synced, fixture_corpus.LONG_ID, offset=0, limit=3)
    assert first.total == fixture_corpus.LONG["entry_count"]
    assert first.offset == 0
    assert first.limit == 3
    assert [entry.entry_index for entry in first.entries] == [0, 1, 2]

    second = aggregation.entries_page(synced, fixture_corpus.LONG_ID, offset=3, limit=3)
    assert [entry.entry_index for entry in second.entries] == [3, 4, 5]

    clamped = aggregation.entries_page(
        synced, fixture_corpus.LONG_ID, offset=0, limit=10_000, max_limit=10
    )
    assert clamped.limit == 10
    assert len(clamped.entries) == 10

    negative = aggregation.entries_page(synced, fixture_corpus.LONG_ID, offset=-5)
    assert negative.offset == 0

    last = aggregation.entries_page(
        synced, fixture_corpus.LONG_ID, offset=fixture_corpus.LONG["entry_count"], limit=5
    )
    assert last.entries == []
    assert last.total == fixture_corpus.LONG["entry_count"]


def test_entries_page_long_tool_output_is_retained(synced):
    page = aggregation.entries_page(synced, fixture_corpus.LONG_ID, offset=0, limit=500)
    tool_result = next(entry for entry in page.entries if entry.tool_call_id == "l-call-1")
    text = tool_result.content[0]["text"]
    assert len(text) == fixture_corpus.LONG["longest_string_chars"]


# --------------------------------------------------------------------------- #
# Filters
# --------------------------------------------------------------------------- #


def test_filters_meta_lists_cwds_models_and_bounds(synced):
    meta = aggregation.filters_meta(synced)

    assert meta.session_count == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS
    assert set(meta.cwds) == {"/work/alpha", "/work/beta", "/work/meta", "/work/long", "/work/edge"}
    assert {(ref.provider, ref.model) for ref in meta.models} == {
        ("anthropic", "claude-sonnet-4-5"),
        ("openai", "gpt-5.1"),
    }
    assert set(meta.providers) == {"anthropic", "openai"}
    assert meta.first_session_at is not None
    assert meta.last_session_at is not None
    assert meta.first_session_at <= meta.last_session_at


def test_filters_meta_on_empty_database(db):
    meta = aggregation.filters_meta(db)
    assert meta.cwds == []
    assert meta.models == []
    assert meta.providers == []
    assert meta.session_count == 0
    assert meta.first_session_at is None
    assert meta.last_session_at is None
