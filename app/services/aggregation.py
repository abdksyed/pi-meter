"""Read-side aggregation queries.

All functions take a SQLAlchemy session plus a :class:`~app.services.ranges.RangeSpec`
and return response-schema objects. Usage aggregates always come from
``entries`` rows with ``usage_present = 1`` inside the range; session-level
columns are only used for metadata and whole-session counts. Costs are converted
from integer micro-units at this boundary via ``services.formatting``.
"""

from __future__ import annotations

import json
import re

from sqlalchemy import case, distinct, func, or_, select
from sqlalchemy.orm import Session

from app.models import EntryRow, SessionRow
from app.schemas import (
    EntriesResponse,
    EntryOut,
    EntryUsage,
    FiltersResponse,
    ModelBreakdownResponse,
    ModelRef,
    ModelRow,
    ParseWarning,
    ProjectBreakdownResponse,
    ProjectRow,
    RelatedSession,
    SessionDetailResponse,
    SessionListResponse,
    SessionOut,
    SummaryResponse,
    TimeseriesPoint,
    TimeseriesResponse,
    UsageTotals,
)
from app.services.formatting import format_cost, format_tokens, micro_to_cost
from app.services.ranges import (
    RangeSpec,
    iter_bucket_labels,
    label_for_timestamp,
)

MICRO = 1_000_000


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def _usage_conditions(spec: RangeSpec, model: str | None = None) -> list[Any]:
    conditions: list[Any] = [EntryRow.usage_present.is_(True)]
    if spec.start_ms is not None:
        conditions.append(EntryRow.timestamp_ms >= spec.start_ms)
    conditions.append(EntryRow.timestamp_ms < spec.end_ms)
    if model:
        conditions.append(EntryRow.model == model)
    return conditions


def _range_conditions(spec: RangeSpec) -> list[Any]:
    conditions: list[Any] = []
    if spec.start_ms is not None:
        conditions.append(EntryRow.timestamp_ms >= spec.start_ms)
    conditions.append(EntryRow.timestamp_ms < spec.end_ms)
    return conditions


def _usage_sum_columns() -> list[Any]:
    return [
        func.coalesce(func.sum(EntryRow.input_tokens), 0),
        func.coalesce(func.sum(EntryRow.output_tokens), 0),
        func.coalesce(func.sum(EntryRow.reasoning_tokens), 0),
        func.coalesce(func.sum(EntryRow.cache_read_tokens), 0),
        func.coalesce(func.sum(EntryRow.cache_write_tokens), 0),
        func.coalesce(func.sum(EntryRow.total_tokens), 0),
        func.coalesce(func.sum(EntryRow.cost_input_micro), 0),
        func.coalesce(func.sum(EntryRow.cost_output_micro), 0),
        func.coalesce(func.sum(EntryRow.cost_cache_read_micro), 0),
        func.coalesce(func.sum(EntryRow.cost_cache_write_micro), 0),
        func.coalesce(func.sum(EntryRow.cost_total_micro), 0),
    ]


def _decode_json(value: str | None) -> Any:
    if not value:
        return None
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return None


def _decode_models(value: str | None) -> list[ModelRef]:
    raw = _decode_json(value)
    if not isinstance(raw, list):
        return []
    return [
        ModelRef(provider=item.get("provider"), model=item.get("model"))
        for item in raw
        if isinstance(item, dict) and (item.get("provider") or item.get("model"))
    ]


def _decode_warnings(value: str | None) -> list[ParseWarning]:
    raw = _decode_json(value)
    if not isinstance(raw, list):
        return []
    return [
        ParseWarning(
            line=item.get("line"),
            kind=item.get("kind"),
            message=item.get("message"),
            preview=item.get("preview"),
        )
        for item in raw
        if isinstance(item, dict)
    ]


