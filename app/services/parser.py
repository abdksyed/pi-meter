"""Pure parser for Pi session JSONL files.

Public entry points
-------------------
``parse_session_file(path)``
    Read one ``*.jsonl`` file (never modified) and return a ``ParsedSession``.
``parse_session_text(text, ...)``
    Parse in-memory text; useful for fixtures and diagnostics.
``parse_session_lines(lines, ...)``
    Parse an iterable of lines (file handles work); one line is parsed at a
    time so memory stays bounded.

Behavior guarantees
-------------------
- Entries keep raw file order; ``entry_index`` is the stable 0-based key.
- Malformed lines produce an error issue and are skipped; later lines still
  parse. The complete raw JSON of every parsed entry is retained in ``raw``.
- Every known Pi entry type is normalized; unknown types are preserved.
- Usage is extracted once per logical entry and summed once.
- Timestamps are UTC epoch milliseconds; costs are integer micro-units.
- The parser is database-independent and has no side effects.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Iterator

from .parser_content import (
    build_search_text,
    extract_text,
    normalize_content,
    summarize_json,
    summarize_text,
)
from .parser_models import (
    KNOWN_ENTRY_TYPES,
    UNTITLED_TITLE,
    BashExecutionData,
    BranchSummaryData,
    CompactionData,
    ContextEditData,
    CustomData,
    CustomMessageData,
    LabelData,
    LabelInfo,
    MessageData,
    ModelChangeData,
    ModelRef,
    ModelUsageSummary,
    ParseIssue,
    ParsedEntry,
    ParsedSession,
    ParsedSessionHeader,
    SessionCounts,
    SessionInfoData,
    SystemPromptData,
    ThinkingLevelChangeData,
    UnknownData,
    UsageEntryData,
)
from .parser_usage import (
    dedupe_usage,
    extract_usage_records,
    sum_usage,
    usage_total_tokens,
)

TITLE_MAX_CHARS = 120
SEARCH_TEXT_MAX_CHARS = 200_000
RAW_EXCERPT_MAX_CHARS = 200


# --------------------------------------------------------------------------- #
# Small coercion helpers
# --------------------------------------------------------------------------- #


def _str_or_none(value: Any) -> str | None:
    return value if isinstance(value, str) else None


def _int_or_none(value: Any) -> int | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return int(value)


def _bool_or_none(value: Any) -> bool | None:
    return value if isinstance(value, bool) else None


def _epoch_ms(value: Any) -> int | None:
    """Coerce a nested message timestamp (epoch milliseconds) to ``int``."""
    return _int_or_none(value)


def parse_iso_ms(value: Any) -> int | None:
    """Parse an ISO 8601 timestamp into UTC epoch milliseconds."""
    if not isinstance(value, str) or not value.strip():
        return None
    text = value.strip()
    if text.endswith(("Z", "z")):
        text = text[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(text)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


def _issue(
    line_number: int,
    entry_index: int | None,
    severity: str,
    code: str,
    message: str,
    raw_excerpt: str | None = None,
) -> ParseIssue:
    if raw_excerpt is not None:
        raw_excerpt = raw_excerpt[:RAW_EXCERPT_MAX_CHARS]
    return ParseIssue(
        line_number=line_number,
        entry_index=entry_index,
        severity=severity,  # type: ignore[arg-type]
        code=code,
        message=message,
        raw_excerpt=raw_excerpt,
    )


def _json_text(value: Any) -> str:
    try:
        return json.dumps(value, ensure_ascii=False, default=str)
    except (TypeError, ValueError):
        return str(value)


def _file_lists(details: Any) -> tuple[list[str], list[str]]:
    if not isinstance(details, dict):
        return [], []

    def as_list(key: str) -> list[str]:
        value = details.get(key)
        if not isinstance(value, list):
            return []
        return [item for item in value if isinstance(item, str)]

    return as_list("readFiles"), as_list("modifiedFiles")


# --------------------------------------------------------------------------- #
# Line iteration
# --------------------------------------------------------------------------- #


def _iter_json_lines(
    lines: Iterable[str | bytes],
) -> Iterator[tuple[int, dict[str, Any] | None, ParseIssue | None]]:
    """Yield ``(line_number, obj_or_none, issue_or_none)`` for each physical line."""
    for line_number, raw_line in enumerate(lines, start=1):
        if isinstance(raw_line, bytes):
            line = raw_line.decode("utf-8", "replace")
        else:
            line = raw_line
        if line_number == 1 and line.startswith("\ufeff"):
            line = line[1:]
        if line.endswith("\n"):
            line = line[:-1]
        if line.endswith("\r"):
            line = line[:-1]
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except ValueError as exc:
            yield (
                line_number,
                None,
                _issue(
                    line_number,
                    None,
                    "error",
                    "invalid_json",
                    f"line is not valid JSON: {exc}",
                    line,
                ),
            )
            continue
        if not isinstance(obj, dict):
            yield (
                line_number,
                None,
                _issue(
                    line_number,
                    None,
                    "error",
                    "invalid_json",
                    "line is not a JSON object",
                    line,
                ),
            )
            continue
        yield line_number, obj, None


# --------------------------------------------------------------------------- #
# Header
# --------------------------------------------------------------------------- #


def _parse_header(
    obj: dict[str, Any], line_number: int
) -> tuple[ParsedSessionHeader | None, list[ParseIssue]]:
    issues: list[ParseIssue] = []
    if obj.get("type") != "session":
        issues.append(
            _issue(
                line_number,
                None,
                "error",
                "missing_header",
                "first JSON object is not a session header",
                _json_text(obj),
            )
        )
        return None, issues

    session_id = obj.get("id")
    if not isinstance(session_id, str) or not session_id.strip():
        issues.append(
            _issue(
                line_number,
                None,
                "error",
                "invalid_header",
                "session header has no usable id",
                _json_text(obj),
            )
        )
        return None, issues

    raw_version = obj.get("version")
    if isinstance(raw_version, bool) or not isinstance(raw_version, int):
        version = 1
        issues.append(
            _issue(
                line_number,
                None,
                "warning",
                "legacy_version",
                "session header has no integer version; assuming 1",
            )
        )
    else:
        version = raw_version
        if version < 3:
            issues.append(
                _issue(
                    line_number,
                    None,
                    "warning",
                    "legacy_version",
                    f"legacy session version {version}; parsing best effort",
                )
            )
        elif version > 3:
            issues.append(
                _issue(
                    line_number,
                    None,
                    "warning",
                    "future_version",
                    f"session version {version} is newer than supported (3)",
                )
            )

    timestamp_raw = _str_or_none(obj.get("timestamp"))
    timestamp_ms = parse_iso_ms(timestamp_raw)
    if timestamp_raw is not None and timestamp_ms is None:
        issues.append(
            _issue(
                line_number,
                None,
                "warning",
                "invalid_timestamp",
                f"invalid session timestamp: {timestamp_raw!r}",
            )
        )

    header = ParsedSessionHeader(
        session_id=session_id.strip(),
        version=version,
        timestamp_ms=timestamp_ms,
        timestamp_raw=timestamp_raw,
        cwd=_str_or_none(obj.get("cwd")) or "",
        parent_session_path=_str_or_none(obj.get("parentSession")),
        raw=obj,
    )
    return header, issues


# --------------------------------------------------------------------------- #
# Entries
# --------------------------------------------------------------------------- #


@dataclass
class _State:
    """Model/thinking state while walking entries in file order."""

    provider: str | None = None
    model: str | None = None
    thinking_level: str | None = None


def _attribute(
    provider: str | None, model: str | None, state: _State
) -> tuple[str | None, str | None, str]:
    """Recorded model wins; otherwise attribute the current model."""
    if provider or model:
        return provider, model, "recorded"
    return state.provider, state.model, "attributed"


def _parse_entry(
    obj: dict[str, Any],
    entry_index: int,
    line_number: int,
    state: _State,
) -> ParsedEntry:
    raw_type = obj.get("type")
    entry_type = raw_type if isinstance(raw_type, str) and raw_type else "unknown"
    entry = ParsedEntry(
        entry_index=entry_index,
        line_number=line_number,
        entry_type=entry_type,
        raw=obj,
    )

    if entry_type == "unknown":
        entry.issues.append(
            _issue(line_number, entry_index, "warning", "missing_type", "entry has no type")
        )

    entry_id = _str_or_none(obj.get("id"))
    if entry_id:
        entry.entry_id = entry_id
    else:
        entry.entry_id = f"line-{line_number}"
        entry.issues.append(
            _issue(
                line_number,
                entry_index,
                "warning",
                "missing_field",
                "entry has no id; synthesized a stable placeholder",
            )
        )

    parent_id = _str_or_none(obj.get("parentId"))
    entry.parent_id = parent_id or None

    entry.timestamp_raw = _str_or_none(obj.get("timestamp"))
    entry.timestamp_ms = parse_iso_ms(entry.timestamp_raw)
    if entry.timestamp_raw is not None and entry.timestamp_ms is None:
        entry.issues.append(
            _issue(
                line_number,
                entry_index,
                "warning",
                "invalid_timestamp",
                f"invalid entry timestamp: {entry.timestamp_raw!r}",
            )
        )

    if entry_type == "message":
        _parse_message(entry, obj, state)
    elif entry_type == "model_change":
        _parse_model_change(entry, obj, state)
    elif entry_type == "thinking_level_change":
        _parse_thinking_level_change(entry, obj, state)
    elif entry_type == "usage":
        _parse_usage_entry(entry, obj, state)
    elif entry_type == "compaction":
        _parse_compaction(entry, obj, state)
    elif entry_type == "context_edit":
        _parse_context_edit(entry, obj)
    elif entry_type == "branch_summary":
        _parse_branch_summary(entry, obj, state)
    elif entry_type == "custom":
        _parse_custom(entry, obj)
    elif entry_type == "custom_message":
        _parse_custom_message(entry, obj)
    elif entry_type == "label":
        _parse_label(entry, obj)
    elif entry_type == "session_info":
        _parse_session_info(entry, obj)
    elif entry_type == "session":
        entry.unknown = UnknownData(raw_type="session")
        entry.issues.append(
            _issue(
                line_number,
                entry_index,
                "warning",
                "duplicate_header",
                "additional session header treated as an unknown entry",
            )
        )
    else:
        entry.unknown = UnknownData(raw_type=raw_type if isinstance(raw_type, str) else None)
        entry.issues.append(
            _issue(
                line_number,
                entry_index,
                "info",
                "unknown_entry_type",
                f"unknown entry type {entry_type!r} preserved as raw JSON",
            )
        )
        entry.content_summary = summarize_json(obj, kind="custom")

    if entry.timestamp_ms is None:
        entry.timestamp_ms = entry.message_started_at_ms

    entry.search_text = _build_entry_search_text(entry)
    return entry


def _parse_message(entry: ParsedEntry, obj: dict[str, Any], state: _State) -> None:
    msg = obj.get("message")
    if not isinstance(msg, dict):
        entry.message = MessageData(role="unknown", content=[])
        entry.role = "unknown"
        entry.issues.append(
            _issue(
                entry.line_number,
                entry.entry_index,
                "warning",
                "missing_message",
                "message entry has no message object",
            )
        )
        return

    role = _str_or_none(msg.get("role")) or "unknown"
    if role == "unknown":
        entry.issues.append(
            _issue(
                entry.line_number,
                entry.entry_index,
                "info",
                "unknown_message_role",
                "message has no role",
            )
        )
    elif role == "hookMessage":
        role = "custom"
        entry.issues.append(
            _issue(
                entry.line_number,
                entry.entry_index,
                "info",
                "legacy_hook_message",
                "legacy hookMessage role normalized to custom",
            )
        )

    blocks = normalize_content(msg.get("content"), role=role)
    text = extract_text(blocks)
    message_ts_ms = _epoch_ms(msg.get("timestamp"))
    entry.message_started_at_ms = message_ts_ms

    explicit_provider = _str_or_none(msg.get("provider"))
    explicit_model = _str_or_none(msg.get("model"))
    if role in ("assistant", "toolResult"):
        # Assistant messages name the model that answered; tool results may
        # carry nested model usage and inherit the current model otherwise.
        provider, model, model_source = _attribute(
            explicit_provider, explicit_model, state
        )
    else:
        provider, model = explicit_provider, explicit_model
        model_source = "recorded" if (provider or model) else None
    if role == "assistant" and (explicit_provider or explicit_model):
        state.provider, state.model = explicit_provider, explicit_model

    entry.role = role
    entry.provider = provider
    entry.model = model
    entry.model_source = model_source  # type: ignore[assignment]
    entry.tool_call_id = _str_or_none(msg.get("toolCallId"))
    entry.tool_name = _str_or_none(msg.get("toolName"))

    stop_reason = _str_or_none(msg.get("stopReason"))
    duration_ms = _int_or_none(msg.get("durationMs"))
    if duration_ms is None and role == "assistant" and message_ts_ms is not None:
        if entry.timestamp_ms is not None:
            duration_ms = max(0, entry.timestamp_ms - message_ts_ms)
    entry.duration_ms = duration_ms

    if role == "assistant":
        is_error = stop_reason == "error"
    elif role == "toolResult":
        is_error = bool(msg.get("isError"))
    elif role == "bashExecution":
        is_error = bool(msg.get("cancelled")) or msg.get("exitCode") not in (0, None)
    else:
        is_error = False
    entry.is_error = is_error

    thinking_level = _str_or_none(msg.get("thinkingLevel"))
    if role == "assistant" and thinking_level is None:
        thinking_level = state.thinking_level
    entry.thinking_level = thinking_level

    message = MessageData(
        role=role,
        content=blocks,
        timestamp_ms=message_ts_ms,
        api=_str_or_none(msg.get("api")),
        provider=explicit_provider,
        model=explicit_model,
        response_model=_str_or_none(msg.get("responseModel")),
        response_id=_str_or_none(msg.get("responseId")),
        thinking_level=thinking_level,
        provider_thinking_level=_str_or_none(msg.get("providerThinkingLevel")),
        stop_reason=stop_reason,
        raw_stop_reason=_str_or_none(msg.get("rawStopReason")),
        error_message=_str_or_none(msg.get("errorMessage")),
        duration_ms=duration_ms,
        tool_call_id=entry.tool_call_id,
        tool_name=entry.tool_name,
        is_error=is_error,
        details=msg.get("details"),
        nested_calls=msg.get("nestedCalls"),
        custom_type=_str_or_none(msg.get("customType")),
        display=_bool_or_none(msg.get("display")),
        summary=_str_or_none(msg.get("summary")),
        from_id=_str_or_none(msg.get("fromId")),
        tokens_before=_int_or_none(msg.get("tokensBefore")),
    )
    if role == "system":
        message.system = _parse_system_prompt(msg, text)
    elif role == "bashExecution":
        message.bash = _parse_bash_execution(msg)
    entry.message = message

    records = extract_usage_records(
        obj,
        entry_index=entry.entry_index,
        entry_id=entry.entry_id,
        provider=provider,
        model=model,
        model_source=model_source,  # type: ignore[arg-type]
        timestamp_ms=entry.timestamp_ms or message_ts_ms,
    )
    if records:
        entry.usage_records = records
        entry.usage = records[0]
        message.usage = records[0]
    elif role == "assistant":
        entry.issues.append(
            _issue(
                entry.line_number,
                entry.entry_index,
                "warning",
                "missing_usage",
                "assistant message has no usage object",
            )
        )

    if role == "toolResult":
        details = msg.get("details")
        truncation = details.get("truncation") if isinstance(details, dict) else None
        entry.content_summary = summarize_text(
            text,
            kind="tool_result",
            is_error=is_error,
            pi_truncation=truncation if isinstance(truncation, dict) else None,
        )
    elif role == "bashExecution" and message.bash is not None:
        entry.content_summary = summarize_text(
            message.bash.output, kind="bash", is_error=is_error
        )


def _parse_system_prompt(msg: dict[str, Any], text: str) -> SystemPromptData:
    sections_raw = msg.get("sections")
    sections: dict[str, str | None] = {}
    if isinstance(sections_raw, dict):
        for key, value in sections_raw.items():
            if isinstance(key, str):
                sections[key] = value if isinstance(value, str) or value is None else str(value)

    tools_added = msg.get("toolsAdded")
    tools_removed = msg.get("toolsRemoved")
    added = list(tools_added) if isinstance(tools_added, list) else []
    removed = list(tools_removed) if isinstance(tools_removed, list) else []

    def names(items: list[Any]) -> list[str]:
        result: list[str] = []
        for item in items:
            if isinstance(item, dict):
                name = item.get("name")
                if isinstance(name, str):
                    result.append(name)
        return result

    return SystemPromptData(
        content_text=text,
        sections=sections,
        section_names=list(sections),
        tools_added=added,
        tools_removed=removed,
        tools_added_names=names(added),
        tools_removed_names=names(removed),
    )


def _parse_bash_execution(msg: dict[str, Any]) -> BashExecutionData:
    return BashExecutionData(
        command=_str_or_none(msg.get("command")) or "",
        output=_str_or_none(msg.get("output")) or "",
        exit_code=_int_or_none(msg.get("exitCode")),
        cancelled=bool(msg.get("cancelled")),
        truncated=bool(msg.get("truncated")),
        full_output_path=_str_or_none(msg.get("fullOutputPath")),
        exclude_from_context=bool(msg.get("excludeFromContext")),
    )


def _parse_model_change(entry: ParsedEntry, obj: dict[str, Any], state: _State) -> None:
    provider = _str_or_none(obj.get("provider"))
    model_id = _str_or_none(obj.get("modelId"))
    entry.model_change = ModelChangeData(
        provider=provider,
        model_id=model_id,
        previous_provider=state.provider,
        previous_model_id=state.model,
    )
    entry.provider = provider
    entry.model = model_id
    entry.model_source = "recorded" if (provider or model_id) else None
    state.provider, state.model = provider, model_id


def _parse_thinking_level_change(
    entry: ParsedEntry, obj: dict[str, Any], state: _State
) -> None:
    level = _str_or_none(obj.get("thinkingLevel"))
    entry.thinking_level_change = ThinkingLevelChangeData(
        thinking_level=level, previous_thinking_level=state.thinking_level
    )
    entry.thinking_level = level
    state.thinking_level = level


def _parse_usage_entry(entry: ParsedEntry, obj: dict[str, Any], state: _State) -> None:
    kind = _str_or_none(obj.get("kind")) or "unknown"
    provider, model, model_source = _attribute(
        _str_or_none(obj.get("provider")), _str_or_none(obj.get("model")), state
    )
    entry.provider = provider
    entry.model = model
    entry.model_source = model_source  # type: ignore[assignment]

    records = extract_usage_records(
        obj,
        entry_index=entry.entry_index,
        entry_id=entry.entry_id,
        provider=provider,
        model=model,
        model_source=model_source,  # type: ignore[arg-type]
        timestamp_ms=entry.timestamp_ms,
    )
    entry.usage_records = records
    entry.usage = records[0] if records else None
    entry.usage_entry = UsageEntryData(
        kind=kind,
        provider=provider,
        model=model,
        usage=entry.usage,
        note=_str_or_none(obj.get("note")),
    )


def _parse_compaction(entry: ParsedEntry, obj: dict[str, Any], state: _State) -> None:
    summary = _str_or_none(obj.get("summary")) or ""
    details = obj.get("details")
    read_files, modified_files = _file_lists(details)
    provider, model, model_source = _attribute(
        _str_or_none(obj.get("provider")), _str_or_none(obj.get("model")), state
    )
    entry.provider = provider
    entry.model = model
    entry.model_source = model_source  # type: ignore[assignment]

    records = extract_usage_records(
        obj,
        entry_index=entry.entry_index,
        entry_id=entry.entry_id,
        provider=provider,
        model=model,
        model_source=model_source,  # type: ignore[arg-type]
        timestamp_ms=entry.timestamp_ms,
    )
    entry.usage_records = records
    entry.usage = records[0] if records else None

    system_message = obj.get("systemMessage")
    entry.compaction = CompactionData(
        summary=summary,
        first_kept_entry_id=_str_or_none(obj.get("firstKeptEntryId")),
        tokens_before=_int_or_none(obj.get("tokensBefore")) or 0,
        usage=entry.usage,
        details=details,
        from_hook=_bool_or_none(obj.get("fromHook")),
        system_message_raw=system_message if isinstance(system_message, dict) else None,
        read_files=read_files,
        modified_files=modified_files,
    )
    entry.content_summary = summarize_text(summary, kind="summary")


def _parse_context_edit(entry: ParsedEntry, obj: dict[str, Any]) -> None:
    target_id = _str_or_none(obj.get("targetId"))
    if target_id is None:
        entry.issues.append(
            _issue(
                entry.line_number,
                entry.entry_index,
                "warning",
                "missing_field",
                "context_edit has no targetId",
            )
        )

    replacement = obj.get("replacement")
    if replacement is None:
        blocks: list[Any] | None = None
        omitted = True
    else:
        omitted = False
        raw_content = replacement.get("content") if isinstance(replacement, dict) else replacement
        blocks = normalize_content(raw_content, role="user")

    summary = summarize_text(extract_text(blocks), kind="custom") if blocks else None
    entry.context_edit = ContextEditData(
        target_id=target_id,
        replacement_content=blocks,  # type: ignore[arg-type]
        replacement_summary=summary,
        omitted=omitted,
    )
    entry.content_summary = summary


def _parse_branch_summary(
    entry: ParsedEntry, obj: dict[str, Any], state: _State
) -> None:
    summary = _str_or_none(obj.get("summary")) or ""
    details = obj.get("details")
    read_files, modified_files = _file_lists(details)
    provider, model, model_source = _attribute(
        _str_or_none(obj.get("provider")), _str_or_none(obj.get("model")), state
    )
    entry.provider = provider
    entry.model = model
    entry.model_source = model_source  # type: ignore[assignment]

    records = extract_usage_records(
        obj,
        entry_index=entry.entry_index,
        entry_id=entry.entry_id,
        provider=provider,
        model=model,
        model_source=model_source,  # type: ignore[arg-type]
        timestamp_ms=entry.timestamp_ms,
    )
    entry.usage_records = records
    entry.usage = records[0] if records else None

    entry.branch_summary = BranchSummaryData(
        from_id=_str_or_none(obj.get("fromId")),
        summary=summary,
        usage=entry.usage,
        details=details,
        from_hook=_bool_or_none(obj.get("fromHook")),
        read_files=read_files,
        modified_files=modified_files,
    )
    entry.content_summary = summarize_text(summary, kind="summary")


def _parse_custom(entry: ParsedEntry, obj: dict[str, Any]) -> None:
    data = obj.get("data")
    entry.custom = CustomData(
        custom_type=_str_or_none(obj.get("customType")) or "", data=data
    )
    if data is not None:
        entry.content_summary = summarize_json(data, kind="custom")


def _parse_custom_message(entry: ParsedEntry, obj: dict[str, Any]) -> None:
    blocks = normalize_content(obj.get("content"), role="user")
    display = _bool_or_none(obj.get("display"))
    entry.custom_message = CustomMessageData(
        custom_type=_str_or_none(obj.get("customType")) or "",
        content=blocks,
        display=True if display is None else display,
        details=obj.get("details"),
    )
    if blocks:
        entry.content_summary = summarize_text(extract_text(blocks), kind="custom")


def _parse_label(entry: ParsedEntry, obj: dict[str, Any]) -> None:
    target_id = _str_or_none(obj.get("targetId"))
    raw_label = _str_or_none(obj.get("label"))
    label = raw_label.strip() if raw_label and raw_label.strip() else None
    entry.label = LabelData(
        target_id=target_id, label=label, cleared=label is None
    )
    if target_id is None:
        entry.issues.append(
            _issue(
                entry.line_number,
                entry.entry_index,
                "warning",
                "missing_field",
                "label entry has no targetId",
            )
        )


def _parse_session_info(entry: ParsedEntry, obj: dict[str, Any]) -> None:
    raw_name = _str_or_none(obj.get("name"))
    name = raw_name.strip() if raw_name and raw_name.strip() else None
    entry.session_info = SessionInfoData(name=name, cleared=name is None)


# --------------------------------------------------------------------------- #
# Search text
# --------------------------------------------------------------------------- #


def _build_entry_search_text(entry: ParsedEntry) -> str:
    parts: list[str] = []
    if entry.role:
        parts.append(entry.role)
    if entry.message is not None:
        parts.append(build_search_text(entry.message.content))
        if entry.message.error_message:
            parts.append(entry.message.error_message)
        if entry.message.summary:
            parts.append(entry.message.summary)
        if entry.message.system is not None:
            parts.append(" ".join(entry.message.system.section_names))
            parts.append(" ".join(entry.message.system.tools_added_names))
            parts.append(" ".join(entry.message.system.tools_removed_names))
        if entry.message.bash is not None:
            parts.append(entry.message.bash.command)
    if entry.compaction is not None:
        parts.append(entry.compaction.summary)
    if entry.branch_summary is not None:
        parts.append(entry.branch_summary.summary)
    if entry.custom_message is not None:
        parts.append(entry.custom_message.custom_type)
        parts.append(build_search_text(entry.custom_message.content))
    if entry.custom is not None:
        parts.append(entry.custom.custom_type)
        parts.append(_json_text(entry.custom.data))
    if entry.context_edit is not None and entry.context_edit.target_id:
        parts.append(entry.context_edit.target_id)
    if entry.label is not None:
        parts.append(entry.label.label or "")
        parts.append(entry.label.target_id or "")
    if entry.session_info is not None and entry.session_info.name:
        parts.append(entry.session_info.name)
    if entry.model_change is not None:
        parts.append(entry.model_change.provider or "")
        parts.append(entry.model_change.model_id or "")
    if entry.thinking_level_change is not None:
        parts.append(entry.thinking_level_change.thinking_level or "")
    if entry.unknown is not None:
        parts.append(_json_text(entry.raw))
    text = " ".join(part for part in parts if part)
    return text.lower()[:SEARCH_TEXT_MAX_CHARS]


# --------------------------------------------------------------------------- #
# Finalization
# --------------------------------------------------------------------------- #


def _resolve_links(session: ParsedSession) -> None:
    by_id: dict[str, ParsedEntry] = {}
    for entry in session.entries:
        if not entry.entry_id:
            continue
        if entry.entry_id in by_id:
            entry.issues.append(
                _issue(
                    entry.line_number,
                    entry.entry_index,
                    "warning",
                    "duplicate_entry_id",
                    f"duplicate entry id {entry.entry_id!r}; last occurrence wins",
                )
            )
            session.issues.append(entry.issues[-1])
        by_id[entry.entry_id] = entry

    roots = 0
    for entry in session.entries:
        if not entry.parent_id:
            roots += 1
            continue
        if entry.parent_id == entry.entry_id:
            entry.parent_id = None
            roots += 1
            issue = _issue(
                entry.line_number,
                entry.entry_index,
                "warning",
                "self_parent",
                "entry is its own parent; treated as a root",
            )
            entry.issues.append(issue)
            session.issues.append(issue)
            continue
        parent = by_id.get(entry.parent_id)
        if parent is None:
            roots += 1
            issue = _issue(
                entry.line_number,
                entry.entry_index,
                "warning",
                "orphan_parent",
                f"parent id {entry.parent_id!r} not found; treated as a root",
            )
            entry.issues.append(issue)
            session.issues.append(issue)
            continue
        entry.parent_entry_index = parent.entry_index
        parent.child_count += 1
        parent.is_branch_point = parent.child_count > 1

    if roots > 1:
        session.issues.append(
            _issue(
                0,
                None,
                "warning",
                "multiple_roots",
                f"session has {roots} roots; rendering in file order",
            )
        )

    for entry in session.entries:
        if entry.label is not None:
            target = by_id.get(entry.label.target_id) if entry.label.target_id else None
            if target is not None:
                entry.label.target_entry_index = target.entry_index
            elif entry.label.target_id:
                issue = _issue(
                    entry.line_number,
                    entry.entry_index,
                    "warning",
                    "missing_label_target",
                    f"label target {entry.label.target_id!r} not found",
                )
                entry.issues.append(issue)
                session.issues.append(issue)
            if entry.label.label and entry.label.target_id:
                session.labels[entry.label.target_id] = LabelInfo(
                    target_id=entry.label.target_id,
                    target_entry_index=entry.label.target_entry_index,
                    label=entry.label.label,
                    timestamp_ms=entry.timestamp_ms,
                    entry_index=entry.entry_index,
                )
            elif entry.label.target_id:
                session.labels.pop(entry.label.target_id, None)

        if entry.context_edit is not None:
            target = (
                by_id.get(entry.context_edit.target_id)
                if entry.context_edit.target_id
                else None
            )
            if target is not None:
                entry.context_edit.target_entry_index = target.entry_index
                entry.context_edit.target_role = target.role
            elif entry.context_edit.target_id:
                issue = _issue(
                    entry.line_number,
                    entry.entry_index,
                    "warning",
                    "missing_context_target",
                    f"context_edit target {entry.context_edit.target_id!r} not found",
                )
                entry.issues.append(issue)
                session.issues.append(issue)

        if entry.compaction is not None and entry.compaction.first_kept_entry_id:
            target = by_id.get(entry.compaction.first_kept_entry_id)
            if target is not None:
                entry.compaction.first_kept_entry_index = target.entry_index
            else:
                issue = _issue(
                    entry.line_number,
                    entry.entry_index,
                    "warning",
                    "missing_compaction_boundary",
                    f"compaction boundary {entry.compaction.first_kept_entry_id!r} not found",
                )
                entry.issues.append(issue)
                session.issues.append(issue)

        if entry.branch_summary is not None and entry.branch_summary.from_id:
            target = by_id.get(entry.branch_summary.from_id)
            if target is not None:
                entry.branch_summary.from_entry_index = target.entry_index
            else:
                issue = _issue(
                    entry.line_number,
                    entry.entry_index,
                    "warning",
                    "missing_branch_source",
                    f"branch source {entry.branch_summary.from_id!r} not found",
                )
                entry.issues.append(issue)
                session.issues.append(issue)


def _compute_counts(session: ParsedSession) -> None:
    counts = SessionCounts()
    for entry in session.entries:
        counts.entry_count += 1
        entry_type = entry.entry_type
        if entry_type == "message":
            counts.message_count += 1
            role = entry.message.role if entry.message else None
            if role == "user":
                counts.user_message_count += 1
            elif role == "assistant":
                counts.assistant_message_count += 1
                if entry.message is not None:
                    counts.tool_call_count += sum(
                        1 for block in entry.message.content if block.type == "toolCall"
                    )
            elif role == "toolResult":
                counts.tool_result_count += 1
            elif role == "system":
                counts.system_message_count += 1
        elif entry_type == "model_change":
            counts.model_change_count += 1
        elif entry_type == "thinking_level_change":
            counts.thinking_level_change_count += 1
        elif entry_type == "usage":
            counts.usage_entry_count += 1
        elif entry_type == "compaction":
            counts.compaction_count += 1
        elif entry_type == "context_edit":
            counts.context_edit_count += 1
        elif entry_type == "branch_summary":
            counts.branch_summary_count += 1
        elif entry_type == "custom":
            counts.custom_count += 1
        elif entry_type == "custom_message":
            counts.custom_message_count += 1
        elif entry_type == "label":
            counts.label_count += 1
        elif entry_type == "session_info":
            counts.session_info_count += 1
        elif entry_type == "session":
            counts.unknown_entry_count += 1
        elif entry_type not in KNOWN_ENTRY_TYPES:
            counts.unknown_entry_count += 1
    session.counts = counts


def _compute_title(session: ParsedSession) -> None:
    name: str | None = None
    for entry in session.entries:
        if entry.session_info is not None:
            name = entry.session_info.name

    first_user_message: str | None = None
    for entry in session.entries:
        if entry.message is None or entry.message.role != "user":
            continue
        normalized = " ".join(extract_text(entry.message.content).split())
        if normalized:
            first_user_message = normalized
            break

    session.name = name
    session.first_user_message = first_user_message
    if name:
        session.title = name
        session.title_source = "session_info"
    elif first_user_message:
        if len(first_user_message) > TITLE_MAX_CHARS:
            session.title = first_user_message[:TITLE_MAX_CHARS].rstrip() + "\u2026"
        else:
            session.title = first_user_message
        session.title_source = "first_user_message"
    else:
        session.title = UNTITLED_TITLE
        session.title_source = "fallback"


def _compute_timeline(session: ParsedSession) -> None:
    file_mtime_ms = session.file_mtime_ns // 1_000_000 if session.file_mtime_ns else None
    entry_timestamps = [
        entry.timestamp_ms for entry in session.entries if entry.timestamp_ms is not None
    ]
    activity_timestamps = list(entry_timestamps) + [
        entry.message_started_at_ms
        for entry in session.entries
        if entry.message_started_at_ms is not None
    ]

    started_at_ms = session.header.timestamp_ms if session.header else None
    if started_at_ms is None and entry_timestamps:
        started_at_ms = entry_timestamps[0]
    if started_at_ms is None:
        started_at_ms = file_mtime_ms

    last_activity_at_ms = max(activity_timestamps) if activity_timestamps else started_at_ms

    session.started_at_ms = started_at_ms
    session.last_activity_at_ms = last_activity_at_ms
    if started_at_ms is not None and last_activity_at_ms is not None:
        session.duration_ms = max(0, last_activity_at_ms - started_at_ms)
    else:
        session.duration_ms = None


def _compute_models(session: ParsedSession) -> None:
    seen: list[ModelRef] = []
    for entry in session.entries:
        if entry.model_change is not None:
            provider = entry.model_change.provider
            model = entry.model_change.model_id
        elif entry.message is not None and entry.message.role == "assistant":
            provider = entry.message.provider
            model = entry.message.model
        elif entry.usage_entry is not None:
            provider = entry.usage_entry.provider
            model = entry.usage_entry.model
        else:
            continue
        if not provider and not model:
            continue
        ref = ModelRef(provider=provider, model=model)
        if ref not in seen:
            seen.append(ref)
    session.models_seen = seen

    summaries: dict[tuple[str | None, str | None], ModelUsageSummary] = {}
    order: list[tuple[str | None, str | None]] = []
    for record in session.usage_records:
        key = (record.provider, record.model)
        summary = summaries.get(key)
        if summary is None:
            summary = ModelUsageSummary(provider=record.provider, model=record.model)
            summaries[key] = summary
            order.append(key)
        summary.usage_entry_count += 1
        summary.input_tokens += record.tokens.input
        summary.output_tokens += record.tokens.output
        summary.total_tokens += usage_total_tokens(record.tokens)
        summary.cost_total_micro += record.cost.total_micro
    session.models_with_usage = [summaries[key] for key in order]


def _finalize(session: ParsedSession) -> ParsedSession:
    _resolve_links(session)
    _compute_counts(session)
    _compute_title(session)
    _compute_timeline(session)
    session.usage_records = dedupe_usage(session.usage_records)
    session.totals = sum_usage(session.usage_records)
    _compute_models(session)

    if session.parse_status != "error":
        errors = [issue for issue in session.issues if issue.severity == "error"]
        if errors:
            session.parse_status = "partial"
            session.parse_error = errors[0].message
        else:
            session.parse_status = "ok"
            session.parse_error = None
    return session


# --------------------------------------------------------------------------- #
# Public entry points
# --------------------------------------------------------------------------- #


def parse_session_lines(
    lines: Iterable[str | bytes],
    *,
    file_path: Path | None = None,
    file_size: int = 0,
    file_mtime_ns: int = 0,
) -> ParsedSession:
    """Parse an iterable of JSONL lines into a :class:`ParsedSession`."""
    session = ParsedSession(
        file_path=file_path,
        file_size=file_size,
        file_mtime_ns=file_mtime_ns,
    )
    state = _State()
    header_checked = False
    entry_index = 0

    for line_number, obj, issue in _iter_json_lines(lines):
        if issue is not None:
            session.issues.append(issue)
            continue
        if obj is None:
            continue

        if not header_checked:
            header_checked = True
            header, header_issues = _parse_header(obj, line_number)
            session.header = header
            session.issues.extend(header_issues)
            if header is None:
                session.parse_status = "error"
                session.parse_error = (
                    header_issues[0].message if header_issues else "missing session header"
                )
                return _finalize(session)
            continue

        entry = _parse_entry(obj, entry_index, line_number, state)
        entry_index += 1
        session.entries.append(entry)
        session.issues.extend(entry.issues)
        session.usage_records.extend(entry.usage_records)

    if not header_checked:
        session.issues.append(
            _issue(0, None, "error", "empty_file", "session file has no JSON lines")
        )
        session.parse_status = "error"
        session.parse_error = "empty file"

    return _finalize(session)


def parse_session_text(
    text: str,
    *,
    file_path: Path | None = None,
    file_size: int = 0,
    file_mtime_ns: int = 0,
) -> ParsedSession:
    """Parse in-memory JSONL text (split on LF only, like the real files)."""
    if file_size == 0 and text:
        file_size = len(text.encode("utf-8"))
    return parse_session_lines(
        text.split("\n"),
        file_path=file_path,
        file_size=file_size,
        file_mtime_ns=file_mtime_ns,
    )


def parse_session_file(
    path: Path, *, stat_result: Any | None = None
) -> ParsedSession:
    """Parse one session file. The file is opened read-only and never written."""
    try:
        stat = stat_result if stat_result is not None else path.stat()
        file_size = int(stat.st_size)
        file_mtime_ns = int(stat.st_mtime_ns)
    except OSError:
        file_size = 0
        file_mtime_ns = 0

    try:
        with path.open("r", encoding="utf-8-sig", errors="replace", newline="") as handle:
            return parse_session_lines(
                handle,
                file_path=path,
                file_size=file_size,
                file_mtime_ns=file_mtime_ns,
            )
    except OSError as exc:
        session = ParsedSession(
            file_path=path,
            file_size=file_size,
            file_mtime_ns=file_mtime_ns,
            parse_status="error",
            parse_error=f"cannot read session file: {exc}",
        )
        session.issues.append(
            _issue(
                0,
                None,
                "error",
                "file_read_error",
                f"cannot read session file: {exc}",
            )
        )
        return _finalize(session)
