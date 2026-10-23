"""API router assembly.

Every endpoint lives under ``/api`` and is restricted to loopback clients as a
defense-in-depth measure on top of the loopback-only bind.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api import filters, health, refresh, sessions, summary, usage
from app.deps import require_loopback

api_router = APIRouter(prefix="/api", dependencies=[Depends(require_loopback)])
api_router.include_router(health.router)
api_router.include_router(refresh.router)
api_router.include_router(summary.router)
api_router.include_router(usage.router)
api_router.include_router(sessions.router)
api_router.include_router(filters.router)

__all__ = ["api_router"]
