"""SQLite engine, session factory and schema bootstrap.

Design contract shared by every backend module:

* All timestamps are stored as UTC epoch **milliseconds** (``INTEGER``).
* All monetary values are stored as integer **micro-units** (millionths of the
  displayed currency unit, ``INTEGER``).
* SQLite is a disposable index/cache. The Pi JSONL files remain the source of
  truth, so schema changes are handled by deleting ``data/pi-meter.sqlite`` and
  re-syncing rather than by migrations.
"""

from __future__ import annotations

import time
from pathlib import Path

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import Settings

SCHEMA_VERSION = 1

MICRO_PER_UNIT = 1_000_000


def now_ms() -> int:
    """Current UTC time as epoch milliseconds."""
    return int(time.time() * 1000)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def _apply_sqlite_pragmas(dbapi_connection, _connection_record) -> None:
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode = WAL")
        cursor.execute("PRAGMA foreign_keys = ON")
        cursor.execute("PRAGMA synchronous = NORMAL")
        cursor.execute("PRAGMA busy_timeout = 5000")
    finally:
        cursor.close()


def create_db_engine(settings: Settings) -> Engine:
    """Build the engine and make sure the database directory exists."""
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        settings.database_url,
        connect_args={"check_same_thread": False, "timeout": 30},
        pool_pre_ping=True,
    )
    event.listen(engine, "connect", _apply_sqlite_pragmas)
    return engine


def create_session_factory(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db(engine: Engine) -> None:
    """Create missing tables/indexes and stamp the schema version."""
    from app.models import Base as ModelBase  # local import avoids an import cycle

    with engine.begin() as conn:
        version = conn.exec_driver_sql("PRAGMA user_version").scalar_one()
        if version > SCHEMA_VERSION:
            raise RuntimeError(
                f"database schema version {version} is newer than this app "
                f"({SCHEMA_VERSION}); delete the database file and re-sync"
            )
        ModelBase.metadata.create_all(conn)
        conn.exec_driver_sql(f"PRAGMA user_version = {SCHEMA_VERSION}")


def reset_db(engine: Engine) -> None:
    """Dispose the engine and delete the SQLite file (and WAL sidecars)."""
    database = engine.url.database
    engine.dispose()
    if not database:
        return
    for suffix in ("", "-wal", "-shm"):
        Path(f"{database}{suffix}").unlink(missing_ok=True)
