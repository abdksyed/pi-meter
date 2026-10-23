"""API-boundary formatting helpers.

Costs are stored as integer micro-units everywhere in the backend. They are
converted to decimal currency units only here, immediately before being put in
a response schema. The frontend owns presentation formatting; the ``format_*``
helpers exist only for the optional ``*Formatted`` summary fields.
"""

from __future__ import annotations

from app.db import MICRO_PER_UNIT


def micro_to_cost(micro: int | None) -> float:
    """Convert integer micro-units to decimal currency units."""
    if not micro:
        return 0.0
    return round(micro / MICRO_PER_UNIT, 6)


def cost_to_micro(value: float | int | str | None) -> int:
    """Convert a decimal currency amount to integer micro-units."""
    if value is None:
        return 0
    return int(round(float(value) * MICRO_PER_UNIT))


def format_tokens(value: int | None) -> str:
    """Compact token count for optional formatted fields (``1.2M``)."""
    tokens = int(value or 0)
    if tokens >= 1_000_000_000:
        return f"{tokens / 1_000_000_000:.1f}B"
    if tokens >= 1_000_000:
        return f"{tokens / 1_000_000:.1f}M"
    if tokens >= 1_000:
        return f"{tokens / 1_000:.1f}K"
    return str(tokens)


def format_cost(value: float | None) -> str:
    """Currency string for optional formatted fields (``$1.23``)."""
    return f"${float(value or 0):,.2f}"
