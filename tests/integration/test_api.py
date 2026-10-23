"""HTTP API integration tests through ``create_app`` with isolated settings.

Every request runs against the per-test temporary SQLite index and synthetic
corpus. Timestamps are asserted as UTC ISO-8601 strings with a ``Z`` suffix and
money fields as floats derived from fixture micro-units.
"""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from tests.fixtures import corpus as fixture_corpus
from tests.fixtures import jsonl as j

API_PATHS_FROM_OPENAPI = {
    "/api/filters",
    "/api/health",
    "/api/refresh",
    "/api/sessions",
    "/api/sessions/{session_id}",
    "/api/sessions/{session_id}/entries",
    "/api/summary",
    "/api/usage/by-model",
    "/api/usage/by-project",
    "/api/usage/timeseries",
}

ALL = {"range": "all"}


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #


def test_health_reports_database_and_directory_state(client, settings):
    response = client.get("/api/health")
    assert response.status_code == 200
    body = response.json()

    assert body["status"] == "ok"
    assert body["databaseOk"] is True
    assert body["sessionsDir"] == str(settings.sessions_dir)
    assert body["sessionsDirExists"] is True
    assert body["syncInProgress"] is False
    assert body["lastSync"] is None
    assert body["version"]


def test_health_last_sync_reflects_a_refresh(seeded_client):
    response = seeded_client.get("/api/health")
    last_sync = response.json()["lastSync"]

    assert last_sync is not None
    assert last_sync["status"] == fixture_corpus.FULL_VARIANT_SYNC_STATUS
    assert last_sync["filesSeen"] == fixture_corpus.FULL_VARIANT_FILES
    assert last_sync["filesFailed"] == len(fixture_corpus.EDGE_CASE_ERROR_FILES)
    assert last_sync["startedAt"].endswith("Z")
    assert last_sync["finishedAt"].endswith("Z")


# --------------------------------------------------------------------------- #
# Refresh
# --------------------------------------------------------------------------- #


def test_refresh_indexes_the_corpus(corpus, client):
    response = client.post("/api/refresh")
    assert response.status_code == 200
    body = response.json()

    assert body["filesSeen"] == fixture_corpus.FULL_VARIANT_FILES
    assert body["filesAdded"] == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS
    assert body["filesFailed"] == len(fixture_corpus.EDGE_CASE_ERROR_FILES)
    assert body["status"] == fixture_corpus.FULL_VARIANT_SYNC_STATUS
    assert body["errorMessage"] == "2 file(s) failed to parse"
    assert isinstance(body["durationMs"], int)
    assert body["startedAt"].endswith("Z")

    # The data is visible immediately afterwards.
    listing = client.get("/api/sessions", params=ALL).json()
    assert listing["total"] > 0


def test_refresh_conflict_returns_409_with_stable_code(seeded_client, app):
    sync_service = app.state.sync_service
    sync_service._lock.acquire()
    try:
        response = seeded_client.post("/api/refresh")
        health = seeded_client.get("/api/health").json()
    finally:
        sync_service._lock.release()

    assert response.status_code == 409
    assert response.json() == {
        "detail": "sync already in progress",
        "code": "sync_in_progress",
    }
    assert health["syncInProgress"] is True

    # The lock is released again after the rejected call.
    assert seeded_client.post("/api/refresh").status_code == 200
    assert seeded_client.get("/api/health").json()["syncInProgress"] is False


def test_refresh_reports_a_missing_sessions_directory(client, settings):
    import shutil

    shutil.rmtree(settings.sessions_dir)
    response = client.post("/api/refresh")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "error"
    assert "sessions directory not found" in body["errorMessage"]
    health = client.get("/api/health").json()
    assert health["sessionsDirExists"] is False


# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #


def test_summary_returns_camel_case_and_iso_timestamps(seeded_client):
    body = seeded_client.get("/api/summary", params=ALL).json()

    assert body["sessionCount"] == 14
    assert body["totalTokens"] == 13_830
    assert body["costTotal"] == pytest.approx(0.181534)
    assert body["totalTokensFormatted"] == "13.8K"
    assert body["costTotalFormatted"] == "$0.18"
    assert body["mostUsedModel"] == {
        "provider": "anthropic",
        "model": "claude-sonnet-4-5",
    }
    assert body["mostActiveProject"] == "/work/alpha"
    assert set(body["range"]) == {"range", "start", "end", "timezone", "groupBy"}
    assert body["range"]["range"] == "all"
    assert body["range"]["end"].endswith("Z")
    assert "total_tokens" not in body


