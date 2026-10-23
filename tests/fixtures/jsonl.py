"""Synthetic Pi session JSONL builders shared by every test worker.

Every builder returns a plain ``dict`` matching Pi's on-disk JSONL shape, so
fixtures stay independent of production code (this module never imports
``app``). Recorded costs are kept as decimal *strings*; tests compute expected
integer micro-units themselves instead of calling ``app.services`` helpers.

Conventions used by all fixtures here:

* timestamps are ISO-8601 UTC strings with millisecond precision;
* nested ``message.timestamp`` values are UTC epoch milliseconds (as Pi writes
  them), never ISO strings;
* ``entry_id`` / ``parent_id`` map to the file's ``id`` / ``parentId``;
* ``cost_input_micro`` style expectations live in :mod:`tests.fixtures.corpus`.

Use :func:`write_jsonl` to persist a record list, or pass raw strings in the
list to model malformed lines.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Mapping, Sequence

JsonRecord = dict[str, Any]
JsonLine = JsonRecord | str

DEFAULT_TIMESTAMP = "2026-01-15T09:00:00.000Z"


def epoch_ms(timestamp: str) -> int:
    """Convert an ISO-8601 UTC timestamp into epoch milliseconds."""
    parsed = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return int(parsed.timestamp() * 1000)


# --------------------------------------------------------------------------- #
# Header and content blocks
# --------------------------------------------------------------------------- #


def session_header(
    session_id: str,
    *,
    timestamp: str = DEFAULT_TIMESTAMP,
    cwd: str = "/work/alpha",
    version: int = 3,
    parent_session: str | None = None,
) -> JsonRecord:
    """Pi's first JSONL line (``{"type": "session", ...}``)."""
    record: JsonRecord = {
        "type": "session",
        "version": version,
        "id": session_id,
        "timestamp": timestamp,
        "cwd": cwd,
    }
    if parent_session is not None:
        record["parentSession"] = parent_session
    return record


def text_block(text: str) -> JsonRecord:
    return {"type": "text", "text": text}


def thinking_block(text: str, *, redacted: bool = False) -> JsonRecord:
    block: JsonRecord = {"type": "thinking", "thinking": text}
    if redacted:
        block["redacted"] = True
    return block


def image_block(
    data: str = "iVBORw0KGgoAAAANSUhEUg==", mime_type: str = "image/png"
) -> JsonRecord:
    return {"type": "image", "mimeType": mime_type, "data": data}


def tool_call_block(
    call_id: str,
    name: str,
    arguments: Any = None,
    *,
    raw_arguments: str | None = None,
    arguments_error: str | None = None,
) -> JsonRecord:
    """One ``toolCall`` content block.

    ``arguments`` may be any JSON value; ``raw_arguments`` models Pi's habit of
    storing partially parsed argument text, and ``arguments_error`` a parse
    failure.
    """
    block: JsonRecord = {"type": "toolCall", "id": call_id, "name": name}
    block["arguments"] = raw_arguments if raw_arguments is not None else (arguments or {})
    if arguments_error is not None:
        block["argumentsError"] = arguments_error
    return block


def unknown_block(raw_type: str = "futureBlock", **fields: Any) -> JsonRecord:
    return {"type": raw_type, **fields}


# --------------------------------------------------------------------------- #
# Usage and cost objects
# --------------------------------------------------------------------------- #


def cost_object(
    *,
    input: str | int | None = None,
    output: str | int | None = None,
    cache_read: str | int | None = None,
    cache_write: str | int | None = None,
    total: str | int | None = None,
) -> dict[str, str | int]:
    """Recorded cost object. Values are decimal strings unless noted."""
    values: dict[str, str | int | None] = {
        "input": input,
        "output": output,
        "cacheRead": cache_read,
        "cacheWrite": cache_write,
        "total": total,
    }
    return {key: value for key, value in values.items() if value is not None}