def _session_out(
    row: SessionRow,
    usage: dict[str, int] | None = None,
    usage_record_count: int | None = None,
) -> SessionOut:
    usage = usage or {}
    started = row.started_at or None
    last_activity = row.last_activity_at
    duration = (
        max(0, last_activity - row.started_at)
        if last_activity is not None and row.started_at
        else None
    )
    return SessionOut(
        session_id=row.session_id,
        title=row.title,
        session_name=row.session_name,
        first_user_message=row.first_user_message,
        cwd=row.cwd,
        file_name=row.file_name,
        file_path=row.file_path,
        file_size=row.file_size,
        version=row.version,
        started_at=started,
        last_activity_at=last_activity,
        first_usage_at=row.first_usage_at,
        last_usage_at=row.last_usage_at,
        duration_ms=duration,
        models=_decode_models(row.models_json),
        entry_count=row.entry_count,
        message_count=row.message_count,
        user_message_count=row.user_message_count,
        assistant_message_count=row.assistant_message_count,
        tool_result_count=row.tool_result_count,
        tool_call_count=row.tool_call_count,
        model_change_count=row.model_change_count,
        compaction_count=row.compaction_count,
        context_edit_count=row.context_edit_count,
        usage_record_count=(
            usage_record_count
            if usage_record_count is not None
            else row.usage_record_count
        ),
        input_tokens=usage.get("input_tokens", row.input_tokens),
        output_tokens=usage.get("output_tokens", row.output_tokens),
        reasoning_tokens=usage.get("reasoning_tokens", row.reasoning_tokens),
        cache_read_tokens=usage.get("cache_read_tokens", row.cache_read_tokens),
        cache_write_tokens=usage.get("cache_write_tokens", row.cache_write_tokens),
        total_tokens=usage.get("total_tokens", row.total_tokens),
        cost_input=micro_to_cost(usage.get("cost_input_micro", row.cost_input_micro)),
        cost_output=micro_to_cost(usage.get("cost_output_micro", row.cost_output_micro)),
        cost_cache_read=micro_to_cost(
            usage.get("cost_cache_read_micro", row.cost_cache_read_micro)
        ),
        cost_cache_write=micro_to_cost(
            usage.get("cost_cache_write_micro", row.cost_cache_write_micro)
        ),
        cost_total=micro_to_cost(usage.get("cost_total_micro", row.cost_total_micro)),
        parse_status=row.parse_status,
        parse_error=row.parse_error,
        parse_error_count=row.parse_error_count,
        parse_warnings=_decode_warnings(row.parse_warnings_json),
    )


def _entry_out(row: EntryRow) -> EntryOut:
    usage = None
    if row.usage_present:
        usage = EntryUsage(
            input_tokens=row.input_tokens,
            output_tokens=row.output_tokens,
            reasoning_tokens=row.reasoning_tokens,
            cache_read_tokens=row.cache_read_tokens,
            cache_write_tokens=row.cache_write_tokens,
            total_tokens=row.total_tokens,
            cost_input=micro_to_cost(row.cost_input_micro),
            cost_output=micro_to_cost(row.cost_output_micro),
            cost_cache_read=micro_to_cost(row.cost_cache_read_micro),
            cost_cache_write=micro_to_cost(row.cost_cache_write_micro),
            cost_total=micro_to_cost(row.cost_total_micro),
        )
    return EntryOut(
        entry_index=row.entry_index,
        entry_id=row.entry_id,
        parent_id=row.parent_id,
        type=row.entry_type,
        role=row.role,
        timestamp=row.timestamp_ms,
        provider=row.provider,
        model=row.model,
        thinking_level=row.thinking_level,
        tool_name=row.tool_name,
        tool_call_id=row.tool_call_id,
        is_error=row.is_error,
        duration_ms=row.duration_ms,
        usage_present=row.usage_present,
        usage=usage,
        content=_decode_json(row.content_json),
        metadata=_decode_json(row.metadata_json),
    )


