"""Usage extraction, cost conversion, and usage totals.

Pi records usage objects in several places. This module guarantees that each
logical entry contributes its usage exactly once, converts recorded costs to
integer micro-units with :class:`~decimal.Decimal` (never binary floats), and
sums records without ever adding ``reasoning`` or ``cacheWrite1h`` twice.
"""

from __future__ import annotations

import json
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Any, Iterable

from .parser_models import (
    ModelSource,
    UsageCost,
    UsageRecord,
    UsageSource,
    UsageTokens,
    UsageTotals,
)

MICRO_PER_UNIT = 1_000_000


def cost_to_micro(value: Any) -> int:
    """Convert a recorded cost to millionths, rounding half up.

    ``0.0012297`` -> ``1230``. Invalid or non-finite values become ``0``.
    Negative values are preserved (they are recorded data, not a bug to hide).
    """
    if value is None or isinstance(value, bool):
        return 0
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return 0
    if not amount.is_finite():
        return 0
    return int((amount * MICRO_PER_UNIT).to_integral_value(rounding=ROUND_HALF_UP))


def token_to_int(value: Any) -> int:
    """Coerce a token count to a non-negative integer (``0`` when invalid)."""
    if value is None or isinstance(value, bool):
        return 0
    if isinstance(value, (int, float)):
        return max(0, int(value))
    try:
        return max(0, int(str(value).strip()))
    except (TypeError, ValueError):
        return 0


def usage_total_tokens(tokens: UsageTokens) -> int:
    """Recorded total if present, else input + output + cacheRead + cacheWrite.

    ``reasoning`` is a subset of ``output`` and is never added here.
    """
    if tokens.total:
        return tokens.total
    return tokens.input + tokens.output + tokens.cache_read + tokens.cache_write


def normalize_usage(
    raw: dict[str, Any],
    *,
    source: UsageSource,
    entry_id: str | None,
    entry_index: int,
    provider: str | None,
    model: str | None,
    model_source: ModelSource,
    timestamp_ms: int | None,
    kind: str | None = None,
) -> UsageRecord | None:
    """Normalize one raw Pi usage object into a :class:`UsageRecord`."""
    if not isinstance(raw, dict):
        return None

    tokens = UsageTokens(
        input=token_to_int(raw.get("input")),
        output=token_to_int(raw.get("output")),
        reasoning=token_to_int(raw.get("reasoning")),
        cache_read=token_to_int(raw.get("cacheRead")),
        cache_write=token_to_int(raw.get("cacheWrite")),
        cache_write_1h=token_to_int(raw.get("cacheWrite1h")),
        total=token_to_int(raw.get("totalTokens")),
    )

    cost_raw = raw.get("cost") if isinstance(raw.get("cost"), dict) else {}
    cost_input = cost_to_micro(cost_raw.get("input"))
    cost_output = cost_to_micro(cost_raw.get("output"))
    cost_cache_read = cost_to_micro(cost_raw.get("cacheRead"))
    cost_cache_write = cost_to_micro(cost_raw.get("cacheWrite"))
    recorded_total = cost_raw.get("total")
    cost_total = (
        cost_to_micro(recorded_total)
        if recorded_total is not None
        else cost_input + cost_output + cost_cache_read + cost_cache_write
    )

    return UsageRecord(
        entry_id=entry_id,
        entry_index=entry_index,
        source=source,
        kind=kind,
        provider=provider,
        model=model,
        model_source=model_source,
        timestamp_ms=timestamp_ms,
        tokens=tokens,
        cost=UsageCost(
            input_micro=cost_input,
            output_micro=cost_output,
            cache_read_micro=cost_cache_read,
            cache_write_micro=cost_cache_write,
            total_micro=cost_total,
        ),
        raw=raw,
    )


def _canonical(usage: dict[str, Any]) -> str:
    return json.dumps(usage, sort_keys=True, ensure_ascii=False, default=str)