def test_summary_custom_range_alias_parameters(seeded_client):
    # ``from``/``to`` are the documented aliases; ``start``/``end`` also work.
    alias = seeded_client.get(
        "/api/summary", params={"range": "custom", "from": "2026-01-16", "to": "2026-01-16"}
    ).json()
    swapped = seeded_client.get(
        "/api/summary", params={"range": "custom", "start": "2026-01-16", "end": "2026-01-16"}
    ).json()

    for body in (alias, swapped):
        # The suite pins TZ=UTC (conftest), so "2026-01-16" is a UTC day and
        # only BETA's post-midnight record falls inside it.
        assert body["range"]["timezone"] == "UTC"
        assert body["sessionCount"] == 1
        assert body["totalTokens"] == fixture_corpus.BETA["total_tokens"] // 2
        assert body["costTotal"] == pytest.approx(
            fixture_corpus.BETA["cost_total_micro"] / 2 / 1_000_000
        )


@pytest.mark.parametrize("group_by", ["hour", "day", "week", "month"])
def test_timeseries_supports_every_grouping(seeded_client, group_by):
    body = seeded_client.get(
        "/api/usage/timeseries", params={**ALL, "groupBy": group_by}
    ).json()

    assert body["range"]["groupBy"] == group_by
    assert body["points"], body
    assert sum(point["totalTokens"] for point in body["points"]) == 13_830
    for point in body["points"]:
        assert isinstance(point["bucket"], str)
        assert set(point) >= {"bucket", "totalTokens", "costTotal", "sessionCount"}


def test_by_model_and_by_project_shapes(seeded_client):
    models = seeded_client.get("/api/usage/by-model", params=ALL).json()
    projects = seeded_client.get("/api/usage/by-project", params=ALL).json()

    assert [row["model"] for row in models["models"]] == [
        "claude-sonnet-4-5",
        "gpt-5.1",
    ]
    assert sum(row["totalTokens"] for row in models["models"]) == 13_830
    assert projects["projects"][0]["cwd"] == "/work/alpha"
    assert projects["projects"][0]["totalTokens"] == 12_525
    assert sum(row["totalTokens"] for row in projects["projects"]) == 13_830


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #


def test_sessions_list_fixture_values(seeded_client):
    body = seeded_client.get("/api/sessions", params={**ALL, "pageSize": 100}).json()

    assert body["total"] == 14
    assert body["page"] == 1
    assert body["pageSize"] == 100
    by_id = {row["sessionId"]: row for row in body["sessions"]}
    main = by_id[fixture_corpus.MAIN_ID]

    assert main["title"] == fixture_corpus.MAIN.title
    assert main["totalTokens"] == fixture_corpus.MAIN.total_tokens
    assert main["costTotal"] == pytest.approx(0.019409)
    assert main["startedAt"] == "2026-01-15T09:00:00.000Z"
    assert main["lastActivityAt"] == "2026-01-15T09:02:40.000Z"
    assert main["models"] == [
        {"provider": "anthropic", "model": "claude-sonnet-4-5"},
        {"provider": "openai", "model": "gpt-5.1"},
    ]
    assert main["parseStatus"] == "ok"


def test_sessions_pagination_boundaries(seeded_client):
    first = seeded_client.get(
        "/api/sessions", params={**ALL, "pageSize": 5, "page": 1}
    ).json()
    last = seeded_client.get(
        "/api/sessions", params={**ALL, "pageSize": 5, "page": 3}
    ).json()
    beyond = seeded_client.get(
        "/api/sessions", params={**ALL, "pageSize": 5, "page": 99}
    ).json()

    assert len(first["sessions"]) == 5
    assert len(last["sessions"]) == 4
    assert first["total"] == last["total"] == beyond["total"] == 14
    assert beyond["sessions"] == []
    assert beyond["page"] == 99

    ids = [row["sessionId"] for row in first["sessions"] + last["sessions"]]
    assert len(ids) == len(set(ids))