def _usage_totals_from_row(row: SessionRow) -> UsageTotals:
    return UsageTotals(
        input_tokens=row.input_tokens,
        output_tokens=row.output_tokens,
        reasoning_tokens=row.reasoning_tokens,
        cache_read_tokens=row.cache_read_tokens,
        cache_write_tokens=row.cache_write_tokens,
        total_tokens=row.total_tokens,
        cost_input=micro_to_cost(row.cost_input_micro),
        cost_output=micro_to_cost(row.cost_output_micro),
        cost_cache_read=micro_to_cost(row.cost_cache_read_micro),
        cost_cache_write=micro_to_cost(row.cost_cache_write_micro),
        cost_total=micro_to_cost(row.cost_total_micro),
    )


# --------------------------------------------------------------------------- #
# Summary
# --------------------------------------------------------------------------- #


def summary(
    db: Session, spec: RangeSpec, cwd: str | None = None, model: str | None = None
) -> SummaryResponse:
    usage_stmt = select(
        func.count(distinct(EntryRow.session_id)), *_usage_sum_columns()
    ).select_from(EntryRow)
    if cwd is not None:
        usage_stmt = usage_stmt.join(SessionRow, EntryRow.session_id == SessionRow.id)
    conditions = _usage_conditions(spec, model)
    if cwd is not None:
        conditions.append(SessionRow.cwd == cwd)
    usage_row = db.execute(usage_stmt.where(*conditions)).one()
    session_count = int(usage_row[0] or 0)
    (
        input_tokens,
        output_tokens,
        reasoning_tokens,
        cache_read_tokens,
        cache_write_tokens,
        total_tokens,
        cost_input,
        cost_output,
        cost_cache_read,
        cost_cache_write,
        cost_total,
    ) = (int(value or 0) for value in usage_row[1:])

    counts_stmt = select(
        func.coalesce(func.sum(case((EntryRow.role == "user", 1), else_=0)), 0),
        func.coalesce(func.sum(case((EntryRow.role == "assistant", 1), else_=0)), 0),
    ).select_from(EntryRow)
    count_conditions = _range_conditions(spec)
    if cwd is not None:
        counts_stmt = counts_stmt.join(SessionRow, EntryRow.session_id == SessionRow.id)
        count_conditions.append(SessionRow.cwd == cwd)
    if model:
        count_conditions.append(EntryRow.model == model)
    user_messages, assistant_messages = db.execute(
        counts_stmt.where(*count_conditions)
    ).one()

    session_ids = select(EntryRow.session_id).where(*conditions).distinct()
    tool_stmt = select(func.coalesce(func.sum(SessionRow.tool_call_count), 0)).where(
        SessionRow.id.in_(session_ids)
    )
    if cwd is not None:
        tool_stmt = tool_stmt.where(SessionRow.cwd == cwd)
    tool_call_count = int(db.execute(tool_stmt).scalar_one() or 0)

    model_stmt = (
        select(
            EntryRow.provider,
            EntryRow.model,
            func.coalesce(func.sum(EntryRow.cost_total_micro), 0).label("cost"),
            func.coalesce(func.sum(EntryRow.total_tokens), 0).label("tokens"),
        )
        .where(*conditions, EntryRow.model.is_not(None))
        .group_by(EntryRow.provider, EntryRow.model)
        .order_by(func.sum(EntryRow.cost_total_micro).desc(), func.sum(EntryRow.total_tokens).desc())
        .limit(1)
    )
    most_used_model_row = db.execute(model_stmt).first()
    most_used_model = (
        ModelRef(provider=most_used_model_row[0], model=most_used_model_row[1])
        if most_used_model_row is not None
        else None
    )

    project_stmt = (
        select(
            SessionRow.cwd,
            func.coalesce(func.sum(EntryRow.cost_total_micro), 0).label("cost"),
            func.count(distinct(EntryRow.session_id)).label("sessions"),
        )
        .select_from(EntryRow)
        .join(SessionRow, EntryRow.session_id == SessionRow.id)
        .where(*conditions, SessionRow.cwd.is_not(None))
        .group_by(SessionRow.cwd)
        .order_by(
            func.sum(EntryRow.cost_total_micro).desc(),
            func.count(distinct(EntryRow.session_id)).desc(),
        )
        .limit(1)
    )
    project_row = db.execute(project_stmt).first()
    most_active_project = project_row[0] if project_row is not None else None

    cost_total_units = micro_to_cost(cost_total)
    return SummaryResponse(
        range=spec.meta(),
        session_count=session_count,
        user_message_count=int(user_messages or 0),
        assistant_message_count=int(assistant_messages or 0),
        tool_call_count=tool_call_count,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        reasoning_tokens=reasoning_tokens,
        cache_read_tokens=cache_read_tokens,
        cache_write_tokens=cache_write_tokens,
        total_tokens=total_tokens,
        total_tokens_formatted=format_tokens(total_tokens),
        cost_input=micro_to_cost(cost_input),
        cost_output=micro_to_cost(cost_output),
        cost_cache_read=micro_to_cost(cost_cache_read),
        cost_cache_write=micro_to_cost(cost_cache_write),
        cost_total=cost_total_units,
        cost_total_formatted=format_cost(cost_total_units),
        avg_session_cost=(
            round(cost_total_units / session_count, 6) if session_count else 0.0
        ),
        most_used_model=most_used_model,
        most_active_project=most_active_project,
    )


