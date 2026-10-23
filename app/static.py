"""Static frontend serving.

When ``frontend/dist`` has been built, the SPA is served from it: hashed assets
are mounted directly and every other non-``/api`` path falls back to
``index.html`` so client-side routes work. When the build is missing, ``/``
returns a short HTML notice instead of failing at import time.
"""

from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

logger = logging.getLogger("pi_meter.static")

_MISSING_NOTICE = """<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Pi Meter</title></head>
<body style="font-family: system-ui, sans-serif; margin: 3rem; max-width: 40rem;">
  <h1>Pi Meter API is running</h1>
  <p>The frontend build was not found. Build it and reload this page:</p>
  <pre>scripts/build-frontend.sh</pre>
  <p>For development, run Vite in <code>frontend/</code> and proxy <code>/api</code>
  to this server.</p>
  <p>API: <a href="/api/health">/api/health</a> ·
  <a href="/docs">/docs</a></p>
</body>
</html>
"""


def mount_frontend(app: FastAPI, dist: Path) -> bool:
    """Serve the built SPA if present. Returns whether the build was found."""
    index = dist / "index.html"
    if not index.is_file():
        logger.warning("frontend build not found at %s; serving API only", dist)

        @app.get("/", include_in_schema=False)
        def _missing_frontend() -> HTMLResponse:
            return HTMLResponse(_MISSING_NOTICE)

        return False

    root = dist.resolve()
    for name in ("assets", "fonts"):
        directory = dist / name
        if directory.is_dir():
            app.mount(f"/{name}", StaticFiles(directory=directory), name=name)

    @app.get("/{full_path:path}", include_in_schema=False)
    def _spa(full_path: str) -> FileResponse:
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="not found")
        if full_path:
            candidate = (dist / full_path).resolve()
            if root in candidate.parents and candidate.is_file():
                return FileResponse(candidate)
        return FileResponse(index)

    return True
