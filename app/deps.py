"""FastAPI dependencies shared by the routers.

The engine, session factory and sync service are created once in the app
lifespan and stored on ``app.state`` so that tests can inject their own.
"""

from __future__ import annotations

import ipaddress
from collections.abc import Iterator
from typing import Annotated, Any

from fastapi import Depends, Request
from sqlalchemy import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import LOOPBACK_HOSTS, Settings, get_settings
from app.errors import ForbiddenError

# TestClient/httpx report this as the client host.
_TEST_CLIENT_HOST = "testclient"

# Tailscale hands out addresses from the CGNAT range. Tailscale Serve proxies to
# the loopback bind but forwards the real client address, so tailnet peers must
# be accepted as local.
_TAILNET_NETWORK = ipaddress.ip_network("100.64.0.0/10")


def _is_local_host(host: str) -> bool:
    if host in LOOPBACK_HOSTS or host == _TEST_CLIENT_HOST:
        return True
    try:
        return ipaddress.ip_address(host) in _TAILNET_NETWORK
    except ValueError:
        return False


def get_engine(request: Request) -> Engine:
    engine = getattr(request.app.state, "engine", None)
    if engine is None:  # pragma: no cover - startup always sets this
        raise RuntimeError("database engine is not initialised")
    return engine


def get_session_factory(request: Request) -> sessionmaker[Session]:
    factory = getattr(request.app.state, "session_factory", None)
    if factory is None:  # pragma: no cover - startup always sets this
        raise RuntimeError("session factory is not initialised")
    return factory


def get_db(
    factory: Annotated[sessionmaker[Session], Depends(get_session_factory)],
) -> Iterator[Session]:
    """Read-only request session. Endpoints never commit."""
    db = factory()
    try:
        yield db
    finally:
        db.close()


def get_sync_service(request: Request) -> Any:
    service = getattr(request.app.state, "sync_service", None)
    if service is None:  # pragma: no cover - startup always sets this
        raise RuntimeError("sync service is not initialised")
    return service


def require_loopback(request: Request) -> None:
    """Defense in depth: refuse non-local clients even if the bind changes."""
    client = request.client
    if client is None:  # unix socket or ASGI transport without a client
        return
    if _is_local_host(client.host):
        return
    raise ForbiddenError("local access only")


SettingsDep = Annotated[Settings, Depends(get_settings)]
DbSession = Annotated[Session, Depends(get_db)]
SyncServiceDep = Annotated[Any, Depends(get_sync_service)]
