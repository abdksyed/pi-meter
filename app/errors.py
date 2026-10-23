"""Uniform application errors and FastAPI exception handlers.

Error responses always keep FastAPI's native ``{"detail": ...}`` shape and add a
stable machine-readable ``code`` so the frontend can branch on it:

    {"detail": "sync already in progress", "code": "sync_in_progress"}
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger("pi_meter")


class AppError(Exception):
    """Base class for expected, user-facing failures."""

    status_code: int = 500
    code: str = "internal_error"
    default_message: str = "internal error"

    def __init__(self, message: str | None = None) -> None:
        self.message = message or self.default_message
        super().__init__(self.message)


class SessionNotFoundError(AppError):
    status_code = 404
    code = "session_not_found"
    default_message = "session not found"


class SyncInProgressError(AppError):
    status_code = 409
    code = "sync_in_progress"
    default_message = "sync already in progress"


class SessionsDirMissingError(AppError):
    status_code = 409
    code = "sessions_dir_missing"
    default_message = "sessions directory not found"


class InvalidRangeError(AppError):
    status_code = 422
    code = "invalid_range"
    default_message = "invalid range"


class ForbiddenError(AppError):
    status_code = 403
    code = "forbidden"
    default_message = "forbidden"


def error_body(exc: AppError) -> dict[str, str]:
    return {"detail": exc.message, "code": exc.code}


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def _handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=error_body(exc))

    @app.exception_handler(Exception)
    async def _handle_unexpected(_request: Request, exc: Exception) -> JSONResponse:
        # Log the full detail; never leak paths or tracebacks to the client.
        logger.exception("unhandled error: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": "internal_error", "code": "internal_error"},
        )