def test_sessions_invalid_pagination_is_rejected(seeded_client):
    assert seeded_client.get("/api/sessions", params={**ALL, "page": 0}).status_code == 422
    assert (
        seeded_client.get("/api/sessions", params={**ALL, "pageSize": 0}).status_code == 422
    )
    assert (
        seeded_client.get(
            "/api/sessions", params={**ALL, "pageSize": 10_000}
        ).json()["pageSize"]
        == 500
    )


@pytest.mark.parametrize(
    "params",
    [
        {"search": "Refactor parser"},
        {"q": "Refactor parser"},
    ],
)
def test_sessions_search_aliases(seeded_client, params):
    body = seeded_client.get("/api/sessions", params={**ALL, **params}).json()
    assert [row["sessionId"] for row in body["sessions"]] == [fixture_corpus.MAIN_ID]


def test_sessions_cwd_model_sort_and_min_cost(seeded_client):
    by_cwd = seeded_client.get("/api/sessions", params={**ALL, "cwd": "/work/beta"}).json()
    assert [row["sessionId"] for row in by_cwd["sessions"]] == [fixture_corpus.BETA_ID]

    by_model = seeded_client.get("/api/sessions", params={**ALL, "model": "gpt-5.1"}).json()
    assert {row["sessionId"] for row in by_model["sessions"]} == {
        fixture_corpus.MAIN_ID,
        fixture_corpus.BETA_ID,
    }

    cost_desc = seeded_client.get(
        "/api/sessions", params={**ALL, "sort": "cost", "dir": "desc", "pageSize": 3}
    ).json()
    assert [row["costTotal"] for row in cost_desc["sessions"]] == [0.02, 0.02, 0.02]

    started_asc = seeded_client.get(
        "/api/sessions", params={**ALL, "sort": "started", "dir": "asc", "pageSize": 100}
    ).json()
    started_at = [row["startedAt"] for row in started_asc["sessions"]]
    assert started_at == sorted(started_at)

    cheapskate = seeded_client.get(
        "/api/sessions", params={**ALL, "minCost": "0.02", "pageSize": 100}
    ).json()
    assert fixture_corpus.MAIN_ID not in {row["sessionId"] for row in cheapskate["sessions"]}


def test_sessions_unknown_sort_falls_back(seeded_client):
    body = seeded_client.get("/api/sessions", params={**ALL, "sort": "bogus"}).json()
    assert body["total"] == 14


def test_sessions_empty_result_shape(seeded_client):
    body = seeded_client.get("/api/sessions", params={**ALL, "cwd": "/nowhere"}).json()
    assert body == {"sessions": [], "total": 0, "page": 1, "pageSize": 25}


# --------------------------------------------------------------------------- #
# Session detail and entries
# --------------------------------------------------------------------------- #


def test_session_detail_returns_entries_and_related_fields(seeded_client):
    body = seeded_client.get(f"/api/sessions/{fixture_corpus.MAIN_ID}").json()

    assert body["session"]["sessionId"] == fixture_corpus.MAIN_ID
    assert body["totals"]["totalTokens"] == fixture_corpus.MAIN.total_tokens
    assert body["entriesTotal"] == fixture_corpus.MAIN.entry_count
    assert len(body["entries"]) == fixture_corpus.MAIN.entry_count
    assert body["relatedSessions"] == []
    assert body["relatedCostTotal"] == 0.0
    assert body["combinedCostTotal"] == pytest.approx(0.019409)
    assert [row["model"] for row in body["models"]] == ["claude-sonnet-4-5", "gpt-5.1"]

    orphan = next(entry for entry in body["entries"] if entry["entryId"] == "r3")
    assert orphan["toolCallId"] == fixture_corpus.MAIN.orphan_tool_call_id
    assert orphan["usagePresent"] is False

    assistant = next(entry for entry in body["entries"] if entry["entryId"] == "a1")
    assert assistant["usage"]["totalTokens"] == 6040
    assert assistant["usage"]["costTotal"] == pytest.approx(0.01097)
    assert assistant["timestamp"] == "2026-01-15T09:00:04.000Z"


