"""Pydantic response schemas for the Pi Meter API.

Contract:

* Every response model inherits :class:`CamelModel`, so JSON keys are camelCase
  while Python code uses snake_case.
* Timestamps are serialized as ISO-8601 UTC strings with a ``Z`` suffix. Fields
  typed :data:`UtcTimestamp` accept either an aware/naive ``datetime`` or an
  integer UTC epoch-millisecond value (as stored in SQLite).
* Costs are floats (derived from integer micro-units at the API boundary) and
  tokens are ints.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
        serialize_by_alias=True,
    )


def _to_utc(value: Any) -> Any:
    """Coerce epoch-millisecond ints into aware UTC datetimes."""
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return datetime.fromtimestamp(value / 1000, tz=timezone.utc)
    return value


def _serialize_utc(value: datetime) -> str:
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


UtcTimestamp = Annotated[
    datetime,
    BeforeValidator(_to_utc),
    PlainSerializer(_serialize_utc, return_type=str, when_used="json"),
]


# --------------------------------------------------------------------------- #
# Shared building blocks
# --------------------------------------------------------------------------- #


class ModelRef(CamelModel):
    provider: str | None = None
    model: str | None = None


class UsageTotals(CamelModel):
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    cost_input: float = 0.0
    cost_output: float = 0.0
    cost_cache_read: float = 0.0
    cost_cache_write: float = 0.0
    cost_total: float = 0.0


class RangeMeta(CamelModel):
    """The range actually applied, echoed back so the UI can label the view."""

    range_: str = Field(alias="range")
    start: UtcTimestamp | None = None
    end: UtcTimestamp | None = None
    timezone: str
    group_by: str | None = None


class ParseWarning(CamelModel):
    line: int | None = None
    kind: str | None = None
    message: str | None = None
    preview: str | None = None


# --------------------------------------------------------------------------- #
# Health and refresh
# --------------------------------------------------------------------------- #


class SyncStats(CamelModel):
    files_seen: int = 0
    files_added: int = 0
    files_updated: int = 0
    files_removed: int = 0
    files_failed: int = 0
    duration_ms: int = 0
    status: str = "ok"
    error_message: str | None = None
    started_at: UtcTimestamp | None = None
    finished_at: UtcTimestamp | None = None


class HealthResponse(CamelModel):
    status: str = "ok"
    version: str
    database_ok: bool
    sessions_dir: str
    sessions_dir_exists: bool
    sync_in_progress: bool = False
    last_sync: SyncStats | None = None


# --------------------------------------------------------------------------- #
# Dashboard aggregates
# --------------------------------------------------------------------------- #


class SummaryResponse(CamelModel):
    range: RangeMeta
    session_count: int = 0
    user_message_count: int = 0
    assistant_message_count: int = 0
    tool_call_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    total_tokens_formatted: str | None = None
    cost_input: float = 0.0
    cost_output: float = 0.0
    cost_cache_read: float = 0.0
    cost_cache_write: float = 0.0
    cost_total: float = 0.0
    cost_total_formatted: str | None = None
    avg_session_cost: float = 0.0
    most_used_model: ModelRef | None = None
    most_active_project: str | None = None


class TimeseriesPoint(CamelModel):
    bucket: str
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    cost_total: float = 0.0
    session_count: int = 0


class TimeseriesResponse(CamelModel):
    range: RangeMeta
    points: list[TimeseriesPoint] = []


class ModelRow(CamelModel):
    provider: str | None = None
    model: str | None = None
    usage_record_count: int = 0
    session_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    cost_input: float = 0.0
    cost_output: float = 0.0
    cost_cache_read: float = 0.0
    cost_cache_write: float = 0.0
    cost_total: float = 0.0


class ModelBreakdownResponse(CamelModel):
    range: RangeMeta
    models: list[ModelRow] = []


class ProjectRow(CamelModel):
    cwd: str | None = None
    session_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    cost_total: float = 0.0


class ProjectBreakdownResponse(CamelModel):
    range: RangeMeta
    projects: list[ProjectRow] = []


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #


class SessionOut(CamelModel):
    session_id: str
    title: str | None = None
    session_name: str | None = None
    first_user_message: str | None = None
    cwd: str | None = None
    file_name: str | None = None
    file_path: str | None = None
    file_size: int = 0
    version: int = 1
    started_at: UtcTimestamp | None = None
    last_activity_at: UtcTimestamp | None = None
    first_usage_at: UtcTimestamp | None = None
    last_usage_at: UtcTimestamp | None = None
    duration_ms: int | None = None
    models: list[ModelRef] = []
    entry_count: int = 0
    message_count: int = 0
    user_message_count: int = 0
    assistant_message_count: int = 0
    tool_result_count: int = 0
    tool_call_count: int = 0
    model_change_count: int = 0
    compaction_count: int = 0
    context_edit_count: int = 0
    usage_record_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    cost_input: float = 0.0
    cost_output: float = 0.0
    cost_cache_read: float = 0.0
    cost_cache_write: float = 0.0
    cost_total: float = 0.0
    parse_status: str = "ok"
    parse_error: str | None = None
    parse_error_count: int = 0
    parse_warnings: list[ParseWarning] = []


class SessionListResponse(CamelModel):
    sessions: list[SessionOut] = []
    total: int = 0
    page: int = 1
    page_size: int = 25


class EntryUsage(CamelModel):
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    total_tokens: int = 0
    cost_input: float = 0.0
    cost_output: float = 0.0
    cost_cache_read: float = 0.0
    cost_cache_write: float = 0.0
    cost_total: float = 0.0


class EntryOut(CamelModel):
    entry_index: int
    entry_id: str | None = None
    parent_id: str | None = None
    type: str
    role: str | None = None
    timestamp: UtcTimestamp | None = None
    provider: str | None = None
    model: str | None = None
    thinking_level: str | None = None
    tool_name: str | None = None
    tool_call_id: str | None = None
    is_error: bool | None = None
    duration_ms: int | None = None
    usage_present: bool = False
    usage: EntryUsage | None = None
    content: Any = None
    metadata: Any = None


class EntriesResponse(CamelModel):
    entries: list[EntryOut] = []
    total: int = 0
    offset: int = 0
    limit: int = 200


class RelatedSession(CamelModel):
    session_id: str
    title: str | None = None
    cost_total: float = 0.0
    total_tokens: int = 0


class SessionDetailResponse(CamelModel):
    session: SessionOut
    totals: UsageTotals
    models: list[ModelRow] = []
    entries: list[EntryOut] = []
    entries_total: int = 0
    related_sessions: list[RelatedSession] = []
    related_cost_total: float = 0.0
    combined_cost_total: float = 0.0


# --------------------------------------------------------------------------- #
# Filter metadata
# --------------------------------------------------------------------------- #


class FiltersResponse(CamelModel):
    cwds: list[str] = []
    models: list[ModelRef] = []
    providers: list[str] = []
    session_count: int = 0
    first_session_at: UtcTimestamp | None = None
    last_session_at: UtcTimestamp | None = None
