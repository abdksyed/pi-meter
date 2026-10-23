"""Filter metadata endpoint."""

from __future__ import annotations

from fastapi import APIRouter

from app.deps import DbSession
from app.schemas import FiltersResponse
from app.services import aggregation

router = APIRouter(prefix="/filters", tags=["filters"])


@router.get("", response_model=FiltersResponse)
def get_filters(db: DbSession) -> FiltersResponse:
    return aggregation.filters_meta(db)
