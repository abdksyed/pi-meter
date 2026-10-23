"""Incremental JSONL -> SQLite sync.

The Pi JSONL files are authoritative; SQLite is a disposable index. A sync
discovers ``*.jsonl`` files under the configured sessions directory, reparses
only files whose size or ``mtime_ns`` changed, replaces the entries of changed
sessions, and removes sessions whose files disappeared. One transaction per
file keeps a single malformed file from poisoning the rest of the batch.

Malformed JSONL is handled by the parser itself (per-line issues, skipped
lines). A file with an unusable header is counted as failed and its previous
index row is left untouched. A file that parses partially is indexed with
``parse_status="partial"`` so the UI can surface warnings.
"""

from __future__ import annotations

import json
import logging
import threading
from dataclasses import asdict
from pathlib import Path
from types import SimpleNamespace
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session, sessionmaker

from app.config import Settings
from app.db import now_ms
from app.errors import SyncInProgressError
from app.models import EntryRow, SessionRow, SyncRun
from app.schemas import SyncStats
from app.services.parser import parse_session_file
from app.services.parser_content import extract_text
from app.services.parser_models import ParsedEntry, ParsedSession, UsageRecord

logger = logging.getLogger("pi_meter.sync")


# --------------------------------------------------------------------------- #
# Parser DTO -> storage payloads
# --------------------------------------------------------------------------- #


def _block_payload(block: Any) -> dict[str, Any]:
    kind = getattr(block, "type", "unknown")
    if kind == "text":
        return {"type": "text", "text": block.text or ""}
    if kind == "thinking":
        payload: dict[str, Any] = {"type": "thinking", "thinking": block.thinking or ""}
        if block.redacted:
            payload["redacted"] = True
        return payload
    if kind == "toolCall" and block.tool_call is not None:
        call = block.tool_call
        payload = {
            "type": "toolCall",
            "id": call.id,
            "name": call.name,
            "arguments": call.arguments,
        }
        if call.arguments_error:
            payload["argumentsError"] = call.arguments_error
        return payload
    if kind == "image" and block.image is not None:
        return {
            "type": "image",
            "mimeType": block.image.mime_type,
            "data": block.image.data,
        }
    return block.raw if isinstance(block.raw, dict) and block.raw else {"type": kind}


def _blocks_payload(blocks: list[Any] | None) -> list[dict[str, Any]] | None:
    if not blocks:
        return None
    return [_block_payload(block) for block in blocks]


def _content_payload(entry: ParsedEntry) -> Any:
    if entry.message is not None:
        return _blocks_payload(entry.message.content)
    if entry.custom_message is not None:
        return _blocks_payload(entry.custom_message.content)
    if entry.context_edit is not None and entry.context_edit.replacement_content:
        return _blocks_payload(entry.context_edit.replacement_content)
    if entry.compaction is not None:
        return [{"type": "text", "text": entry.compaction.summary}]
    if entry.branch_summary is not None:
        return [{"type": "text", "text": entry.branch_summary.summary}]
    return None