def test_parent_detail_reports_mapped_children(seeded_client):
    body = seeded_client.get(f"/api/sessions/{fixture_corpus.PARENT_ID}").json()

    assert {item["sessionId"] for item in body["relatedSessions"]} == set(
        fixture_corpus.MAPPED_CHILD_IDS
    )
    assert body["relatedCostTotal"] == pytest.approx(
        len(fixture_corpus.MAPPED_CHILD_IDS) * 0.02
    )
    assert body["combinedCostTotal"] == pytest.approx(
        fixture_corpus.PARENT["combined_cost_micro_with_mapped_children"] / 1_000_000
    )
    assert body["totals"]["costTotal"] == pytest.approx(0.0007)


def test_unknown_session_returns_404_with_code(seeded_client):
    response = seeded_client.get("/api/sessions/00000000-0000-4000-8000-000000000000")
    assert response.status_code == 404
    assert response.json()["code"] == "session_not_found"
    assert response.json()["detail"].startswith("session not found")


def test_entries_endpoint_pagination(seeded_client):
    first = seeded_client.get(
        f"/api/sessions/{fixture_corpus.LONG_ID}/entries", params={"offset": 0, "limit": 5}
    ).json()
    second = seeded_client.get(
        f"/api/sessions/{fixture_corpus.LONG_ID}/entries", params={"offset": 5, "limit": 5}
    ).json()

    assert first["total"] == fixture_corpus.LONG["entry_count"]
    assert first["offset"] == 0
    assert first["limit"] == 5
    assert [entry["entryIndex"] for entry in first["entries"]] == [0, 1, 2, 3, 4]
    assert [entry["entryIndex"] for entry in second["entries"]] == [5, 6, 7, 8, 9]

    clamped = seeded_client.get(
        f"/api/sessions/{fixture_corpus.LONG_ID}/entries", params={"limit": 5000}
    ).json()
    assert clamped["limit"] == 500


def test_entries_invalid_pagination_is_rejected(seeded_client):
    path = f"/api/sessions/{fixture_corpus.LONG_ID}/entries"
    assert seeded_client.get(path, params={"offset": -1}).status_code == 422
    assert seeded_client.get(path, params={"limit": 0}).status_code == 422


def test_entries_unknown_session_returns_404(seeded_client):
    response = seeded_client.get("/api/sessions/nope/entries")
    assert response.status_code == 404
    assert response.json()["code"] == "session_not_found"


def test_entries_preserve_long_tool_output(seeded_client):
    body = seeded_client.get(
        f"/api/sessions/{fixture_corpus.LONG_ID}/entries", params={"limit": 500}
    ).json()
    tool_result = next(
        entry for entry in body["entries"] if entry["toolCallId"] == "l-call-1"
    )
    assert len(tool_result["content"][0]["text"]) == fixture_corpus.LONG["longest_string_chars"]


# --------------------------------------------------------------------------- #
# Filters and errors
# --------------------------------------------------------------------------- #


def test_filters_endpoint(seeded_client):
    body = seeded_client.get("/api/filters").json()

    assert body["sessionCount"] == fixture_corpus.FULL_VARIANT_INDEXED_SESSIONS
    assert body["providers"] == ["anthropic", "openai"]
    assert {ref["model"] for ref in body["models"]} == {
        "claude-sonnet-4-5",
        "gpt-5.1",
    }
    assert body["cwds"][0] == "/work/alpha"
    assert body["firstSessionAt"] == "2026-01-12T06:00:00.000Z"
    assert body["lastSessionAt"] == "2026-01-16T00:02:00.000Z"


