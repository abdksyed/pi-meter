"""Dashboard summary endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.deps import DbSession
from app.schemas import SummaryResponse
from app.services import aggregation
from app.services.ranges import parse_range

router = APIRouter(prefix="/summary", tags=["summary"])


@router.get("", response_model=SummaryResponse)
def get_summary(
    db: DbSession,
    range_: str = Query("7d", alias="range"),
    from_: str | None = Query(None, alias="from"),
    to_: str | None = Query(None, alias="to"),
    start: str | None = None,
    end: str | None = None,
    cwd: str | None = None,
    model: str | None = None,
) -> SummaryResponse:
    spec = parse_range(range_, from_ or start, to_ or end)
    return aggregation.summary(db, spec, cwd=cwd or None, model=model or None)