def _entry_metadata(entry: ParsedEntry) -> dict[str, Any]:
    meta: dict[str, Any] = {"isError": bool(entry.is_error)}
    message = entry.message
    if message is not None:
        meta["message"] = {
            "role": message.role,
            "provider": message.provider,
            "model": message.model,
            "stopReason": message.stop_reason,
            "errorMessage": message.error_message,
            "durationMs": message.duration_ms,
            "thinkingLevel": message.thinking_level,
            "api": message.api,
            "responseModel": message.response_model,
            "responseId": message.response_id,
            "customType": message.custom_type,
            "display": message.display,
            "fromId": message.from_id,
            "tokensBefore": message.tokens_before,
            "timestampMs": message.timestamp_ms,
        }
        if message.error_message:
            meta["errorMessage"] = message.error_message
        if message.stop_reason:
            meta["stopReason"] = message.stop_reason
        if message.summary:
            meta["summary"] = message.summary
        if message.system is not None:
            meta["sections"] = message.system.sections
            meta["toolsAdded"] = message.system.tools_added_names
            meta["toolsRemoved"] = message.system.tools_removed_names
        if message.bash is not None:
            meta["bash"] = {
                "command": message.bash.command,
                "exitCode": message.bash.exit_code,
                "cancelled": message.bash.cancelled,
                "truncated": message.bash.truncated,
            }
        if message.details is not None:
            meta["details"] = message.details

    if entry.model_change is not None:
        change = entry.model_change
        meta["modelChange"] = {
            "provider": change.provider,
            "model": change.model_id,
            "previousProvider": change.previous_provider,
            "previousModel": change.previous_model_id,
        }
    if entry.thinking_level_change is not None:
        change = entry.thinking_level_change
        meta["thinkingLevelChange"] = {
            "thinkingLevel": change.thinking_level,
            "previousThinkingLevel": change.previous_thinking_level,
        }
    if entry.usage_entry is not None:
        meta["usageEntry"] = {
            "kind": entry.usage_entry.kind,
            "provider": entry.usage_entry.provider,
            "model": entry.usage_entry.model,
            "note": entry.usage_entry.note,
        }
    if entry.compaction is not None:
        compaction = entry.compaction
        meta["summary"] = compaction.summary
        meta["tokensBefore"] = compaction.tokens_before
        meta["readFiles"] = compaction.read_files
        meta["modifiedFiles"] = compaction.modified_files
        meta["compaction"] = {
            "summary": compaction.summary,
            "firstKeptEntryId": compaction.first_kept_entry_id,
            "firstKeptEntryIndex": compaction.first_kept_entry_index,
            "tokensBefore": compaction.tokens_before,
            "readFiles": compaction.read_files,
            "modifiedFiles": compaction.modified_files,
            "fromHook": compaction.from_hook,
            "details": compaction.details,
        }
    if entry.branch_summary is not None:
        summary = entry.branch_summary
        meta["summary"] = summary.summary
        meta["readFiles"] = summary.read_files
        meta["modifiedFiles"] = summary.modified_files
        meta["branchSummary"] = {
            "fromId": summary.from_id,
            "fromEntryIndex": summary.from_entry_index,
            "summary": summary.summary,
            "readFiles": summary.read_files,
            "modifiedFiles": summary.modified_files,
            "details": summary.details,
        }
    if entry.context_edit is not None:
        edit = entry.context_edit
        replacement = (
            extract_text(edit.replacement_content) if edit.replacement_content else None
        )
        meta["targetId"] = edit.target_id
        meta["replacement"] = replacement
        meta["contextEdit"] = {
            "targetId": edit.target_id,
            "targetEntryIndex": edit.target_entry_index,
            "targetRole": edit.target_role,
            "omitted": edit.omitted,
            "replacement": replacement,
        }
    if entry.custom is not None:
        meta["customType"] = entry.custom.custom_type
        meta["custom"] = {"customType": entry.custom.custom_type, "data": entry.custom.data}
    if entry.custom_message is not None:
        custom = entry.custom_message
        meta["customType"] = custom.custom_type
        meta["customMessage"] = {
            "customType": custom.custom_type,
            "display": custom.display,
            "details": custom.details,
        }
    if entry.label is not None:
        label = entry.label
        meta["label"] = label.label
        meta["targetId"] = label.target_id
        meta["labelData"] = {
            "targetId": label.target_id,
            "targetEntryIndex": label.target_entry_index,
            "label": label.label,
            "cleared": label.cleared,
        }
    if entry.session_info is not None:
        info = entry.session_info
        meta["sessionName"] = info.name
        meta["sessionInfo"] = {"name": info.name, "cleared": info.cleared}
    if entry.unknown is not None:
        meta["rawType"] = entry.unknown.raw_type
        meta["raw"] = entry.raw
    if entry.content_summary is not None:
        summary = asdict(entry.content_summary)
        summary.pop("preview", None)
        meta["contentSummary"] = summary
    return meta