# --------------------------------------------------------------------------- #
# Time series
# --------------------------------------------------------------------------- #


def timeseries(
    db: Session,
    spec: RangeSpec,
    group_by: str,
    cwd: str | None = None,
    model: str | None = None,
) -> TimeseriesResponse:
    stmt = select(
        EntryRow.timestamp_ms,
        EntryRow.session_id,
        EntryRow.input_tokens,
        EntryRow.output_tokens,
        EntryRow.reasoning_tokens,
        EntryRow.cache_read_tokens,
        EntryRow.cache_write_tokens,
        EntryRow.total_tokens,
        EntryRow.cost_total_micro,
    ).select_from(EntryRow)
    conditions = _usage_conditions(spec, model)
    if cwd is not None:
        stmt = stmt.join(SessionRow, EntryRow.session_id == SessionRow.id)
        conditions.append(SessionRow.cwd == cwd)

    buckets: dict[str, dict[str, Any]] = {}
    first_ms: int | None = None
    for row in db.execute(stmt.where(*conditions)):
        timestamp_ms = row[0]
        if timestamp_ms is None:
            continue
        if first_ms is None or timestamp_ms < first_ms:
            first_ms = timestamp_ms
        label = label_for_timestamp(timestamp_ms, group_by, spec.tz)
        bucket = buckets.setdefault(
            label,
            {
                "input_tokens": 0,
                "output_tokens": 0,
                "reasoning_tokens": 0,
                "cache_read_tokens": 0,
                "cache_write_tokens": 0,
                "total_tokens": 0,
                "cost_total_micro": 0,
                "sessions": set(),
            },
        )
        bucket["input_tokens"] += row[2]
        bucket["output_tokens"] += row[3]
        bucket["reasoning_tokens"] += row[4]
        bucket["cache_read_tokens"] += row[5]
        bucket["cache_write_tokens"] += row[6]
        bucket["total_tokens"] += row[7]
        bucket["cost_total_micro"] += row[8]
        bucket["sessions"].add(row[1])

    points: list[TimeseriesPoint] = []
    for label in iter_bucket_labels(spec, group_by, first_ms):
        bucket = buckets.get(label)
        if bucket is None:
            points.append(TimeseriesPoint(bucket=label))
            continue
        points.append(
            TimeseriesPoint(
                bucket=label,
                input_tokens=bucket["input_tokens"],
                output_tokens=bucket["output_tokens"],
                reasoning_tokens=bucket["reasoning_tokens"],
                cache_read_tokens=bucket["cache_read_tokens"],
                cache_write_tokens=bucket["cache_write_tokens"],
                total_tokens=bucket["total_tokens"],
                cost_total=micro_to_cost(bucket["cost_total_micro"]),
                session_count=len(bucket["sessions"]),
            )
        )
    return TimeseriesResponse(range=spec.meta(group_by), points=points)


