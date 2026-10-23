"""Application settings for Pi Meter.

Configuration is bound to environment variables prefixed with ``PI_METER_`` and
optionally to a ``.env`` file in the working directory. All paths are resolved
against the repository root (not the current working directory) so that
``uv run`` works from anywhere.
"""

from __future__ import annotations

import ipaddress
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPO_ROOT = Path(__file__).resolve().parents[1]

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "::1", "localhost"})

# Binding to these exposes the app to the tailnet. Only Tailscale addresses and
# loopback are allowed; arbitrary interfaces are rejected.
ANY_HOST = frozenset({"0.0.0.0", "::"})
TAILNET_NETWORK = ipaddress.ip_network("100.64.0.0/10")


def is_bindable_host(host: str) -> bool:
    if host in LOOPBACK_HOSTS or host in ANY_HOST:
        return True
    try:
        return ipaddress.ip_address(host) in TAILNET_NETWORK
    except ValueError:
        return False


def _resolve_path(value: Path | str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = REPO_ROOT / path
    return path.resolve()


class Settings(BaseSettings):
    """Runtime configuration. Instances are immutable in practice."""

    model_config = SettingsConfigDict(
        env_prefix="PI_METER_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Where Pi writes its session JSONL files.
    sessions_dir: Path = Path("~/.pi/agent/sessions")
    # SQLite index/cache. Disposable: delete it to rebuild from JSONL.
    db_path: Path = REPO_ROOT / "data" / "pi-meter.sqlite"
    # Built frontend assets (served by the API when present).
    frontend_dist: Path = REPO_ROOT / "frontend" / "dist"

    # Server binding. Loopback by default; set PI_METER_HOST=0.0.0.0 to also
    # serve the tailnet directly (Tailscale Serve is then unnecessary).
    host: str = "127.0.0.1"
    port: int = Field(default=8787, ge=1, le=65535)
    log_level: str = "INFO"

    # Sync behaviour.
    sync_on_startup: bool = True
    max_parse_warnings: int = Field(default=50, ge=0)
    entry_insert_batch: int = Field(default=1000, ge=1)
    sync_run_retention: int = Field(default=100, ge=1)

    # Paging.
    entries_page_size: int = Field(default=200, ge=1)
    entries_page_max: int = Field(default=500, ge=1)
    sessions_page_size: int = Field(default=25, ge=1)

    # Only set for Vite development; production/local use has no CORS at all.
    dev_cors_origin: str | None = None

    @field_validator("sessions_dir", "db_path", "frontend_dist", mode="after")
    @classmethod
    def _normalize_path(cls, value: Path) -> Path:
        return _resolve_path(value)

    @field_validator("host", mode="after")
    @classmethod
    def _bindable_host(cls, value: str) -> str:
        host = value.strip().lower()
        if not is_bindable_host(host):
            raise ValueError(
                "host must be loopback, a Tailscale address, or 0.0.0.0, "
                f"got {value!r}"
            )
        return host

    @field_validator("log_level", mode="after")
    @classmethod
    def _upper_log_level(cls, value: str) -> str:
        return value.strip().upper()

    @property
    def database_url(self) -> str:
        return f"sqlite+pysqlite:///{self.db_path}"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings instance (cached)."""
    return Settings()