def _entry_usage(entry: ParsedEntry) -> tuple[UsageRecord | None, dict[str, int]]:
    """Sum the entry's usage records once each (deduplicated by content)."""
    seen: set[str] = set()
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "total_tokens": 0,
        "cost_input_micro": 0,
        "cost_output_micro": 0,
        "cost_cache_read_micro": 0,
        "cost_cache_write_micro": 0,
        "cost_total_micro": 0,
    }
    first: UsageRecord | None = None
    for record in entry.usage_records:
        key = json.dumps(record.raw, sort_keys=True, ensure_ascii=False, default=str)
        if key in seen:
            continue
        seen.add(key)
        if first is None:
            first = record
        tokens = record.tokens
        cost = record.cost
        totals["input_tokens"] += tokens.input
        totals["output_tokens"] += tokens.output
        totals["reasoning_tokens"] += tokens.reasoning
        totals["cache_read_tokens"] += tokens.cache_read
        totals["cache_write_tokens"] += tokens.cache_write
        totals["total_tokens"] += tokens.total or (
            tokens.input + tokens.output + tokens.cache_read + tokens.cache_write
        )
        totals["cost_input_micro"] += cost.input_micro
        totals["cost_output_micro"] += cost.output_micro
        totals["cost_cache_read_micro"] += cost.cache_read_micro
        totals["cost_cache_write_micro"] += cost.cache_write_micro
        totals["cost_total_micro"] += cost.total_micro
    return first, totals


def _json_or_none(value: Any) -> str | None:
    if value is None:
        return None
    return json.dumps(value, ensure_ascii=False, default=str)


def _entry_row(session_pk: int, entry: ParsedEntry) -> EntryRow:
    usage, totals = _entry_usage(entry)
    row = EntryRow(
        session_id=session_pk,
        entry_id=entry.entry_id,
        parent_id=entry.parent_id,
        entry_index=entry.entry_index,
        line_no=entry.line_number,
        entry_type=entry.entry_type,
        timestamp_ms=entry.timestamp_ms,
        role=entry.role,
        provider=entry.provider,
        model=entry.model,
        thinking_level=entry.thinking_level,
        kind=usage.kind if usage is not None else None,
        tool_name=entry.tool_name,
        tool_call_id=entry.tool_call_id,
        is_error=bool(entry.is_error),
        duration_ms=entry.duration_ms,
        content_json=_json_or_none(_content_payload(entry)),
        metadata_json=_json_or_none(_entry_metadata(entry)),
        text_content=entry.search_text or None,
        usage_present=usage is not None,
        usage_source=usage.source if usage is not None else None,
        **totals,
    )
    return row


def _warnings_payload(session: ParsedSession, limit: int) -> str | None:
    issues = session.issues[:limit] if limit else []
    if not issues:
        return None
    return json.dumps(
        [
            {
                "line": issue.line_number or None,
                "kind": issue.code,
                "message": issue.message,
                "preview": issue.raw_excerpt,
            }
            for issue in issues
        ],
        ensure_ascii=False,
    )


def _apply_session(
    row: SessionRow, parsed: ParsedSession, path: Path, size: int, mtime_ns: int, limit: int
) -> None:
    usage_timestamps = [
        record.timestamp_ms
        for record in parsed.usage_records
        if record.timestamp_ms is not None
    ]
    counts = parsed.counts
    totals = parsed.totals
    row.session_id = parsed.session_id or row.session_id
    row.file_path = str(path)
    row.file_name = path.name
    row.cwd = parsed.cwd or None
    row.parent_session_path = parsed.parent_session_path
    row.version = parsed.version
    row.file_size = size
    row.file_mtime_ns = mtime_ns
    row.started_at = parsed.started_at_ms or 0
    row.last_activity_at = parsed.last_activity_at_ms
    row.first_usage_at = min(usage_timestamps) if usage_timestamps else None
    row.last_usage_at = max(usage_timestamps) if usage_timestamps else None
    row.session_name = parsed.name
    row.title = parsed.title
    row.first_user_message = parsed.first_user_message
    row.models_json = _json_or_none(
        [{"provider": ref.provider, "model": ref.model} for ref in parsed.models_seen]
    )
    row.entry_count = counts.entry_count
    row.message_count = counts.message_count
    row.user_message_count = counts.user_message_count
    row.assistant_message_count = counts.assistant_message_count
    row.tool_result_count = counts.tool_result_count
    row.tool_call_count = counts.tool_call_count
    row.model_change_count = counts.model_change_count
    row.compaction_count = counts.compaction_count
    row.context_edit_count = counts.context_edit_count
    row.usage_record_count = counts.usage_entry_count or len(parsed.usage_records)
    row.input_tokens = totals.input_tokens
    row.output_tokens = totals.output_tokens
    row.reasoning_tokens = totals.reasoning_tokens
    row.cache_read_tokens = totals.cache_read_tokens
    row.cache_write_tokens = totals.cache_write_tokens
    row.total_tokens = totals.total_tokens
    row.cost_input_micro = totals.cost_input_micro
    row.cost_output_micro = totals.cost_output_micro
    row.cost_cache_read_micro = totals.cost_cache_read_micro
    row.cost_cache_write_micro = totals.cost_cache_write_micro
    row.cost_total_micro = totals.cost_total_micro
    row.parse_status = parsed.parse_status
    row.parse_error = parsed.parse_error
    row.parse_error_count = sum(1 for issue in parsed.issues if issue.severity == "error")
    row.parse_warnings_json = _warnings_payload(parsed, limit)
    row.updated_at = now_ms()


