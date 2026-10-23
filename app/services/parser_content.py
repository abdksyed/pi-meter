"""Content-block normalization, text extraction, search text, and previews.

This module knows the shapes of Pi message content blocks but nothing about
session files, databases, or HTTP. All thresholds used to decide whether long
content should start collapsed live here.
"""

from __future__ import annotations

import json
from typing import Any

from .parser_models import (
    ContentBlock,
    ContentFormat,
    ContentSummary,
    ImageData,
    ToolCallData,
)

# Preview / collapse thresholds (see the parser subplan, section 6.3).
PREVIEW_TOOL_RESULT_LINES = 4
PREVIEW_TOOL_RESULT_CHARS = 400
COLLAPSE_TOOL_RESULT_LINES = 12
COLLAPSE_TOOL_RESULT_CHARS = 2_000

PREVIEW_TOOL_ARGS_LINES = 6
PREVIEW_TOOL_ARGS_CHARS = 600
COLLAPSE_TOOL_ARGS_LINES = 10
COLLAPSE_TOOL_ARGS_CHARS = 1_200

PREVIEW_SUMMARY_LINES = 8
PREVIEW_SUMMARY_CHARS = 800
COLLAPSE_SUMMARY_LINES = 20
COLLAPSE_SUMMARY_CHARS = 1_500

PREVIEW_THINKING_CHARS = 300
COLLAPSE_THINKING_CHARS = 500

PREVIEW_CUSTOM_CHARS = 400
COLLAPSE_CUSTOM_CHARS = 500

ERROR_KEEP_OPEN_LINES = 20
ERROR_KEEP_OPEN_CHARS = 4_000

#: kind -> (preview_lines, preview_chars, collapse_lines, collapse_chars)
#: ``collapse_lines == 0`` means "always collapsed"; ``None`` disables that axis.
_THRESHOLDS: dict[str, tuple[int | None, int | None, int | None, int | None]] = {
    "tool_result": (
        PREVIEW_TOOL_RESULT_LINES,
        PREVIEW_TOOL_RESULT_CHARS,
        COLLAPSE_TOOL_RESULT_LINES,
        COLLAPSE_TOOL_RESULT_CHARS,
    ),
    "bash": (
        PREVIEW_TOOL_RESULT_LINES,
        PREVIEW_TOOL_RESULT_CHARS,
        COLLAPSE_TOOL_RESULT_LINES,
        COLLAPSE_TOOL_RESULT_CHARS,
    ),
    "tool_args": (
        PREVIEW_TOOL_ARGS_LINES,
        PREVIEW_TOOL_ARGS_CHARS,
        COLLAPSE_TOOL_ARGS_LINES,
        COLLAPSE_TOOL_ARGS_CHARS,
    ),
    "summary": (
        PREVIEW_SUMMARY_LINES,
        PREVIEW_SUMMARY_CHARS,
        COLLAPSE_SUMMARY_LINES,
        COLLAPSE_SUMMARY_CHARS,
    ),
    "thinking": (None, PREVIEW_THINKING_CHARS, None, COLLAPSE_THINKING_CHARS),
    "custom": (None, PREVIEW_CUSTOM_CHARS, None, COLLAPSE_CUSTOM_CHARS),
    "system": (None, PREVIEW_THINKING_CHARS, 0, None),
    "text": (None, None, None, None),
}

_JSON_FORMAT_KINDS = frozenset({"tool_result", "custom", "tool_args"})
_MAX_JSON_PROBE_CHARS = 100_000


def count_lines(text: str) -> int:
    if not text:
        return 0
    return text.count("\n") + (0 if text.endswith("\n") else 1)


def count_bytes(text: str) -> int:
    return len(text.encode("utf-8"))


def is_json_text(text: str) -> bool:
    stripped = text.strip()
    if not stripped or stripped[0] not in "{[" or len(stripped) > _MAX_JSON_PROBE_CHARS:
        return False
    try:
        json.loads(stripped)
    except (ValueError, TypeError):
        return False
    return True


