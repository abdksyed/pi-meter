"""Date-range parsing and local-time bucketing.

Presets (``today``, ``7d``, ``30d``, ``all``) are resolved against the machine's
local timezone, then converted to UTC epoch milliseconds for SQL comparisons.
Custom ranges arrive as local calendar dates (``YYYY-MM-DD``) and cover the
whole end day. Every aggregate response echoes the applied range and timezone.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone, tzinfo

from app.db import now_ms
from app.errors import InvalidRangeError
from app.schemas import RangeMeta

RANGE_KEYS = ("today", "7d", "30d", "all", "custom")
GROUP_KEYS = ("hour", "day", "week", "month")


def local_timezone() -> tzinfo:
    try:
        from tzlocal import get_localzone

        return get_localzone()
    except Exception:  # pragma: no cover - tzlocal is a dependency
        return datetime.now().astimezone().tzinfo or timezone.utc


def timezone_name(tz: tzinfo) -> str:
    return str(getattr(tz, "key", None) or getattr(tz, "zone", None) or tz)


def _local_midnight(day: date, tz: tzinfo) -> datetime:
    return datetime.combine(day, time.min, tzinfo=tz)


def _to_ms(value: datetime) -> int:
    return int(value.timestamp() * 1000)


@dataclass(frozen=True)
class RangeSpec:
    key: str
    start_ms: int | None
    end_ms: int
    tz: tzinfo
    timezone: str
    group_by: str

    def meta(self, group_by: str | None = None) -> RangeMeta:
        return RangeMeta(
            range_=self.key,
            start=self.start_ms,
            end=self.end_ms,
            timezone=self.timezone,
            group_by=group_by or self.group_by,
        )


def _parse_date(value: str, field: str) -> date:
    try:
        return date.fromisoformat(value.strip()[:10])
    except (ValueError, AttributeError) as exc:
        raise InvalidRangeError(f"invalid {field} date: {value!r}") from exc


def _default_group_by(key: str) -> str:
    if key == "today":
        return "hour"
    if key == "all":
        return "week"
    return "day"


def parse_range(
    range_key: str | None,
    from_value: str | None = None,
    to_value: str | None = None,
    group_by: str | None = None,
    *,
    now: int | None = None,
) -> RangeSpec:
    key = (range_key or "7d").strip().lower()
    if key not in RANGE_KEYS:
        raise InvalidRangeError(f"unknown range: {range_key!r}")
    if group_by:
        group_by = group_by.strip().lower()
        if group_by not in GROUP_KEYS:
            raise InvalidRangeError(f"unknown groupBy: {group_by!r}")
    group = group_by or _default_group_by(key)

    tz = local_timezone()
    current_ms = now if now is not None else now_ms()
    today = datetime.fromtimestamp(current_ms / 1000, tz=tz).date()

    if key == "custom":
        if not from_value or not to_value:
            raise InvalidRangeError("custom range requires from and to")
        start_day = _parse_date(from_value, "from")
        end_day = _parse_date(to_value, "to")
        if end_day < start_day:
            raise InvalidRangeError("custom range end is before start")
        start_ms = _to_ms(_local_midnight(start_day, tz))
        end_ms = _to_ms(_local_midnight(end_day + timedelta(days=1), tz))
    elif key == "all":
        start_ms = None
        end_ms = current_ms
    else:
        days = {"today": 0, "7d": 6, "30d": 29}[key]
        start_ms = _to_ms(_local_midnight(today - timedelta(days=days), tz))
        end_ms = current_ms

    return RangeSpec(
        key=key,
        start_ms=start_ms,
        end_ms=end_ms,
        tz=tz,
        timezone=timezone_name(tz),
        group_by=group,
    )


# --------------------------------------------------------------------------- #
# Buckets
# --------------------------------------------------------------------------- #


def floor_bucket(moment: datetime, group_by: str) -> datetime:
    if group_by == "hour":
        return moment.replace(minute=0, second=0, microsecond=0)
    midnight = moment.replace(hour=0, minute=0, second=0, microsecond=0)
    if group_by == "day":
        return midnight
    if group_by == "week":
        return midnight - timedelta(days=midnight.weekday())
    if group_by == "month":
        return midnight.replace(day=1)
    return midnight


def advance_bucket(moment: datetime, group_by: str) -> datetime:
    if group_by == "hour":
        return moment + timedelta(hours=1)
    if group_by == "day":
        return moment + timedelta(days=1)
    if group_by == "week":
        return moment + timedelta(days=7)
    if group_by == "month":
        return (moment.replace(day=28) + timedelta(days=4)).replace(day=1)
    return moment + timedelta(days=1)


def bucket_label(moment: datetime, group_by: str) -> str:
    if group_by == "hour":
        return moment.isoformat(timespec="seconds")
    if group_by == "week":
        return moment.strftime("%G-W%V")
    if group_by == "month":
        return moment.strftime("%Y-%m")
    return moment.strftime("%Y-%m-%d")


def label_for_timestamp(timestamp_ms: int, group_by: str, tz: tzinfo) -> str:
    moment = datetime.fromtimestamp(timestamp_ms / 1000, tz=tz)
    return bucket_label(floor_bucket(moment, group_by), group_by)


def iter_bucket_labels(
    spec: RangeSpec, group_by: str, first_ms: int | None = None
) -> list[str]:
    """Ordered, zero-fillable bucket labels covering the range."""
    end_ms = spec.end_ms
    start_ms = spec.start_ms if spec.start_ms is not None else first_ms
    if start_ms is None or end_ms <= start_ms:
        return []
    start = floor_bucket(datetime.fromtimestamp(start_ms / 1000, tz=spec.tz), group_by)
    end = datetime.fromtimestamp(end_ms / 1000, tz=spec.tz)
    labels: list[str] = []
    cursor = start
    while cursor < end and len(labels) < 5000:
        labels.append(bucket_label(cursor, group_by))
        cursor = advance_bucket(cursor, group_by)
    return labels
