"""Usage breakdown endpoints: time series, per-model, per-project."""

from __future__ import annotations

from fastapi import APIRouter, Query

from app.deps import DbSession
from app.schemas import ModelBreakdownResponse, ProjectBreakdownResponse, TimeseriesResponse
from app.services import aggregation
from app.services.ranges import parse_range

router = APIRouter(prefix="/usage", tags=["usage"])


def _range(
    range_: str,
    from_: str | None,
    to_: str | None,
    start: str | None,
    end: str | None,
    group_by: str | None = None,
):
    return parse_range(range_, from_ or start, to_ or end, group_by)


@router.get("/timeseries", response_model=TimeseriesResponse)
def get_timeseries(
    db: DbSession,
    range_: str = Query("7d", alias="range"),
    from_: str | None = Query(None, alias="from"),
    to_: str | None = Query(None, alias="to"),
    start: str | None = None,
    end: str | None = None,
    group_by: str | None = Query(None, alias="groupBy"),
    cwd: str | None = None,
    model: str | None = None,
) -> TimeseriesResponse:
    spec = _range(range_, from_, to_, start, end, group_by)
    return aggregation.timeseries(
        db, spec, spec.group_by, cwd=cwd or None, model=model or None
    )


@router.get("/by-model", response_model=ModelBreakdownResponse)
def get_by_model(
    db: DbSession,
    range_: str = Query("7d", alias="range"),
    from_: str | None = Query(None, alias="from"),
    to_: str | None = Query(None, alias="to"),
    start: str | None = None,
    end: str | None = None,
    cwd: str | None = None,
    model: str | None = None,
) -> ModelBreakdownResponse:
    spec = _range(range_, from_, to_, start, end)
    return aggregation.by_model(db, spec, cwd=cwd or None, model=model or None)


@router.get("/by-project", response_model=ProjectBreakdownResponse)
def get_by_project(
    db: DbSession,
    range_: str = Query("7d", alias="range"),
    from_: str | None = Query(None, alias="from"),
    to_: str | None = Query(None, alias="to"),
    start: str | None = None,
    end: str | None = None,
    cwd: str | None = None,
    model: str | None = None,
) -> ProjectBreakdownResponse:
    spec = _range(range_, from_, to_, start, end)
    return aggregation.by_project(db, spec, model=model or None)