def image_byte_size(base64_data: str) -> int:
    """Approximate decoded size of base64 image data."""
    if not base64_data:
        return 0
    padding = base64_data.count("=", max(0, len(base64_data) - 2))
    return max(0, (len(base64_data) * 3) // 4 - padding)


def _take_preview(text: str, max_lines: int | None, max_chars: int | None) -> str:
    preview = text
    if max_lines is not None:
        preview = "\n".join(text.split("\n")[:max_lines])
    if max_chars is not None and len(preview) > max_chars:
        preview = preview[:max_chars]
    return preview


def summarize_text(
    text: str,
    *,
    kind: str = "text",
    is_error: bool = False,
    pi_truncation: dict[str, Any] | None = None,
) -> ContentSummary:
    """Build preview metadata for a text payload.

    ``kind`` selects the collapse thresholds: ``text`` never collapses,
    ``system`` always collapses, everything else collapses when it is long.
    """
    text = text or ""
    line_count = count_lines(text)
    char_count = len(text)
    p_lines, p_chars, c_lines, c_chars = _THRESHOLDS.get(kind, _THRESHOLDS["text"])

    if kind in ("tool_result", "bash") and is_error:
        c_lines, c_chars = ERROR_KEEP_OPEN_LINES, ERROR_KEEP_OPEN_CHARS

    collapsed = bool(pi_truncation)
    if c_lines == 0:
        collapsed = True
    elif (c_lines is not None and line_count > c_lines) or (
        c_chars is not None and char_count > c_chars
    ):
        collapsed = True

    preview = text if not collapsed else _take_preview(text, p_lines, p_chars)

    if kind == "text":
        fmt: ContentFormat = "markdown"
    elif kind == "system":
        fmt = "system"
    elif kind in _JSON_FORMAT_KINDS:
        fmt = "json" if is_json_text(text) else "code"
    elif kind == "bash":
        fmt = "code"
    else:
        fmt = "text"

    return ContentSummary(
        kind=kind,
        format=fmt,
        preview=preview,
        preview_line_count=count_lines(preview),
        line_count=line_count,
        char_count=char_count,
        byte_count=count_bytes(text),
        collapsed_by_default=collapsed,
        truncated=preview != text,
        truncated_by_pi=bool(pi_truncation),
        pi_truncation=pi_truncation or None,
    )


def summarize_json(value: Any, *, kind: str = "custom") -> ContentSummary:
    """Pretty-print JSON data and summarize it for preview rendering."""
    try:
        text = json.dumps(value, ensure_ascii=False, indent=2, default=str)
    except (TypeError, ValueError):
        text = str(value)
    summary = summarize_text(text, kind=kind)
    summary.format = "json"
    return summary


def _normalize_tool_call(block: dict[str, Any], block_index: int) -> ToolCallData:
    args = block.get("arguments")
    if isinstance(args, str):
        arguments_json = args
    else:
        try:
            arguments_json = json.dumps(args, ensure_ascii=False, default=str)
        except (TypeError, ValueError):
            arguments_json = str(args)
    tool_id = block.get("id")
    return ToolCallData(
        id=tool_id if isinstance(tool_id, str) and tool_id else f"call:{block_index}",
        name=block.get("name") if isinstance(block.get("name"), str) else "",
        arguments=args,
        arguments_json=arguments_json,
        arguments_error=block.get("argumentsError")
        if isinstance(block.get("argumentsError"), str)
        else None,
        namespace=block.get("namespace") if isinstance(block.get("namespace"), str) else None,
        thought_signature=block.get("thoughtSignature")
        if isinstance(block.get("thoughtSignature"), str)
        else None,
    )


def normalize_content_block(block: Any, *, block_index: int = 0) -> ContentBlock:
    """Normalize one raw content block. Unknown shapes are preserved in ``raw``."""
    if isinstance(block, str):
        return ContentBlock(type="text", text=block)

    if not isinstance(block, dict):
        return ContentBlock(type="unknown", raw={"value": block})

    block_type = block.get("type")
    block_type = block_type if isinstance(block_type, str) and block_type else "unknown"

    if block_type == "text":
        text = block.get("text")
        return ContentBlock(type="text", text=text if isinstance(text, str) else "")

    if block_type == "thinking":
        thinking = block.get("thinking")
        thinking_text = thinking if isinstance(thinking, str) else ""
        return ContentBlock(
            type="thinking",
            thinking=thinking_text,
            redacted=bool(block.get("redacted")),
            summary=summarize_text(thinking_text, kind="thinking"),
        )

    if block_type == "image":
        data = block.get("data") if isinstance(block.get("data"), str) else ""
        mime = block.get("mimeType") if isinstance(block.get("mimeType"), str) else ""
        return ContentBlock(
            type="image",
            image=ImageData(
                mime_type=mime or "application/octet-stream",
                data=data,
                byte_size=image_byte_size(data),
            ),
        )

    if block_type == "toolCall":
        tool_call = _normalize_tool_call(block, block_index)
        return ContentBlock(
            type="toolCall",
            tool_call=tool_call,
            summary=summarize_text(tool_call.arguments_json, kind="tool_args"),
        )

    return ContentBlock(type=block_type, raw=block)


def normalize_content(content: Any, *, role: str = "unknown") -> list[ContentBlock]:
    """Normalize a message ``content`` value into a list of blocks.

    ``None`` becomes an empty list, a string becomes one text block, an array is
    normalized block by block. ``role`` is accepted for symmetry with Pi's
    role-dependent handling and future use.
    """
    if content is None:
        return []
    if isinstance(content, str):
        return [ContentBlock(type="text", text=content)]
    if isinstance(content, list):
        blocks = [
            normalize_content_block(block, block_index=index)
            for index, block in enumerate(content)
        ]
        summarize_blocks(blocks)
        return blocks
    return [ContentBlock(type="text", text=str(content))]


def summarize_blocks(blocks: list[ContentBlock]) -> None:
    """Fill in block-level summaries where they are missing."""
    for block in blocks:
        if block.summary is not None:
            continue
        if block.type == "thinking":
            block.summary = summarize_text(block.thinking or "", kind="thinking")
        elif block.type == "toolCall" and block.tool_call is not None:
            block.summary = summarize_text(block.tool_call.arguments_json, kind="tool_args")


def extract_text(content: Any) -> str:
    """Join text blocks with a single space (Pi's session-list behavior)."""
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, ContentBlock):
                if block.type == "text" and block.text:
                    parts.append(block.text)
            elif isinstance(block, str):
                parts.append(block)
        return " ".join(parts)
    return str(content)


def extract_first_text(content: Any) -> str | None:
    """Return the first non-empty text block, or ``None``."""
    if isinstance(content, str):
        return content or None
    if isinstance(content, list):
        for block in content:
            text = block.text if isinstance(block, ContentBlock) else block
            if isinstance(text, str) and text.strip():
                return text
    return None


def build_search_text(blocks: list[ContentBlock]) -> str:
    """Lowercased searchable text. Excludes base64 image data and signatures."""
    parts: list[str] = []
    for block in blocks:
        if block.type == "text" and block.text:
            parts.append(block.text)
        elif block.type == "thinking" and block.thinking:
            parts.append(block.thinking)
        elif block.type == "toolCall" and block.tool_call is not None:
            parts.append(block.tool_call.name)
            parts.append(block.tool_call.arguments_json)
        elif block.type not in ("image", "text", "thinking", "toolCall") and block.raw:
            parts.append(json.dumps(block.raw, ensure_ascii=False, default=str))
    return " ".join(parts).lower()