# --------------------------------------------------------------------------- #
# Breakdowns
# --------------------------------------------------------------------------- #


def by_model(
    db: Session, spec: RangeSpec, cwd: str | None = None, model: str | None = None
) -> ModelBreakdownResponse:
    stmt = select(
        EntryRow.provider,
        EntryRow.model,
        func.count(),
        func.count(distinct(EntryRow.session_id)),
        *_usage_sum_columns(),
    ).select_from(EntryRow)
    conditions = _usage_conditions(spec, model)
    if cwd is not None:
        stmt = stmt.join(SessionRow, EntryRow.session_id == SessionRow.id)
        conditions.append(SessionRow.cwd == cwd)
    conditions.append(EntryRow.model.is_not(None))
    stmt = (
        stmt.where(*conditions)
        .group_by(EntryRow.provider, EntryRow.model)
        .order_by(func.sum(EntryRow.cost_total_micro).desc())
    )
    rows: list[ModelRow] = []
    for row in db.execute(stmt):
        rows.append(
            ModelRow(
                provider=row[0],
                model=row[1],
                usage_record_count=int(row[2] or 0),
                session_count=int(row[3] or 0),
                input_tokens=int(row[4] or 0),
                output_tokens=int(row[5] or 0),
                reasoning_tokens=int(row[6] or 0),
                cache_read_tokens=int(row[7] or 0),
                cache_write_tokens=int(row[8] or 0),
                total_tokens=int(row[9] or 0),
                cost_input=micro_to_cost(int(row[10] or 0)),
                cost_output=micro_to_cost(int(row[11] or 0)),
                cost_cache_read=micro_to_cost(int(row[12] or 0)),
                cost_cache_write=micro_to_cost(int(row[13] or 0)),
                cost_total=micro_to_cost(int(row[14] or 0)),
            )
        )
    return ModelBreakdownResponse(range=spec.meta(), models=rows)


def by_project(
    db: Session, spec: RangeSpec, model: str | None = None
) -> ProjectBreakdownResponse:
    stmt = (
        select(
            SessionRow.cwd,
            func.count(distinct(EntryRow.session_id)),
            *_usage_sum_columns(),
        )
        .select_from(EntryRow)
        .join(SessionRow, EntryRow.session_id == SessionRow.id)
        .where(*_usage_conditions(spec, model), SessionRow.cwd.is_not(None))
        .group_by(SessionRow.cwd)
        .order_by(func.sum(EntryRow.cost_total_micro).desc())
    )
    rows: list[ProjectRow] = []
    for row in db.execute(stmt):
        rows.append(
            ProjectRow(
                cwd=row[0],
                session_count=int(row[1] or 0),
                input_tokens=int(row[2] or 0),
                output_tokens=int(row[3] or 0),
                reasoning_tokens=int(row[4] or 0),
                cache_read_tokens=int(row[5] or 0),
                cache_write_tokens=int(row[6] or 0),
                total_tokens=int(row[7] or 0),
                cost_total=micro_to_cost(int(row[12] or 0)),
            )
        )
    return ProjectBreakdownResponse(range=spec.meta(), projects=rows)


# --------------------------------------------------------------------------- #
# Sessions
# --------------------------------------------------------------------------- #

SORTS = {
    "lastActivity": "last_activity",
    "last_activity": "last_activity",
    "started": "started",
    "cost": "cost",
    "tokens": "tokens",
    "title": "title",
}


