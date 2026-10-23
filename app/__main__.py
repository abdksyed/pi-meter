"""``python -m app`` entry point.

Binds to the loopback host from configuration (validated to be loopback in
``app.config``) and serves the FastAPI app defined in ``app.main``.
"""

from __future__ import annotations

import uvicorn

from app.config import get_settings


def main() -> None:
    settings = get_settings()
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level.lower(),
        reload=False,
    )


if __name__ == "__main__":
    main()
