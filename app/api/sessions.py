"""Session list, detail, and paginated entries endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.deps import DbSession, SettingsDep
from app.schemas import EntriesResponse, SessionDetailResponse, SessionListResponse
from app.services import aggregation
from app.services.formatting import cost_to_micro
from app.services.ranges import parse_range

router = APIRouter(prefix="/sessions", tags=["sessions"])

SORT_VALUES = {"lastActivity", "last_activity", "started", "cost", "tokens", "title"}
DIRECTION_VALUES = {"asc", "desc"}


@router.get("", response_model=SessionListResponse)
def list_sessions(
    db: DbSession,
    settings: SettingsDep,
    range_: str = Query("30d", alias="range"),
    from_: str | None = Query(None, alias="from"),
    to_: str | None = Query(None, alias="to"),
    start: str | None = None,
    end: str | None = None,
    cwd: str | None = None,
    model: str | None = None,
    search: str | None = None,
    q: str | None = None,
    min_cost: str | None = Query(None, alias="minCost"),
    sort: str = "lastActivity",
    dir_: str = Query("desc", alias="dir"),
    page: int = Query(1, ge=1),
    page_size: int = Query(25, alias="pageSize", ge=1),
) -> SessionListResponse:
    spec = parse_range(range_, from_ or start, to_ or end)
    min_cost_micro = cost_to_micro(min_cost) if min_cost not in (None, "") else None
    return aggregation.list_sessions(
        db,
        spec,
        cwd=cwd or None,
        model=model or None,
        search=(search or q) or None,
        min_cost_micro=min_cost_micro,
        sort=sort if sort in SORT_VALUES else "lastActivity",
        direction=dir_ if dir_ in DIRECTION_VALUES else "desc",
        page=page,
        page_size=page_size,
        max_page_size=max(settings.entries_page_max, 100),
    )


@router.get("/{session_id}", response_model=SessionDetailResponse)
def get_session(db: DbSession, session_id: str) -> SessionDetailResponse:
    return aggregation.session_detail(db, session_id)


@router.get("/{session_id}/entries", response_model=EntriesResponse)
def get_session_entries(
    db: DbSession,
    settings: SettingsDep,
    session_id: str,
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1),
) -> EntriesResponse:
    return aggregation.entries_page(
        db,
        session_id,
        offset=offset,
        limit=limit,
        max_limit=settings.entries_page_max,
    )