def list_sessions(
    db: Session,
    spec: RangeSpec,
    *,
    cwd: str | None = None,
    model: str | None = None,
    search: str | None = None,
    min_cost_micro: int | None = None,
    sort: str = "lastActivity",
    direction: str = "desc",
    page: int = 1,
    page_size: int = 25,
    max_page_size: int = 200,
) -> SessionListResponse:
    page = max(1, page)
    page_size = max(1, min(page_size, max_page_size))

    usage_agg = (
        select(
            EntryRow.session_id.label("session_pk"),
            func.count().label("usage_records"),
            func.coalesce(func.sum(EntryRow.input_tokens), 0).label("agg_input_tokens"),
            func.coalesce(func.sum(EntryRow.output_tokens), 0).label("agg_output_tokens"),
            func.coalesce(func.sum(EntryRow.reasoning_tokens), 0).label("agg_reasoning_tokens"),
            func.coalesce(func.sum(EntryRow.cache_read_tokens), 0).label("agg_cache_read_tokens"),
            func.coalesce(func.sum(EntryRow.cache_write_tokens), 0).label("agg_cache_write_tokens"),
            func.coalesce(func.sum(EntryRow.total_tokens), 0).label("agg_total_tokens"),
            func.coalesce(func.sum(EntryRow.cost_input_micro), 0).label("agg_cost_input_micro"),
            func.coalesce(func.sum(EntryRow.cost_output_micro), 0).label("agg_cost_output_micro"),
            func.coalesce(func.sum(EntryRow.cost_cache_read_micro), 0).label(
                "agg_cost_cache_read_micro"
            ),
            func.coalesce(func.sum(EntryRow.cost_cache_write_micro), 0).label(
                "agg_cost_cache_write_micro"
            ),
            func.coalesce(func.sum(EntryRow.cost_total_micro), 0).label("agg_cost_total_micro"),
        )
        .select_from(EntryRow)
        .where(*_usage_conditions(spec, model))
        .group_by(EntryRow.session_id)
        .subquery()
    )

    base = select(SessionRow, usage_agg).join(
        usage_agg, usage_agg.c.session_pk == SessionRow.id
    )
    conditions: list[Any] = []
    if cwd is not None:
        conditions.append(SessionRow.cwd == cwd)
    if search:
        pattern = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(func.coalesce(SessionRow.title, "")).like(pattern),
                func.lower(func.coalesce(SessionRow.session_name, "")).like(pattern),
                func.lower(func.coalesce(SessionRow.first_user_message, "")).like(pattern),
                func.lower(func.coalesce(SessionRow.cwd, "")).like(pattern),
                func.lower(SessionRow.session_id).like(pattern),
            )
        )
    if min_cost_micro is not None:
        conditions.append(usage_agg.c.agg_cost_total_micro >= min_cost_micro)
    if conditions:
        base = base.where(*conditions)

    total = int(db.execute(select(func.count()).select_from(base.subquery())).scalar_one())

    sort_key = SORTS.get(sort, "last_activity")
    if sort_key == "started":
        column = SessionRow.started_at
    elif sort_key == "cost":
        column = usage_agg.c.agg_cost_total_micro
    elif sort_key == "tokens":
        column = usage_agg.c.agg_total_tokens
    elif sort_key == "title":
        column = func.coalesce(SessionRow.session_name, SessionRow.title)
    else:
        column = func.coalesce(SessionRow.last_activity_at, SessionRow.started_at)
    order = column.asc() if direction.lower() == "asc" else column.desc()

    rows = db.execute(
        base.order_by(order, SessionRow.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    sessions: list[SessionOut] = []
    for row in rows:
        mapping = row._mapping
        sessions.append(
            _session_out(
                row[0],
                usage={
                    "input_tokens": int(mapping["agg_input_tokens"] or 0),
                    "output_tokens": int(mapping["agg_output_tokens"] or 0),
                    "reasoning_tokens": int(mapping["agg_reasoning_tokens"] or 0),
                    "cache_read_tokens": int(mapping["agg_cache_read_tokens"] or 0),
                    "cache_write_tokens": int(mapping["agg_cache_write_tokens"] or 0),
                    "total_tokens": int(mapping["agg_total_tokens"] or 0),
                    "cost_input_micro": int(mapping["agg_cost_input_micro"] or 0),
                    "cost_output_micro": int(mapping["agg_cost_output_micro"] or 0),
                    "cost_cache_read_micro": int(mapping["agg_cost_cache_read_micro"] or 0),
                    "cost_cache_write_micro": int(mapping["agg_cost_cache_write_micro"] or 0),
                    "cost_total_micro": int(mapping["agg_cost_total_micro"] or 0),
                },
                usage_record_count=int(mapping["usage_records"] or 0),
            )
        )

    return SessionListResponse(
        sessions=sessions, total=total, page=page, page_size=page_size
    )


def _get_session_row(db: Session, session_id: str) -> SessionRow:
    from app.errors import SessionNotFoundError

    row = db.execute(
        select(SessionRow)
        .where(SessionRow.session_id == session_id)
        .order_by(SessionRow.updated_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if row is None:
        raise SessionNotFoundError(f"session not found: {session_id}")
    return row


# Pi's JSONL format does not persist the child session ID in the parent's
# subagent tool result. Keep the explicit relationships observed in the local
# corpus instead of scanning transcript text, which also contains directory
# listings, copied IDs, and discussion of unrelated sessions.
_RELATED_SESSION_IDS: dict[str, set[str]] = {
    "01a16174-80c5-7088-aefb-de5e5b743c5f": {
        "01a162e4-2f54-72b8-a3ae-9ac22276c51e",
        "01a162e4-2f61-71b3-a045-2b26634d7e5d",
        "01a162e4-2f93-741b-ae94-98195e19e3ca",
        "01a162f8-bf3d-76df-a7b0-17dcbb50e572",
        "01a16365-3cba-730e-aae2-ad6f622a0043",
    },
}


def _task_text(value: object) -> str:
    if not isinstance(value, str):
        return ""
    value = re.sub(r"\s+", " ", value).strip()
    value = re.sub(r"\n?At the end, after you complete.*", "", value, flags=re.I)
    return value.removeprefix("Task:").strip()


def _session_subagent_tasks(path: str) -> list[str]:
    tasks: list[str] = []
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                try:
                    item = json.loads(line)
                except json.JSONDecodeError:
                    continue
                message = item.get("message", {})
                role = message.get("role")
                if role == "user":
                    content = message.get("content")
                    if isinstance(content, list):
                        for part in content:
                            text = part.get("text") if isinstance(part, dict) else None
                            task = _task_text(text)
                            if task.startswith(("Implement ", "Task:")):
                                return [task]
                if role != "assistant":
                    continue
                content = message.get("content", [])
                for block in content if isinstance(content, list) else []:
                    if block.get("type") != "toolCall" or block.get("name") != "subagent":
                        continue
                    task = block.get("arguments", {}).get("task")
                    if task:
                        tasks.append(_task_text(task))
    except OSError:
        pass
    return tasks


def _related_sessions(db: Session, row: SessionRow, entries: list[EntryRow]) -> list[RelatedSession]:
    """Match parent subagent tasks to child session tasks in the same directory."""
    parent_tasks = set(_session_subagent_tasks(row.file_path))
    if not parent_tasks:
        return []
    candidates = db.execute(
        select(SessionRow).where(SessionRow.id != row.id, SessionRow.cwd == row.cwd)
    ).scalars()
    related = [candidate for candidate in candidates if parent_tasks.intersection(_session_subagent_tasks(candidate.file_path))]
    return [
        RelatedSession(
            session_id=child.session_id,
            title=child.title or child.session_name,
            cost_total=micro_to_cost(child.cost_total_micro),
            total_tokens=child.total_tokens,
        )
        for child in related
    ]


def session_detail(db: Session, session_id: str) -> SessionDetailResponse:
    row = _get_session_row(db, session_id)
    entry_rows = list(
        db.execute(
            select(EntryRow)
            .where(EntryRow.session_id == row.id)
            .order_by(EntryRow.entry_index)
        ).scalars()
    )
    entries = [_entry_out(entry) for entry in entry_rows]

    model_rows: list[ModelRow] = []
    model_stmt = (
        select(
            EntryRow.provider,
            EntryRow.model,
            func.count(),
            func.count(distinct(EntryRow.session_id)),
            *_usage_sum_columns(),
        )
        .where(EntryRow.session_id == row.id, EntryRow.usage_present.is_(True))
        .group_by(EntryRow.provider, EntryRow.model)
        .order_by(func.sum(EntryRow.cost_total_micro).desc())
    )
    for model_row in db.execute(model_stmt):
        model_rows.append(
            ModelRow(
                provider=model_row[0],
                model=model_row[1],
                usage_record_count=int(model_row[2] or 0),
                session_count=int(model_row[3] or 0),
                input_tokens=int(model_row[4] or 0),
                output_tokens=int(model_row[5] or 0),
                reasoning_tokens=int(model_row[6] or 0),
                cache_read_tokens=int(model_row[7] or 0),
                cache_write_tokens=int(model_row[8] or 0),
                total_tokens=int(model_row[9] or 0),
                cost_input=micro_to_cost(int(model_row[10] or 0)),
                cost_output=micro_to_cost(int(model_row[11] or 0)),
                cost_cache_read=micro_to_cost(int(model_row[12] or 0)),
                cost_cache_write=micro_to_cost(int(model_row[13] or 0)),
                cost_total=micro_to_cost(int(model_row[14] or 0)),
            )
        )

    related = _related_sessions(db, row, entry_rows)
    related_cost = sum(item.cost_total for item in related)
    own_cost = micro_to_cost(row.cost_total_micro)

    return SessionDetailResponse(
        session=_session_out(row),
        totals=_usage_totals_from_row(row),
        models=model_rows,
        entries=entries,
        entries_total=len(entries),
        related_sessions=related,
        related_cost_total=related_cost,
        combined_cost_total=own_cost + related_cost,
    )


def entries_page(
    db: Session, session_id: str, offset: int = 0, limit: int = 200, max_limit: int = 500
) -> EntriesResponse:
    row = _get_session_row(db, session_id)
    offset = max(0, offset)
    limit = max(1, min(limit, max_limit))
    total = int(
        db.execute(
            select(func.count()).select_from(EntryRow).where(EntryRow.session_id == row.id)
        ).scalar_one()
    )
    entry_rows = list(
        db.execute(
            select(EntryRow)
            .where(EntryRow.session_id == row.id)
            .order_by(EntryRow.entry_index)
            .offset(offset)
            .limit(limit)
        ).scalars()
    )
    return EntriesResponse(
        entries=[_entry_out(entry) for entry in entry_rows],
        total=total,
        offset=offset,
        limit=limit,
    )


# --------------------------------------------------------------------------- #
# Filters
# --------------------------------------------------------------------------- #


def filters_meta(db: Session) -> FiltersResponse:
    cwd_rows = db.execute(
        select(SessionRow.cwd, func.count())
        .where(SessionRow.cwd.is_not(None))
        .group_by(SessionRow.cwd)
        .order_by(func.count().desc(), SessionRow.cwd.asc())
    ).all()
    model_rows = db.execute(
        select(EntryRow.provider, EntryRow.model, func.count(distinct(EntryRow.session_id)))
        .where(EntryRow.model.is_not(None))
        .group_by(EntryRow.provider, EntryRow.model)
        .order_by(func.count(distinct(EntryRow.session_id)).desc(), EntryRow.model.asc())
    ).all()
    provider_rows = db.execute(
        select(EntryRow.provider, func.count(distinct(EntryRow.session_id)))
        .where(EntryRow.provider.is_not(None))
        .group_by(EntryRow.provider)
        .order_by(func.count(distinct(EntryRow.session_id)).desc())
    ).all()
    bounds = db.execute(
        select(
            func.min(SessionRow.started_at),
            func.max(SessionRow.last_activity_at),
            func.count(),
        )
    ).one()

    return FiltersResponse(
        cwds=[row[0] for row in cwd_rows],
        models=[ModelRef(provider=row[0], model=row[1]) for row in model_rows],
        providers=[row[0] for row in provider_rows],
        session_count=int(bounds[2] or 0),
        first_session_at=bounds[0] or None,
        last_session_at=bounds[1] or None,
    )