def usage_object(
    *,
    input: int = 0,
    output: int = 0,
    reasoning: int = 0,
    cache_read: int = 0,
    cache_write: int = 0,
    cache_write_1h: int | None = None,
    total_tokens: int | None = None,
    cost: Mapping[str, str | int] | None = None,
    omit: Sequence[str] = (),
) -> JsonRecord:
    """Build a Pi usage object.

    ``total_tokens`` is omitted when ``None`` so tests can exercise Pi's
    "derive the total from the components" fallback. ``omit`` drops keys entirely
    (for missing-optional-field cases).
    """
    usage: JsonRecord = {
        "input": input,
        "output": output,
        "reasoning": reasoning,
        "cacheRead": cache_read,
        "cacheWrite": cache_write,
    }
    if cache_write_1h is not None:
        usage["cacheWrite1h"] = cache_write_1h
    if total_tokens is not None:
        usage["totalTokens"] = total_tokens
    if cost is not None:
        usage["cost"] = dict(cost)
    for key in omit:
        usage.pop(key, None)
    return usage


# --------------------------------------------------------------------------- #
# Message entries
# --------------------------------------------------------------------------- #


def message_entry(
    entry_id: str,
    role: str,
    content: Sequence[JsonRecord] | str | None,
    *,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    **message_fields: Any,
) -> JsonRecord:
    """Generic ``message`` entry for arbitrary roles and content shapes."""
    message: JsonRecord = {"role": role, "content": content, "timestamp": epoch_ms(timestamp)}
    message.update(message_fields)
    entry: JsonRecord = {
        "type": "message",
        "id": entry_id,
        "timestamp": timestamp,
        "message": message,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    return entry


def user_message(
    entry_id: str,
    text: str,
    *,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    blocks: Sequence[JsonRecord] = (),
) -> JsonRecord:
    content: list[JsonRecord] = [text_block(text), *blocks]
    return message_entry(entry_id, "user", content, timestamp=timestamp, parent_id=parent_id)


def assistant_message(
    entry_id: str,
    *,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    text: str | None = None,
    thinking: str | None = None,
    tool_calls: Sequence[JsonRecord] = (),
    extra_blocks: Sequence[JsonRecord] = (),
    provider: str | None = "anthropic",
    model: str | None = "claude-sonnet-4-5",
    usage: JsonRecord | None = None,
    stop_reason: str = "stop",
    thinking_level: str | None = None,
    duration_ms: int | None = None,
    error_message: str | None = None,
    api: str | None = "anthropic-messages",
) -> JsonRecord:
    content: list[JsonRecord] = []
    if thinking is not None:
        content.append(thinking_block(thinking))
    if text is not None:
        content.append(text_block(text))
    content.extend(tool_calls)
    content.extend(extra_blocks)

    fields: JsonRecord = {
        "provider": provider,
        "model": model,
        "stopReason": stop_reason,
        "api": api,
    }
    if usage is not None:
        fields["usage"] = usage
    if thinking_level is not None:
        fields["thinkingLevel"] = thinking_level
    if duration_ms is not None:
        fields["durationMs"] = duration_ms
    if error_message is not None:
        fields["errorMessage"] = error_message
    return message_entry(
        entry_id,
        "assistant",
        content,
        timestamp=timestamp,
        parent_id=parent_id,
        **fields,
    )


def tool_result_message(
    entry_id: str,
    *,
    call_id: str,
    tool_name: str = "bash",
    output: str = "ok",
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    is_error: bool = False,
    usage: JsonRecord | None = None,
    details: Mapping[str, Any] | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> JsonRecord:
    fields: JsonRecord = {"toolCallId": call_id, "toolName": tool_name, "isError": is_error}
    if usage is not None:
        fields["usage"] = usage
    if details is not None:
        fields["details"] = dict(details)
    if provider is not None:
        fields["provider"] = provider
    if model is not None:
        fields["model"] = model
    return message_entry(
        entry_id,
        "toolResult",
        [text_block(output)],
        timestamp=timestamp,
        parent_id=parent_id,
        **fields,
    )


# --------------------------------------------------------------------------- #
# Non-message entry types
# --------------------------------------------------------------------------- #


def model_change(
    entry_id: str,
    *,
    provider: str,
    model_id: str,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": "model_change",
        "id": entry_id,
        "timestamp": timestamp,
        "provider": provider,
        "modelId": model_id,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    return entry


def thinking_level_change(
    entry_id: str,
    *,
    thinking_level: str,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": "thinking_level_change",
        "id": entry_id,
        "timestamp": timestamp,
        "thinkingLevel": thinking_level,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    return entry


def usage_entry(
    entry_id: str,
    usage: JsonRecord,
    *,
    kind: str = "session_total",
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    note: str | None = None,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": "usage",
        "id": entry_id,
        "timestamp": timestamp,
        "kind": kind,
        "usage": usage,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    if provider is not None:
        entry["provider"] = provider
    if model is not None:
        entry["model"] = model
    if note is not None:
        entry["note"] = note
    return entry


def compaction(
    entry_id: str,
    *,
    summary: str,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    usage: JsonRecord | None = None,
    tokens_before: int = 0,
    first_kept_entry_id: str | None = None,
    details: Mapping[str, Any] | None = None,
    provider: str | None = None,
    model: str | None = None,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": "compaction",
        "id": entry_id,
        "timestamp": timestamp,
        "summary": summary,
        "tokensBefore": tokens_before,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    if usage is not None:
        entry["usage"] = usage
    if first_kept_entry_id is not None:
        entry["firstKeptEntryId"] = first_kept_entry_id
    if details is not None:
        entry["details"] = dict(details)
    if provider is not None:
        entry["provider"] = provider
    if model is not None:
        entry["model"] = model
    return entry


def branch_summary(
    entry_id: str,
    *,
    summary: str,
    from_id: str | None = None,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    usage: JsonRecord | None = None,
    details: Mapping[str, Any] | None = None,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": "branch_summary",
        "id": entry_id,
        "timestamp": timestamp,
        "summary": summary,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    if from_id is not None:
        entry["fromId"] = from_id
    if usage is not None:
        entry["usage"] = usage
    if details is not None:
        entry["details"] = dict(details)
    return entry


def context_edit(
    entry_id: str,
    *,
    target_id: str,
    replacement: Sequence[JsonRecord] | None = None,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
) -> JsonRecord:
    """``replacement=None`` models an omitted (redacted) context edit."""
    entry: JsonRecord = {
        "type": "context_edit",
        "id": entry_id,
        "timestamp": timestamp,
        "targetId": target_id,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    if replacement is not None:
        entry["replacement"] = {"content": list(replacement)}
    return entry


def custom(
    entry_id: str,
    *,
    custom_type: str,
    data: Any,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": "custom",
        "id": entry_id,
        "timestamp": timestamp,
        "customType": custom_type,
        "data": data,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    return entry


def custom_message(
    entry_id: str,
    *,
    custom_type: str,
    text: str,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    display: bool = True,
    details: Mapping[str, Any] | None = None,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": "custom_message",
        "id": entry_id,
        "timestamp": timestamp,
        "customType": custom_type,
        "content": [text_block(text)],
        "display": display,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    if details is not None:
        entry["details"] = dict(details)
    return entry


def label(
    entry_id: str,
    *,
    target_id: str,
    label_text: str | None,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
) -> JsonRecord:
    """``label_text=None`` models a cleared label."""
    entry: JsonRecord = {
        "type": "label",
        "id": entry_id,
        "timestamp": timestamp,
        "targetId": target_id,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    if label_text is not None:
        entry["label"] = label_text
    return entry


def session_info(
    entry_id: str,
    *,
    name: str | None,
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
) -> JsonRecord:
    """``name=None`` models a cleared session name."""
    entry: JsonRecord = {
        "type": "session_info",
        "id": entry_id,
        "timestamp": timestamp,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    if name is not None:
        entry["name"] = name
    return entry


def unknown_entry(
    entry_id: str,
    *,
    entry_type: str = "future_event",
    timestamp: str = DEFAULT_TIMESTAMP,
    parent_id: str | None = None,
    **fields: Any,
) -> JsonRecord:
    entry: JsonRecord = {
        "type": entry_type,
        "id": entry_id,
        "timestamp": timestamp,
        **fields,
    }
    if parent_id is not None:
        entry["parentId"] = parent_id
    return entry


# --------------------------------------------------------------------------- #
# Serialization
# --------------------------------------------------------------------------- #


def to_jsonl(records: Sequence[JsonLine]) -> str:
    """Serialize records as newline-terminated JSONL.

    String entries are written verbatim so fixtures can contain malformed lines.
    Field order matches insertion order to keep diffs and byte checks stable.
    """
    lines = [
        record if isinstance(record, str) else json.dumps(record, ensure_ascii=False)
        for record in records
    ]
    return "\n".join(lines) + ("\n" if lines else "")


def write_jsonl(path: Path, records: Sequence[JsonLine]) -> Path:
    """Write records to ``path`` (parents created). Never appends."""
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(to_jsonl(records), encoding="utf-8")
    return path


def write_session_text(path: Path, text: str) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")
    return path
