"""SQLAlchemy ORM models for the Pi Meter index.

Three tables:

* ``sessions``  — one row per discovered JSONL file (unique ``session_id`` and
  unique ``file_path``). ``file_path`` is the sync/deletion identity;
  ``session_id`` is the public API identity.
* ``entries``   — one row per parsed JSONL entry, ordered by ``entry_index``.
  ``entries.session_id`` is an INTEGER foreign key to ``sessions.id`` (smaller,
  faster index than the string id) with ``ON DELETE CASCADE``.
* ``sync_runs`` — one row per refresh, used for diagnostics/health.

Storage conventions (see ``app/db.py``): timestamps are UTC epoch
milliseconds, costs are integer micro-units, tokens are integers.
"""

from __future__ import annotations

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base, now_ms

PARSE_STATUSES = ("ok", "partial", "error")
SYNC_STATUSES = ("running", "ok", "partial", "error")


class SessionRow(Base):
    __tablename__ = "sessions"
    __table_args__ = (
        UniqueConstraint("session_id", name="ux_sessions_session_id"),
        UniqueConstraint("file_path", name="ux_sessions_file_path"),
        CheckConstraint(
            "parse_status IN ('ok', 'partial', 'error')", name="ck_sessions_parse_status"
        ),
        Index("ix_sessions_started_at", "started_at"),
        Index("ix_sessions_last_activity_at", "last_activity_at"),
        Index("ix_sessions_first_usage_at", "first_usage_at"),
        Index("ix_sessions_last_usage_at", "last_usage_at"),
        Index("ix_sessions_cwd", "cwd"),
        Index("ix_sessions_session_name", "session_name"),
        Index("ix_sessions_cost_total_micro", "cost_total_micro"),
        Index("ix_sessions_cwd_last_activity_at", "cwd", "last_activity_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)

    # Identity
    session_id: Mapped[str] = mapped_column(Text, nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str] = mapped_column(Text, nullable=False)
    cwd: Mapped[str | None] = mapped_column(Text)
    parent_session_path: Mapped[str | None] = mapped_column(Text)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # File signature for change detection
    file_size: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    file_mtime_ns: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # Timeline (UTC epoch ms)
    started_at: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    last_activity_at: Mapped[int | None] = mapped_column(BigInteger)
    first_usage_at: Mapped[int | None] = mapped_column(BigInteger)
    last_usage_at: Mapped[int | None] = mapped_column(BigInteger)

    # Display metadata
    session_name: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str | None] = mapped_column(Text)
    first_user_message: Mapped[str | None] = mapped_column(Text)
    models_json: Mapped[str | None] = mapped_column(Text)

    # Counts
    entry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    user_message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    assistant_message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tool_result_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    tool_call_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    model_change_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    compaction_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    context_edit_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    usage_record_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Token totals
    input_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    reasoning_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # Cost totals (integer micro-units)
    cost_input_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_output_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_cache_read_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_cache_write_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_total_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    # Parse diagnostics
    parse_status: Mapped[str] = mapped_column(Text, nullable=False, default="ok")
    parse_error: Mapped[str | None] = mapped_column(Text)
    parse_error_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    parse_warnings_json: Mapped[str | None] = mapped_column(Text)

    # Sync bookkeeping (UTC epoch ms)
    created_at: Mapped[int] = mapped_column(BigInteger, nullable=False, default=now_ms)
    updated_at: Mapped[int] = mapped_column(BigInteger, nullable=False, default=now_ms)

    entries: Mapped[list["EntryRow"]] = relationship(
        back_populates="session",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class EntryRow(Base):
    __tablename__ = "entries"
    __table_args__ = (
        UniqueConstraint("session_id", "entry_index", name="ux_entries_session_entry_index"),
        Index("ix_entries_session_timestamp", "session_id", "timestamp_ms"),
        Index("ix_entries_timestamp_ms", "timestamp_ms"),
        Index("ix_entries_entry_type", "entry_type"),
        Index("ix_entries_role", "role"),
        Index("ix_entries_model", "model"),
        Index("ix_entries_provider", "provider"),
        Index(
            "ix_entries_usage_timestamp",
            "timestamp_ms",
            sqlite_where=text("usage_present = 1"),
        ),
        Index(
            "ix_entries_usage_model",
            "model",
            sqlite_where=text("usage_present = 1"),
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int] = mapped_column(
        ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False
    )

    # Source position / tree links
    entry_id: Mapped[str | None] = mapped_column(Text)
    parent_id: Mapped[str | None] = mapped_column(Text)
    entry_index: Mapped[int] = mapped_column(Integer, nullable=False)
    line_no: Mapped[int | None] = mapped_column(Integer)
    entry_type: Mapped[str] = mapped_column(Text, nullable=False)

    # Normalized convenience columns
    timestamp_ms: Mapped[int | None] = mapped_column(BigInteger)
    role: Mapped[str | None] = mapped_column(Text)
    provider: Mapped[str | None] = mapped_column(Text)
    model: Mapped[str | None] = mapped_column(Text)
    thinking_level: Mapped[str | None] = mapped_column(Text)
    kind: Mapped[str | None] = mapped_column(Text)
    tool_name: Mapped[str | None] = mapped_column(Text)
    tool_call_id: Mapped[str | None] = mapped_column(Text)
    is_error: Mapped[bool | None] = mapped_column(Boolean)
    duration_ms: Mapped[int | None] = mapped_column(Integer)

    # Raw payload retention (compact JSON text)
    content_json: Mapped[str | None] = mapped_column(Text)
    metadata_json: Mapped[str | None] = mapped_column(Text)
    text_content: Mapped[str | None] = mapped_column(Text)

    # Usage contribution of this entry (exactly one record per entry, at most)
    usage_present: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    usage_source: Mapped[str | None] = mapped_column(Text)
    input_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    output_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    reasoning_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cache_read_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cache_write_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    total_tokens: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_input_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_output_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_cache_read_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_cache_write_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)
    cost_total_micro: Mapped[int] = mapped_column(BigInteger, nullable=False, default=0)

    session: Mapped[SessionRow] = relationship(back_populates="entries")


class SyncRun(Base):
    __tablename__ = "sync_runs"
    __table_args__ = (
        CheckConstraint(
            "status IN ('running', 'ok', 'partial', 'error')", name="ck_sync_runs_status"
        ),
        Index("ix_sync_runs_started_at", "started_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[int] = mapped_column(BigInteger, nullable=False, default=now_ms)
    finished_at: Mapped[int | None] = mapped_column(BigInteger)
    duration_ms: Mapped[int | None] = mapped_column(BigInteger)
    files_seen: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_added: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_removed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    files_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="running")
    error_message: Mapped[str | None] = mapped_column(Text)
