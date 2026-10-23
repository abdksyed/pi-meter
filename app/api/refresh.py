"""Manual refresh endpoint."""

from __future__ import annotations

import asyncio

from fastapi import APIRouter

from app.deps import SyncServiceDep
from app.schemas import SyncStats

router = APIRouter(prefix="/refresh", tags=["refresh"])


@router.post("", response_model=SyncStats)
async def refresh(sync_service: SyncServiceDep) -> SyncStats:
    """Run an incremental sync in a worker thread.

    The sync service uses a non-blocking lock, so a concurrent refresh raises
    ``sync_in_progress`` (HTTP 409) instead of queueing or blocking.
    """
    return await asyncio.to_thread(sync_service.run)