def test_filters_zero_usage_session_gap_is_visible(client, write_session):
    """Known inconsistency: sessions without usage appear in filters, not in lists."""
    write_session(
        [
            j.session_header("aaaaaaaa-0000-4000-8000-0000000000f1", cwd="/work/zero"),
            j.user_message("z-u1", "zero usage session"),
        ],
        name="zero.jsonl",
    )
    write_session(
        [
            j.session_header("bbbbbbbb-0000-4000-8000-0000000000f2", cwd="/work/used"),
            j.user_message("u-u1", "used session"),
            j.assistant_message(
                "u-a1",
                timestamp="2026-01-15T09:00:01.000Z",
                parent_id="u-u1",
                text="answer",
                usage=j.usage_object(
                    input=10, output=5, total_tokens=15, cost={"total": "0.000015"}
                ),
            ),
        ],
        name="used.jsonl",
    )
    assert client.post("/api/refresh").status_code == 200

    filters = client.get("/api/filters").json()
    listing = client.get("/api/sessions", params=ALL).json()
    summary = client.get("/api/summary", params=ALL).json()

    assert filters["sessionCount"] == 2
    assert set(filters["cwds"]) == {"/work/zero", "/work/used"}
    assert listing["total"] == 1
    assert summary["sessionCount"] == 1
    assert filters["sessionCount"] != listing["total"]


@pytest.mark.parametrize(
    ("params", "message"),
    [
        ({"range": "bogus"}, "unknown range"),
        ({"range": "custom"}, "custom range requires from and to"),
        (
            {"range": "custom", "from": "2026-01-16", "to": "2026-01-15"},
            "custom range end is before start",
        ),
        ({"range": "custom", "from": "nope", "to": "2026-01-15"}, "invalid from date"),
    ],
)
def test_summary_invalid_ranges_return_422(seeded_client, params, message):
    response = seeded_client.get("/api/summary", params=params)
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_range"
    assert message in response.json()["detail"]


def test_timeseries_rejects_unknown_group_by(seeded_client):
    response = seeded_client.get(
        "/api/usage/timeseries", params={"range": "7d", "groupBy": "year"}
    )
    assert response.status_code == 422
    assert response.json()["code"] == "invalid_range"


def test_unknown_api_paths_return_404(client):
    assert client.get("/api/does-not-exist").status_code == 404
    assert client.get("/api").status_code == 404


def test_non_loopback_client_is_forbidden(app):
    with TestClient(app, client=("10.1.2.3", 40000)) as remote:
        response = remote.get("/api/health")
    assert response.status_code == 403
    assert response.json()["code"] == "forbidden"


def test_tailnet_client_is_allowed(app):
    with TestClient(app, client=("100.101.102.103", 40000)) as tailnet:
        assert tailnet.get("/api/health").status_code == 200


def test_openapi_lists_every_endpoint(seeded_client):
    paths = set(seeded_client.get("/openapi.json").json()["paths"])
    assert API_PATHS_FROM_OPENAPI <= paths


def test_empty_database_endpoint_shapes(client):
    for path in (
        "/api/summary",
        "/api/usage/by-model",
        "/api/usage/by-project",
        "/api/filters",
    ):
        response = client.get(path, params={"range": "all"})
        assert response.status_code == 200, path

    summary = client.get("/api/summary", params=ALL).json()
    assert summary["sessionCount"] == 0
    assert summary["totalTokens"] == 0
    assert summary["mostUsedModel"] is None
    assert client.get("/api/usage/by-model", params=ALL).json()["models"] == []
    assert client.get("/api/usage/timeseries", params=ALL).json()["points"] == []
    assert client.get("/api/filters").json()["sessionCount"] == 0


def test_cors_is_absent_by_default(client):
    response = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


def test_cors_is_restricted_to_the_configured_origin(settings, tmp_path, monkeypatch):
    from app.config import Settings, get_settings
    from app.main import create_app

    monkeypatch.setenv("PI_METER_DEV_CORS_ORIGIN", "http://localhost:5173")
    get_settings.cache_clear()
    cors_settings = Settings(
        sessions_dir=settings.sessions_dir,
        db_path=tmp_path / "cors.sqlite",
        frontend_dist=tmp_path / "dist",
        sync_on_startup=False,
        log_level="WARNING",
        dev_cors_origin="http://localhost:5173",
    )
    application = create_app(cors_settings)
    try:
        with TestClient(application) as cors_client:
            allowed = cors_client.get(
                "/api/health", headers={"Origin": "http://localhost:5173"}
            )
            other = cors_client.get(
                "/api/health", headers={"Origin": "http://evil.example"}
            )
        assert allowed.headers["access-control-allow-origin"] == "http://localhost:5173"
        assert "access-control-allow-origin" not in other.headers
    finally:
        application.state.engine.dispose()
        get_settings.cache_clear()