def extract_usage_records(
    raw: dict[str, Any],
    *,
    entry_index: int,
    entry_id: str | None = None,
    provider: str | None = None,
    model: str | None = None,
    model_source: ModelSource = "recorded",
    timestamp_ms: int | None = None,
) -> list[UsageRecord]:
    """Extract the usage record(s) for one raw entry.

    Priority (exactly one object per known entry type):

    - ``message`` entries use ``message.usage`` only; a top-level ``usage`` on
      the same entry is ignored so nothing is counted twice.
    - ``usage``, ``compaction`` and ``branch_summary`` entries use the
      top-level ``usage``.
    - Unknown entries use ``message.usage`` first, else top-level ``usage``.
    - Everything else (``model_change``, ``thinking_level_change``, ``label``,
      ``session_info``, ``custom`` ...) contributes no usage.
    """
    entry_type = raw.get("type")
    message = raw.get("message") if isinstance(raw.get("message"), dict) else None

    candidates: list[tuple[dict[str, Any], UsageSource, str | None]] = []
    if entry_type == "message":
        role = message.get("role") if message else None
        if role == "assistant":
            source: UsageSource = "assistant"
        elif role == "toolResult":
            source = "tool_result"
        else:
            source = "other"
        if message and isinstance(message.get("usage"), dict):
            candidates.append((message["usage"], source, None))
    elif entry_type == "usage":
        if isinstance(raw.get("usage"), dict):
            kind = raw.get("kind")
            candidates.append(
                (raw["usage"], "usage", kind if isinstance(kind, str) else None)
            )
    elif entry_type == "compaction":
        if isinstance(raw.get("usage"), dict):
            candidates.append((raw["usage"], "compaction", None))
    elif entry_type == "branch_summary":
        if isinstance(raw.get("usage"), dict):
            candidates.append((raw["usage"], "branch_summary", None))
    elif message and isinstance(message.get("usage"), dict):
        candidates.append((message["usage"], "other", None))
    elif isinstance(raw.get("usage"), dict):
        candidates.append((raw["usage"], "other", None))

    records: list[UsageRecord] = []
    seen: set[str] = set()
    for usage, source, kind in candidates:
        key = _canonical(usage)
        if key in seen:
            continue
        seen.add(key)
        record = normalize_usage(
            usage,
            source=source,
            entry_id=entry_id,
            entry_index=entry_index,
            provider=provider,
            model=model,
            model_source=model_source,
            timestamp_ms=timestamp_ms,
            kind=kind,
        )
        if record is not None:
            records.append(record)
    return records


def dedupe_usage(records: Iterable[UsageRecord]) -> list[UsageRecord]:
    """Drop exact duplicates (same entry and same canonical usage object)."""
    result: list[UsageRecord] = []
    seen: set[tuple[str | None, int, str]] = set()
    for record in records:
        key = (record.entry_id, record.entry_index, _canonical(record.raw))
        if key in seen:
            continue
        seen.add(key)
        result.append(record)
    return result


def sum_usage(records: Iterable[UsageRecord]) -> UsageTotals:
    """Sum usage records once each into session totals."""
    totals = UsageTotals()
    for record in records:
        tokens = record.tokens
        cost = record.cost
        totals.input_tokens += tokens.input
        totals.output_tokens += tokens.output
        totals.reasoning_tokens += tokens.reasoning
        totals.cache_read_tokens += tokens.cache_read
        totals.cache_write_tokens += tokens.cache_write
        totals.cache_write_1h_tokens += tokens.cache_write_1h
        totals.total_tokens += usage_total_tokens(tokens)
        totals.cost_input_micro += cost.input_micro
        totals.cost_output_micro += cost.output_micro
        totals.cost_cache_read_micro += cost.cache_read_micro
        totals.cost_cache_write_micro += cost.cache_write_micro
        totals.cost_total_micro += cost.total_micro
    return totals
