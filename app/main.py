"""FastAPI application factory and process entry point.

Startup order:

1. Create the SQLite engine and initialise the schema (``init_db``).
2. Build the sync service around the same session factory.
3. On lifespan startup, run one incremental sync when ``sync_on_startup`` is set.
4. Serve ``/api`` plus the built frontend (SPA fallback) on the loopback host.
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app import __version__
from app.api import api_router
from app.config import Settings, get_settings
from app.db import create_db_engine, create_session_factory, init_db
from app.errors import register_exception_handlers
from app.services.sync import SyncService
from app.static import mount_frontend

logger = logging.getLogger("pi_meter")


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(
        level=getattr(logging, settings.log_level, logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    engine = create_db_engine(settings)
    init_db(engine)
    session_factory = create_session_factory(engine)
    sync_service = SyncService(settings, session_factory)

    @asynccontextmanager
    async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
        if settings.sync_on_startup:
            try:
                stats = await asyncio.to_thread(sync_service.run)
                logger.info(
                    "startup sync: %s files=%d added=%d updated=%d removed=%d failed=%d",
                    stats.status,
                    stats.files_seen,
                    stats.files_added,
                    stats.files_updated,
                    stats.files_removed,
                    stats.files_failed,
                )
            except Exception:
                logger.exception("startup sync failed")
        yield
        engine.dispose()

    app = FastAPI(
        title="Pi Meter",
        version=__version__,
        description="Local usage dashboard for Pi coding-agent sessions",
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.sync_service = sync_service

    register_exception_handlers(app)

    if settings.dev_cors_origin:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=[settings.dev_cors_origin],
            allow_methods=["GET", "POST"],
            allow_headers=["*"],
        )

    app.include_router(api_router)
    mount_frontend(app, settings.frontend_dist)
    return app


app = create_app()
