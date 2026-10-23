"""Health endpoint."""

from __future__ import annotations

from fastapi import APIRouter
from sqlalchemy import text

from app import __version__
from app.deps import DbSession, SettingsDep, SyncServiceDep
from app.schemas import HealthResponse

router = APIRouter(prefix="/health", tags=["health"])


@router.get("", response_model=HealthResponse)
def get_health(
    db: DbSession, settings: SettingsDep, sync_service: SyncServiceDep
) -> HealthResponse:
    database_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        database_ok = False

    return HealthResponse(
        status="ok" if database_ok else "degraded",
        version=__version__,
        database_ok=database_ok,
        sessions_dir=str(settings.sessions_dir),
        sessions_dir_exists=settings.sessions_dir.is_dir(),
        sync_in_progress=sync_service.is_running,
        last_sync=sync_service.last_sync(),
    )
