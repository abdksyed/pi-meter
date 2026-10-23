"""Normalized data models produced by the Pi session parser.

Pure data containers only: no I/O and no normalization logic.

Conventions
-----------
- Timestamps are UTC epoch milliseconds in every ``*_ms`` field.
  ``timestamp_raw`` keeps the original ISO string from the file.
- Costs are integer micro-units of the recorded currency (1 unit = 1e-6).
- ``raw`` always holds the exact JSON object read from the file. Normalization
  never mutates or drops unknown fields.
- Entries are kept in raw file order. ``entry_index`` is the stable 0-based
  order key (header excluded); ``line_number`` is the 1-based physical line.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

ParseSeverity = Literal["info", "warning", "error"]
ParseStatus = Literal["ok", "partial", "error"]
TitleSource = Literal["session_info", "first_user_message", "fallback"]
ModelSource = Literal["recorded", "attributed"]
UsageSource = Literal[
    "assistant", "tool_result", "usage", "compaction", "branch_summary", "other"
]
ContentFormat = Literal["text", "markdown", "json", "code", "image", "system"]

UNTITLED_TITLE = "(untitled session)"

#: Every entry type the parser normalizes explicitly. Anything else is unknown.
KNOWN_ENTRY_TYPES = frozenset(
    {
        "session",
        "message",
        "model_change",
        "thinking_level_change",
        "usage",
        "compaction",
        "context_edit",
        "branch_summary",
        "custom",
        "custom_message",
        "label",
        "session_info",
    }
)


@dataclass(slots=True)
class ParseIssue:
    """A non-fatal or fatal problem found while parsing."""

    line_number: int
    entry_index: int | None
    severity: ParseSeverity
    code: str
    message: str
    raw_excerpt: str | None = None


@dataclass(slots=True)
class ContentSummary:
    """Preview metadata for long content. The full content is always retained."""

    kind: str
    format: ContentFormat
    preview: str
    preview_line_count: int
    line_count: int
    char_count: int
    byte_count: int
    collapsed_by_default: bool
    truncated: bool
    truncated_by_pi: bool = False
    pi_truncation: dict[str, Any] | None = None


@dataclass(slots=True)
class ToolCallData:
    id: str
    name: str
    arguments: Any
    arguments_json: str
    arguments_error: str | None = None
    namespace: str | None = None
    thought_signature: str | None = None


@dataclass(slots=True)
class ImageData:
    mime_type: str
    data: str
    byte_size: int


@dataclass(slots=True)
class ContentBlock:
    """One normalized message content block.

    ``raw`` is populated for unrecognized block types only; known blocks keep
    the entry-level raw JSON as the lossless source.
    """

    type: str
    text: str | None = None
    thinking: str | None = None
    redacted: bool = False
    tool_call: ToolCallData | None = None
    image: ImageData | None = None
    summary: ContentSummary | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class SystemPromptData:
    content_text: str
    sections: dict[str, str | None] = field(default_factory=dict)
    section_names: list[str] = field(default_factory=list)
    tools_added: list[Any] = field(default_factory=list)
    tools_removed: list[Any] = field(default_factory=list)
    tools_added_names: list[str] = field(default_factory=list)
    tools_removed_names: list[str] = field(default_factory=list)


@dataclass(slots=True)
class BashExecutionData:
    command: str
    output: str
    exit_code: int | None = None
    cancelled: bool = False
    truncated: bool = False
    full_output_path: str | None = None
    exclude_from_context: bool = False


@dataclass(slots=True)
class MessageData:
    role: str
    content: list[ContentBlock] = field(default_factory=list)
    timestamp_ms: int | None = None
    api: str | None = None
    provider: str | None = None
    model: str | None = None
    response_model: str | None = None
    response_id: str | None = None
    thinking_level: str | None = None
    provider_thinking_level: str | None = None
    usage: UsageRecord | None = None
    stop_reason: str | None = None
    raw_stop_reason: str | None = None
    error_message: str | None = None
    duration_ms: int | None = None
    tool_call_id: str | None = None
    tool_name: str | None = None
    is_error: bool = False
    details: Any = None
    nested_calls: Any = None
    system: SystemPromptData | None = None
    bash: BashExecutionData | None = None
    custom_type: str | None = None
    display: bool | None = None
    summary: str | None = None
    from_id: str | None = None
    tokens_before: int | None = None


@dataclass(slots=True)
class ModelChangeData:
    provider: str | None = None
    model_id: str | None = None
    previous_provider: str | None = None
    previous_model_id: str | None = None


@dataclass(slots=True)
class ThinkingLevelChangeData:
    thinking_level: str | None = None
    previous_thinking_level: str | None = None


@dataclass(slots=True)
class UsageEntryData:
    kind: str = "unknown"
    provider: str | None = None
    model: str | None = None
    usage: UsageRecord | None = None
    note: str | None = None


@dataclass(slots=True)
class CompactionData:
    summary: str = ""
    first_kept_entry_id: str | None = None
    first_kept_entry_index: int | None = None
    tokens_before: int = 0
    usage: UsageRecord | None = None
    details: Any = None
    from_hook: bool | None = None
    system_message_raw: dict[str, Any] | None = None
    read_files: list[str] = field(default_factory=list)
    modified_files: list[str] = field(default_factory=list)


@dataclass(slots=True)
class ContextEditData:
    target_id: str | None = None
    target_entry_index: int | None = None
    target_role: str | None = None
    replacement_content: list[ContentBlock] | None = None
    replacement_summary: ContentSummary | None = None
    omitted: bool = False


@dataclass(slots=True)
class BranchSummaryData:
    from_id: str | None = None
    from_entry_index: int | None = None
    summary: str = ""
    usage: UsageRecord | None = None
    details: Any = None
    from_hook: bool | None = None
    read_files: list[str] = field(default_factory=list)
    modified_files: list[str] = field(default_factory=list)


@dataclass(slots=True)
class CustomData:
    custom_type: str = ""
    data: Any = None


@dataclass(slots=True)
class CustomMessageData:
    custom_type: str = ""
    content: list[ContentBlock] = field(default_factory=list)
    display: bool = True
    details: Any = None


@dataclass(slots=True)
class LabelData:
    target_id: str | None = None
    target_entry_index: int | None = None
    label: str | None = None
    cleared: bool = False


@dataclass(slots=True)
class SessionInfoData:
    name: str | None = None
    cleared: bool = False


@dataclass(slots=True)
class UnknownData:
    raw_type: str | None = None


@dataclass(slots=True)
class UsageTokens:
    input: int = 0
    output: int = 0
    reasoning: int = 0
    cache_read: int = 0
    cache_write: int = 0
    cache_write_1h: int = 0
    total: int = 0


@dataclass(slots=True)
class UsageCost:
    input_micro: int = 0
    output_micro: int = 0
    cache_read_micro: int = 0
    cache_write_micro: int = 0
    total_micro: int = 0


@dataclass(slots=True)
class UsageRecord:
    entry_id: str | None
    entry_index: int
    source: UsageSource
    kind: str | None
    provider: str | None
    model: str | None
    model_source: ModelSource
    timestamp_ms: int | None
    tokens: UsageTokens = field(default_factory=UsageTokens)
    cost: UsageCost = field(default_factory=UsageCost)
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class UsageTotals:
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cache_write_1h_tokens: int = 0
    total_tokens: int = 0
    cost_input_micro: int = 0
    cost_output_micro: int = 0
    cost_cache_read_micro: int = 0
    cost_cache_write_micro: int = 0
    cost_total_micro: int = 0


@dataclass(slots=True)
class LabelInfo:
    target_id: str
    target_entry_index: int | None
    label: str
    timestamp_ms: int | None
    entry_index: int


@dataclass(slots=True)
class ModelRef:
    provider: str | None
    model: str | None


@dataclass(slots=True)
class ModelUsageSummary:
    provider: str | None
    model: str | None
    usage_entry_count: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cost_total_micro: int = 0


@dataclass(slots=True)
class SessionCounts:
    entry_count: int = 0
    message_count: int = 0
    user_message_count: int = 0
    assistant_message_count: int = 0
    tool_result_count: int = 0
    system_message_count: int = 0
    tool_call_count: int = 0
    model_change_count: int = 0
    thinking_level_change_count: int = 0
    usage_entry_count: int = 0
    compaction_count: int = 0
    context_edit_count: int = 0
    branch_summary_count: int = 0
    custom_count: int = 0
    custom_message_count: int = 0
    label_count: int = 0
    session_info_count: int = 0
    unknown_entry_count: int = 0


@dataclass(slots=True)
class ParsedEntry:
    """One non-header JSONL entry, normalized but lossless via ``raw``."""

    entry_index: int
    line_number: int
    entry_type: str
    entry_id: str | None = None
    parent_id: str | None = None
    parent_entry_index: int | None = None
    child_count: int = 0
    is_branch_point: bool = False
    timestamp_ms: int | None = None
    timestamp_raw: str | None = None
    message_started_at_ms: int | None = None
    role: str | None = None
    provider: str | None = None
    model: str | None = None
    model_source: ModelSource | None = None
    thinking_level: str | None = None
    tool_name: str | None = None
    tool_call_id: str | None = None
    is_error: bool = False
    duration_ms: int | None = None
    message: MessageData | None = None
    model_change: ModelChangeData | None = None
    thinking_level_change: ThinkingLevelChangeData | None = None
    usage_entry: UsageEntryData | None = None
    compaction: CompactionData | None = None
    context_edit: ContextEditData | None = None
    branch_summary: BranchSummaryData | None = None
    custom: CustomData | None = None
    custom_message: CustomMessageData | None = None
    label: LabelData | None = None
    session_info: SessionInfoData | None = None
    unknown: UnknownData | None = None
    usage: UsageRecord | None = None
    usage_records: list[UsageRecord] = field(default_factory=list)
    content_summary: ContentSummary | None = None
    search_text: str = ""
    raw: dict[str, Any] = field(default_factory=dict)
    issues: list[ParseIssue] = field(default_factory=list)


@dataclass(slots=True)
class ParsedSessionHeader:
    session_id: str
    version: int = 1
    timestamp_ms: int | None = None
    timestamp_raw: str | None = None
    cwd: str = ""
    parent_session_path: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass(slots=True)
class ParsedSession:
    """Everything the parser knows about one session JSONL file."""

    header: ParsedSessionHeader | None = None
    entries: list[ParsedEntry] = field(default_factory=list)
    usage_records: list[UsageRecord] = field(default_factory=list)
    labels: dict[str, LabelInfo] = field(default_factory=dict)
    name: str | None = None
    title: str = UNTITLED_TITLE
    title_source: TitleSource = "fallback"
    first_user_message: str | None = None
    started_at_ms: int | None = None
    last_activity_at_ms: int | None = None
    duration_ms: int | None = None
    models_seen: list[ModelRef] = field(default_factory=list)
    models_with_usage: list[ModelUsageSummary] = field(default_factory=list)
    totals: UsageTotals = field(default_factory=UsageTotals)
    counts: SessionCounts = field(default_factory=SessionCounts)
    issues: list[ParseIssue] = field(default_factory=list)
    parse_status: ParseStatus = "ok"
    parse_error: str | None = None
    file_path: Path | None = None
    file_size: int = 0
    file_mtime_ns: int = 0

    @property
    def session_id(self) -> str | None:
        return self.header.session_id if self.header else None

    @property
    def cwd(self) -> str:
        return self.header.cwd if self.header else ""

    @property
    def version(self) -> int:
        return self.header.version if self.header else 1

    @property
    def parent_session_path(self) -> str | None:
        return self.header.parent_session_path if self.header else None