# --------------------------------------------------------------------------- #
# Service
# --------------------------------------------------------------------------- #


class SyncService:
    """Process-wide incremental sync with a non-blocking lock."""

    def __init__(self, settings: Settings, session_factory: sessionmaker[Session]) -> None:
        self._settings = settings
        self._session_factory = session_factory
        self._lock = threading.Lock()

    @property
    def is_running(self) -> bool:
        return self._lock.locked()

    # -- bookkeeping ------------------------------------------------------- #

    def _start_run(self, started_at: int) -> int | None:
        try:
            with self._session_factory() as db:
                run = SyncRun(started_at=started_at, status="running")
                db.add(run)
                db.commit()
                return run.id
        except Exception:  # pragma: no cover - diagnostics only
            logger.exception("could not record sync run start")
            return None

    def _finish_run(
        self,
        run_id: int | None,
        started_at: int,
        *,
        files_seen: int,
        added: int,
        updated: int,
        removed: int,
        failed: int,
        status: str,
        error: str | None,
    ) -> SyncStats:
        finished_at = now_ms()
        duration = max(0, finished_at - started_at)
        if run_id is not None:
            try:
                with self._session_factory() as db:
                    run = db.get(SyncRun, run_id)
                    if run is not None:
                        run.finished_at = finished_at
                        run.duration_ms = duration
                        run.files_seen = files_seen
                        run.files_added = added
                        run.files_updated = updated
                        run.files_removed = removed
                        run.files_failed = failed
                        run.status = status
                        run.error_message = error
                        db.commit()
                    self._prune_runs(db)
            except Exception:  # pragma: no cover - diagnostics only
                logger.exception("could not record sync run finish")
        return SyncStats(
            files_seen=files_seen,
            files_added=added,
            files_updated=updated,
            files_removed=removed,
            files_failed=failed,
            duration_ms=duration,
            status=status,
            error_message=error,
            started_at=started_at,
            finished_at=finished_at,
        )

    def _prune_runs(self, db: Session) -> None:
        keep = self._settings.sync_run_retention
        keep_ids = select(SyncRun.id).order_by(SyncRun.id.desc()).limit(keep)
        db.execute(delete(SyncRun).where(SyncRun.id.not_in(keep_ids)))
        db.commit()

    def last_sync(self) -> SyncStats | None:
        try:
            with self._session_factory() as db:
                run = db.execute(
                    select(SyncRun).order_by(SyncRun.id.desc()).limit(1)
                ).scalar_one_or_none()
                if run is None:
                    return None
                return SyncStats(
                    files_seen=run.files_seen,
                    files_added=run.files_added,
                    files_updated=run.files_updated,
                    files_removed=run.files_removed,
                    files_failed=run.files_failed,
                    duration_ms=run.duration_ms or 0,
                    status=run.status,
                    error_message=run.error_message,
                    started_at=run.started_at,
                    finished_at=run.finished_at,
                )
        except Exception:  # pragma: no cover - diagnostics only
            logger.exception("could not read last sync run")
            return None

    # -- sync -------------------------------------------------------------- #

    def run(self) -> SyncStats:
        if not self._lock.acquire(blocking=False):
            raise SyncInProgressError()
        started_at = now_ms()
        try:
            return self._run_locked(started_at)
        finally:
            self._lock.release()

    def _run_locked(self, started_at: int) -> SyncStats:
        run_id = self._start_run(started_at)
        settings = self._settings
        sessions_dir = settings.sessions_dir

        if not sessions_dir.is_dir():
            message = f"sessions directory not found: {sessions_dir}"
            logger.warning(message)
            return self._finish_run(
                run_id,
                started_at,
                files_seen=0,
                added=0,
                updated=0,
                removed=0,
                failed=0,
                status="error",
                error=message,
            )

        discovered: dict[str, tuple[Path, int, int]] = {}
        try:
            for path in sessions_dir.rglob("*.jsonl"):
                try:
                    stat = path.stat()
                except OSError:
                    continue
                discovered[str(path)] = (path, int(stat.st_size), int(stat.st_mtime_ns))
        except OSError as exc:
            return self._finish_run(
                run_id,
                started_at,
                files_seen=0,
                added=0,
                updated=0,
                removed=0,
                failed=0,
                status="error",
                error=f"cannot scan sessions directory: {exc}",
            )

        with self._session_factory() as db:
            existing = {
                row.file_path: (row.id, row.file_size, row.file_mtime_ns)
                for row in db.execute(
                    select(
                        SessionRow.id,
                        SessionRow.file_path,
                        SessionRow.file_size,
                        SessionRow.file_mtime_ns,
                    )
                )
            }

        added = updated = failed = 0
        for file_path, (path, size, mtime_ns) in discovered.items():
            current = existing.get(file_path)
            if current is not None and current[1] == size and current[2] == mtime_ns:
                continue
            try:
                parsed = parse_session_file(
                    path, stat_result=SimpleNamespace(st_size=size, st_mtime_ns=mtime_ns)
                )
            except Exception:
                logger.exception("failed to parse %s", path)
                failed += 1
                continue

            if parsed.session_id is None:
                logger.warning("skipping %s: no usable session header", path)
                failed += 1
                continue

            try:
                is_new = self._store_session(parsed, path, size, mtime_ns)
            except Exception:
                logger.exception("failed to index %s", path)
                failed += 1
                continue
            if is_new:
                added += 1
            else:
                updated += 1

        removed_paths = existing.keys() - discovered.keys()
        removed = 0
        if removed_paths:
            ids = [existing[path][0] for path in removed_paths]
            try:
                with self._session_factory() as db:
                    # Guard on file_path too: a moved file may have been re-homed
                    # to its new path earlier in this same run.
                    db.execute(
                        delete(SessionRow).where(
                            SessionRow.id.in_(ids),
                            SessionRow.file_path.in_(removed_paths),
                        )
                    )
                    db.commit()
                removed = len(ids)
            except Exception:
                logger.exception("failed to remove %d stale sessions", len(ids))

        status = "partial" if failed else "ok"
        return self._finish_run(
            run_id,
            started_at,
            files_seen=len(discovered),
            added=added,
            updated=updated,
            removed=removed,
            failed=failed,
            status=status,
            error=f"{failed} file(s) failed to parse" if failed else None,
        )

    def _store_session(
        self, parsed: ParsedSession, path: Path, size: int, mtime_ns: int
    ) -> bool:
        """Replace one session's rows in a single transaction. Returns True if new."""
        with self._session_factory() as db:
            row = db.execute(
                select(SessionRow).where(SessionRow.file_path == str(path))
            ).scalar_one_or_none()
            is_new = row is None
            if row is None:
                # A file can be moved between session directories while keeping
                # its header id; re-home the existing row instead of inserting a
                # duplicate session_id.
                row = db.execute(
                    select(SessionRow).where(SessionRow.session_id == parsed.session_id)
                ).scalar_one_or_none()
                if row is not None:
                    db.execute(delete(EntryRow).where(EntryRow.session_id == row.id))
                    is_new = False
            if row is None:
                row = SessionRow(
                    session_id=parsed.session_id or "",
                    file_path=str(path),
                    file_name=path.name,
                )
                db.add(row)
                db.flush()
            elif row.file_path == str(path):
                db.execute(delete(EntryRow).where(EntryRow.session_id == row.id))

            _apply_session(row, parsed, path, size, mtime_ns, self._settings.max_parse_warnings)
            db.flush()

            batch: list[EntryRow] = []
            for entry in parsed.entries:
                batch.append(_entry_row(row.id, entry))
                if len(batch) >= self._settings.entry_insert_batch:
                    db.add_all(batch)
                    db.flush()
                    batch.clear()
            if batch:
                db.add_all(batch)
            db.commit()
            return is_new
