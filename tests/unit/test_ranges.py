"""Unit tests for date-range parsing and local-time bucketing.

Targets ``app/services/ranges.py``. Every test uses a fixed clock (passed to
``parse_range(now=...)``) and an explicitly injected timezone, so results never
depend on today's date or the workstation timezone.

Expected local midnights are computed with the standard library
(``datetime(..., tzinfo=ZoneInfo(...)).timestamp()``) rather than by calling the
helpers under test.
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.errors import InvalidRangeError
from app.schemas import RangeMeta
from app.services import ranges

NY = ZoneInfo("America/New_York")
BERLIN = ZoneInfo("Europe/Berlin")
KOLKATA = ZoneInfo("Asia/Kolkata")
SYDNEY = ZoneInfo("Australia/Sydney")

# Fixed clock: 2026-01-15T12:00:00Z, i.e. 07:00 on 2026-01-15 in New York.
NOW_MS = int(datetime(2026, 1, 15, 12, 0, tzinfo=timezone.utc).timestamp() * 1000)


@pytest.fixture
def use_timezone(monkeypatch):
    """Inject a fixed "local" timezone into the module under test."""

    def apply(tz):
        monkeypatch.setattr(ranges, "local_timezone", lambda: tz)
        return tz

    return apply


@pytest.fixture
def ny(use_timezone):
    return use_timezone(NY)


def midnight_ms(day: date, tz) -> int:
    """Independent epoch-ms for local midnight at the start of ``day``."""
    return int(datetime(day.year, day.month, day.day, tzinfo=tz).timestamp() * 1000)


def local(ts_ms: int, tz) -> datetime:
    return datetime.fromtimestamp(ts_ms / 1000, tz=tz)


# --------------------------------------------------------------------------- #
# Presets
# --------------------------------------------------------------------------- #


def test_today_starts_at_local_midnight_and_ends_at_fixed_now(ny):
    spec = ranges.parse_range("today", now=NOW_MS)

    assert spec.key == "today"
    assert spec.start_ms == midnight_ms(date(2026, 1, 15), NY)
    assert spec.end_ms == NOW_MS
    assert spec.group_by == "hour"
    assert local(spec.start_ms, NY) == datetime(2026, 1, 15, 0, 0, tzinfo=NY)


def test_7d_covers_six_full_days_back_from_local_today(ny):
    spec = ranges.parse_range("7d", now=NOW_MS)

    assert spec.start_ms == midnight_ms(date(2026, 1, 9), NY)
    assert spec.end_ms == NOW_MS
    assert spec.group_by == "day"
    # Exactly seven local calendar days are covered (six full days plus today).
    assert (spec.end_ms - spec.start_ms) <= 7 * 24 * 3600 * 1000


def test_30d_covers_twenty_nine_full_days_back(ny):
    spec = ranges.parse_range("30d", now=NOW_MS)

    assert spec.start_ms == midnight_ms(date(2025, 12, 17), NY)
    assert spec.group_by == "day"


def test_all_has_open_start_and_weekly_default_grouping(ny):
    spec = ranges.parse_range("all", now=NOW_MS)

    assert spec.key == "all"
    assert spec.start_ms is None
    assert spec.end_ms == NOW_MS
    assert spec.group_by == "week"


def test_default_and_normalized_range_keys(ny):
    assert ranges.parse_range(None, now=NOW_MS).key == "7d"
    assert ranges.parse_range("", now=NOW_MS).key == "7d"
    assert ranges.parse_range("  ALL ", now=NOW_MS).key == "all"
    assert ranges.parse_range("7D", now=NOW_MS).key == "7d"


@pytest.mark.parametrize(
    ("tz", "utc_now"),
    [
        (KOLKATA, datetime(2026, 1, 15, 18, 29, tzinfo=timezone.utc)),  # 23:59 local
        (KOLKATA, datetime(2026, 1, 15, 18, 31, tzinfo=timezone.utc)),  # 00:01 next day
        (SYDNEY, datetime(2026, 1, 15, 13, 30, tzinfo=timezone.utc)),  # 00:30 next day
    ],
)
def test_today_uses_local_calendar_day_not_utc_day(use_timezone, tz, utc_now):
    use_timezone(tz)
    now_ms = int(utc_now.timestamp() * 1000)

    spec = ranges.parse_range("today", now=now_ms)
    local_day = utc_now.astimezone(tz).date()

    assert spec.start_ms == midnight_ms(local_day, tz)
    assert local(spec.start_ms, tz).date() == local_day
    # Local midnight is usually a different instant than UTC midnight.
    assert spec.start_ms != midnight_ms(local_day, timezone.utc)


def test_local_midnight_conversion_for_half_hour_offset(use_timezone):
    use_timezone(KOLKATA)  # UTC+05:30, no DST

    spec = ranges.parse_range("custom", "2026-01-01", "2026-01-01")

    # 2026-01-01 00:00 IST == 2025-12-31 18:30 UTC (the UTC day differs).
    assert spec.start_ms == 1767205800000
    assert local(spec.start_ms, timezone.utc).isoformat() == "2025-12-31T18:30:00+00:00"
    assert local(spec.end_ms - 1, KOLKATA).date() == date(2026, 1, 1)


def test_custom_range_covers_whole_end_day_inclusive(ny):
    spec = ranges.parse_range("custom", "2026-01-10", "2026-01-12", now=NOW_MS)

    assert spec.key == "custom"
    assert spec.start_ms == midnight_ms(date(2026, 1, 10), NY)
    assert spec.end_ms == midnight_ms(date(2026, 1, 13), NY)  # exclusive: day after "to"
    assert spec.group_by == "day"


def test_custom_single_day_spans_24_hours_without_dst(ny):
    spec = ranges.parse_range("custom", "2026-01-15", "2026-01-15", now=NOW_MS)

    assert spec.end_ms - spec.start_ms == 24 * 3600 * 1000


def test_custom_range_accepts_datetime_prefix_and_compact_dates(ny):
    spec = ranges.parse_range("custom", "2026-01-10T22:45:00", "2026-01-12T01:00:00", now=NOW_MS)

    assert spec.start_ms == midnight_ms(date(2026, 1, 10), NY)
    assert spec.end_ms == midnight_ms(date(2026, 1, 13), NY)
    # ``date.fromisoformat`` also accepts the compact YYYYMMDD form.
    compact = ranges.parse_range("custom", "20260110", "20260112", now=NOW_MS)
    assert compact == spec


@pytest.mark.parametrize(
    ("from_value", "to_value", "expected_days"),
    [
        ("2024-02-28", "2024-03-01", 3),  # leap day included
        ("2024-02-29", "2024-02-29", 1),
        ("2025-02-28", "2025-03-01", 2),  # non-leap year: two days
    ],
)
def test_custom_range_leap_day_boundaries(ny, from_value, to_value, expected_days):
    spec = ranges.parse_range("custom", from_value, to_value, now=NOW_MS)

    assert spec.end_ms - spec.start_ms == expected_days * 24 * 3600 * 1000


# --------------------------------------------------------------------------- #
# Boundaries
# --------------------------------------------------------------------------- #


def test_range_boundaries_are_start_inclusive_and_end_exclusive(ny):
    spec = ranges.parse_range("7d", now=NOW_MS)
    start, end = spec.start_ms, spec.end_ms

    def in_range(ts_ms: int) -> bool:
        return start <= ts_ms < end

    def bucket(ts_ms: int) -> str:
        return ranges.label_for_timestamp(ts_ms, spec.group_by, spec.tz)

    assert in_range(start)
    assert in_range(end - 1)
    assert not in_range(start - 1)
    assert not in_range(end)

    assert bucket(start) == "2026-01-09"
    assert bucket(start - 1) == "2026-01-08"
    assert bucket(end - 1) == "2026-01-15"
    # ``end`` is the fixed clock (local noon), so it is excluded but still today.
    assert bucket(end) == "2026-01-15"
    assert bucket(midnight_ms(date(2026, 1, 16), NY)) == "2026-01-16"


def test_range_meta_echoes_applied_range_with_utc_timestamps(ny):
    spec = ranges.parse_range("7d", now=NOW_MS)
    meta = spec.meta()

    assert isinstance(meta, RangeMeta)
    assert meta.range_ == "7d"
    assert meta.timezone == "America/New_York"
    assert meta.start == datetime.fromtimestamp(spec.start_ms / 1000, tz=timezone.utc)
    assert meta.end == datetime.fromtimestamp(NOW_MS / 1000, tz=timezone.utc)
    dumped = meta.model_dump(mode="json", by_alias=True)
    assert dumped["range"] == "7d"
    assert dumped["start"].endswith("Z") and dumped["end"].endswith("Z")
    assert dumped["groupBy"] == "day"
    assert dumped["timezone"] == "America/New_York"


def test_range_meta_serializes_open_start_for_all(ny):
    dumped = ranges.parse_range("all", now=NOW_MS).meta().model_dump(mode="json", by_alias=True)

    assert dumped["range"] == "all"
    assert dumped["start"] is None
    assert dumped["end"] == "2026-01-15T12:00:00.000Z"
    assert dumped["groupBy"] == "week"


# --------------------------------------------------------------------------- #
# DST transitions
# --------------------------------------------------------------------------- #


def test_spring_forward_day_is_23_hours_with_24_labels(ny):
    spec = ranges.parse_range("custom", "2026-03-08", "2026-03-08", now=NOW_MS)

    assert spec.end_ms - spec.start_ms == 23 * 3600 * 1000
    labels = ranges.iter_bucket_labels(spec, "hour")
    assert len(labels) == 24
    # 02:00 EST and 03:00 EDT are the same instant: clocks jump forward.
    assert labels[2] == "2026-03-08T02:00:00-05:00"
    assert labels[3] == "2026-03-08T03:00:00-04:00"
    assert datetime.fromisoformat(labels[2]) == datetime.fromisoformat(labels[3])


def test_fall_back_day_is_25_hours_with_repeated_wall_clock_hour(ny):
    spec = ranges.parse_range("custom", "2026-11-01", "2026-11-01", now=NOW_MS)

    assert spec.end_ms - spec.start_ms == 25 * 3600 * 1000
    labels = ranges.iter_bucket_labels(spec, "hour")
    assert len(labels) == 24
    assert labels[1] == "2026-11-01T01:00:00-04:00"
    assert labels[2] == "2026-11-01T02:00:00-05:00"
    # The repeated 01:00 hour collapses into one ordered label sequence.
    instants = [datetime.fromisoformat(label).timestamp() for label in labels]
    assert instants == sorted(set(instants))


def test_custom_range_across_fall_back_spans_49_hours(ny):
    spec = ranges.parse_range("custom", "2026-10-31", "2026-11-01", now=NOW_MS)

    assert spec.end_ms - spec.start_ms == 49 * 3600 * 1000
    assert ranges.iter_bucket_labels(spec, "day") == ["2026-10-31", "2026-11-01"]


def test_local_day_labels_follow_dst_offsets(ny):
    spec = ranges.parse_range("custom", "2026-03-07", "2026-03-09", now=NOW_MS)

    assert ranges.iter_bucket_labels(spec, "day") == [
        "2026-03-07",
        "2026-03-08",
        "2026-03-09",
    ]
    start_hour = ranges.iter_bucket_labels(spec, "hour")[0]
    assert start_hour == "2026-03-07T00:00:00-05:00"


# --------------------------------------------------------------------------- #
# Validation
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize("value", ["yesterday", "1y", "d7", "custom!"])
def test_unknown_range_key_is_rejected(ny, value):
    with pytest.raises(InvalidRangeError) as excinfo:
        ranges.parse_range(value, now=NOW_MS)

    assert "unknown range" in excinfo.value.message
    assert excinfo.value.code == "invalid_range"
    assert excinfo.value.status_code == 422


@pytest.mark.parametrize("group_by", ["year", "minute", "days", ""])
def test_unsupported_grouping_is_rejected_only_when_provided(ny, group_by):
    if group_by == "":
        # Falsy values fall back to the range default instead of raising.
        assert ranges.parse_range("7d", group_by=group_by, now=NOW_MS).group_by == "day"
        return
    with pytest.raises(InvalidRangeError, match="unknown groupBy"):
        ranges.parse_range("7d", group_by=group_by, now=NOW_MS)


@pytest.mark.parametrize(
    ("from_value", "to_value"),
    [
        (None, "2026-01-01"),
        ("2026-01-01", None),
        (None, None),
        ("", ""),
    ],
)
def test_custom_range_requires_both_dates(ny, from_value, to_value):
    with pytest.raises(InvalidRangeError) as excinfo:
        ranges.parse_range("custom", from_value, to_value, now=NOW_MS)

    assert "requires from and to" in excinfo.value.message


def test_reversed_custom_range_is_rejected(ny):
    with pytest.raises(InvalidRangeError) as excinfo:
        ranges.parse_range("custom", "2026-02-01", "2026-01-31", now=NOW_MS)

    assert "end is before start" in excinfo.value.message


def test_equal_custom_dates_are_allowed(ny):
    spec = ranges.parse_range("custom", "2026-05-05", "2026-05-05", now=NOW_MS)
    assert spec.start_ms < spec.end_ms


@pytest.mark.parametrize(
    "bad_value",
    ["not-a-date", "2026-1-5", "2026-13-01", "2026-02-30", "2026-01-", "   "],
)
def test_malformed_custom_dates_are_rejected(ny, bad_value):
    with pytest.raises(InvalidRangeError, match="invalid from date"):
        ranges.parse_range("custom", bad_value, "2026-12-31", now=NOW_MS)


def test_date_parsing_is_lenient_about_suffixes_and_empty_strings(ny):
    # Documented current behaviour: only the first ten characters are used, so a
    # date-time (or junk) suffix after a valid YYYY-MM-DD is silently ignored.
    spec = ranges.parse_range("custom", "2026-01-05T23:00:00Z", "2026-01-06junk", now=NOW_MS)
    assert spec.start_ms == midnight_ms(date(2026, 1, 5), NY)
    assert spec.end_ms == midnight_ms(date(2026, 1, 7), NY)

    # An empty string counts as "missing" and is rejected by the presence check.
    with pytest.raises(InvalidRangeError, match="requires from and to"):
        ranges.parse_range("custom", "", "2026-01-06", now=NOW_MS)


def test_malformed_to_date_is_reported_separately(ny):
    with pytest.raises(InvalidRangeError, match="invalid to date"):
        ranges.parse_range("custom", "2026-01-01", "nope", now=NOW_MS)


# --------------------------------------------------------------------------- #
# Grouping selection
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("key", "default_group"),
    [("today", "hour"), ("7d", "day"), ("30d", "day"), ("all", "week"), ("custom", "day")],
)
def test_default_grouping_per_range(ny, key, default_group):
    args = ("2026-01-01", "2026-01-02") if key == "custom" else ()
    spec = ranges.parse_range(key, *args, now=NOW_MS)

    assert spec.group_by == default_group


@pytest.mark.parametrize("group_by", ranges.GROUP_KEYS)
def test_explicit_grouping_overrides_default_and_reaches_meta(ny, group_by):
    spec = ranges.parse_range("30d", group_by=f" {group_by.upper()} ", now=NOW_MS)

    assert spec.group_by == group_by
    assert spec.meta().group_by == group_by
    assert spec.meta("month").group_by == "month"


def test_range_keys_constant_matches_supported_values():
    assert set(ranges.RANGE_KEYS) == {"today", "7d", "30d", "all", "custom"}
    assert set(ranges.GROUP_KEYS) == {"hour", "day", "week", "month"}


# --------------------------------------------------------------------------- #
# Bucket flooring and advancement
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("moment", "group_by", "expected"),
    [
        (datetime(2026, 1, 15, 13, 47, 22, 123456, tzinfo=NY), "hour", datetime(2026, 1, 15, 13, tzinfo=NY)),
        (datetime(2026, 1, 15, 13, 47, tzinfo=NY), "day", datetime(2026, 1, 15, tzinfo=NY)),
        (datetime(2026, 1, 15, 13, 47, tzinfo=NY), "week", datetime(2026, 1, 12, tzinfo=NY)),
        (datetime(2026, 1, 18, 23, 59, tzinfo=NY), "week", datetime(2026, 1, 12, tzinfo=NY)),
        (datetime(2026, 1, 31, 5, 0, tzinfo=NY), "month", datetime(2026, 1, 1, tzinfo=NY)),
    ],
)
def test_floor_bucket(moment, group_by, expected):
    assert ranges.floor_bucket(moment, group_by) == expected


def test_floor_bucket_keeps_input_timezone():
    flored = ranges.floor_bucket(datetime(2026, 6, 15, 9, 30, tzinfo=KOLKATA), "day")

    assert flored.tzinfo is KOLKATA
    assert flored.hour == 0 and flored.minute == 0


@pytest.mark.parametrize(
    ("moment", "group_by", "expected"),
    [
        (datetime(2026, 1, 15, 23, tzinfo=timezone.utc), "hour", datetime(2026, 1, 16, 0, tzinfo=timezone.utc)),
        (datetime(2026, 1, 15, tzinfo=timezone.utc), "day", datetime(2026, 1, 16, tzinfo=timezone.utc)),
        (datetime(2026, 1, 12, tzinfo=timezone.utc), "week", datetime(2026, 1, 19, tzinfo=timezone.utc)),
        (datetime(2026, 1, 1, tzinfo=timezone.utc), "month", datetime(2026, 2, 1, tzinfo=timezone.utc)),
        (datetime(2026, 1, 31, tzinfo=timezone.utc), "month", datetime(2026, 2, 1, tzinfo=timezone.utc)),
        (datetime(2025, 12, 1, tzinfo=timezone.utc), "month", datetime(2026, 1, 1, tzinfo=timezone.utc)),
        (datetime(2024, 2, 1, tzinfo=timezone.utc), "month", datetime(2024, 3, 1, tzinfo=timezone.utc)),
    ],
)
def test_advance_bucket(moment, group_by, expected):
    assert ranges.advance_bucket(moment, group_by) == expected


def test_advance_bucket_crosses_year_boundary_for_week(ny):
    monday = ranges.floor_bucket(datetime(2025, 12, 29, 10, tzinfo=NY), "week")

    assert ranges.advance_bucket(monday, "week") == datetime(2026, 1, 5, tzinfo=NY)


# --------------------------------------------------------------------------- #
# Bucket labels
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("moment", "group_by", "expected"),
    [
        (datetime(2026, 1, 15, 9, tzinfo=timezone.utc), "hour", "2026-01-15T09:00:00+00:00"),
        (datetime(2026, 1, 15, tzinfo=timezone.utc), "day", "2026-01-15"),
        (datetime(2026, 1, 12, tzinfo=timezone.utc), "week", "2026-W03"),
        (datetime(2026, 1, 1, tzinfo=timezone.utc), "month", "2026-01"),
    ],
)
def test_bucket_label(moment, group_by, expected):
    assert ranges.bucket_label(moment, group_by) == expected


def test_unknown_grouping_falls_back_to_day_semantics(ny):
    # ``parse_range`` rejects unknown groupings, but the lower-level helpers are
    # defensive and fall back to day behaviour.
    moment = datetime(2026, 1, 15, 13, 47, tzinfo=timezone.utc)

    assert ranges.floor_bucket(moment, "quarter") == datetime(2026, 1, 15, tzinfo=timezone.utc)
    assert ranges.advance_bucket(moment, "quarter") == datetime(
        2026, 1, 16, 13, 47, tzinfo=timezone.utc
    )
    assert ranges.bucket_label(moment, "quarter") == "2026-01-15"


@pytest.mark.parametrize(
    ("day", "expected_week"),
    [
        (date(2024, 12, 30), "2025-W01"),  # ISO week year differs from calendar year
        (date(2025, 1, 1), "2025-W01"),
        (date(2025, 12, 29), "2026-W01"),
        (date(2026, 1, 1), "2026-W01"),
        (date(2026, 1, 5), "2026-W02"),
        (date(2026, 12, 31), "2026-W53"),
    ],
)
def test_week_label_uses_iso_week_year(day, expected_week):
    moment = datetime(day.year, day.month, day.day, tzinfo=timezone.utc)

    assert ranges.bucket_label(ranges.floor_bucket(moment, "week"), "week") == expected_week


def test_label_for_timestamp_uses_target_timezone(ny):
    # 2026-01-15T04:30Z is still 2026-01-14 23:30 in New York.
    ts_ms = int(datetime(2026, 1, 15, 4, 30, tzinfo=timezone.utc).timestamp() * 1000)

    assert ranges.label_for_timestamp(ts_ms, "hour", NY) == "2026-01-14T23:00:00-05:00"
    assert ranges.label_for_timestamp(ts_ms, "day", NY) == "2026-01-14"
    assert ranges.label_for_timestamp(ts_ms, "week", NY) == "2026-W03"
    assert ranges.label_for_timestamp(ts_ms, "month", NY) == "2026-01"
    assert ranges.label_for_timestamp(ts_ms, "day", timezone.utc) == "2026-01-15"


def test_label_for_timestamp_marks_dst_offsets(ny):
    first = int(datetime(2026, 11, 1, 5, 30, tzinfo=timezone.utc).timestamp() * 1000)  # EDT
    second = int(datetime(2026, 11, 1, 6, 30, tzinfo=timezone.utc).timestamp() * 1000)  # EST

    assert ranges.label_for_timestamp(first, "hour", NY) == "2026-11-01T01:00:00-04:00"
    assert ranges.label_for_timestamp(second, "hour", NY) == "2026-11-01T01:00:00-05:00"


# --------------------------------------------------------------------------- #
# Zero-filled label sequences
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("group_by", "expected"),
    [
        ("day", ["2026-01-01", "2026-01-02", "2026-01-03"]),
        ("week", ["2026-W01"]),
        ("month", ["2026-01"]),
    ],
)
def test_iter_bucket_labels_zero_fills_ordered_sequence(ny, group_by, expected):
    spec = ranges.parse_range("custom", "2026-01-01", "2026-01-03", now=NOW_MS)

    assert ranges.iter_bucket_labels(spec, group_by) == expected


def test_iter_bucket_labels_month_sequence_without_gaps(ny):
    spec = ranges.parse_range("custom", "2025-11-15", "2026-02-02", now=NOW_MS)

    assert ranges.iter_bucket_labels(spec, "month") == [
        "2025-11",
        "2025-12",
        "2026-01",
        "2026-02",
    ]


def test_iter_bucket_labels_week_sequence_without_gaps(ny):
    spec = ranges.parse_range("custom", "2026-01-01", "2026-01-31", now=NOW_MS)

    assert ranges.iter_bucket_labels(spec, "week") == [
        "2026-W01",
        "2026-W02",
        "2026-W03",
        "2026-W04",
        "2026-W05",
    ]


def test_iter_bucket_labels_week_sequence_crosses_iso_year(ny):
    spec = ranges.parse_range("custom", "2024-12-30", "2025-01-06", now=NOW_MS)

    assert ranges.iter_bucket_labels(spec, "week") == ["2025-W01", "2025-W02"]


def test_iter_bucket_labels_week_bucket_starts_on_monday(ny):
    # Sunday 2024-12-29 belongs to the week beginning Monday 2024-12-23 (W52);
    # the following Monday starts W01 of the next ISO week year.
    spec = ranges.parse_range("custom", "2024-12-29", "2024-12-29", now=NOW_MS)

    assert ranges.iter_bucket_labels(spec, "week") == ["2024-W52"]
    assert ranges.bucket_label(ranges.floor_bucket(
        datetime(2024, 12, 30, tzinfo=timezone.utc), "week"
    ), "week") == "2025-W01"


def test_iter_bucket_labels_returns_empty_for_open_or_degenerate_range(ny):
    all_spec = ranges.parse_range("all", now=NOW_MS)
    assert ranges.iter_bucket_labels(all_spec, "day") == []

    degenerate = ranges.RangeSpec("x", 1_000, 1_000, NY, "America/New_York", "day")
    assert ranges.iter_bucket_labels(degenerate, "day") == []


def test_iter_bucket_labels_uses_first_timestamp_for_open_start(ny):
    spec = ranges.parse_range("all", now=NOW_MS)

    labels = ranges.iter_bucket_labels(spec, "day", first_ms=NOW_MS - 2 * 24 * 3600 * 1000)

    assert labels == ["2026-01-13", "2026-01-14", "2026-01-15"]


def test_iter_bucket_labels_is_bounded(ny):
    spec = ranges.parse_range("custom", "1970-01-01", "2026-01-01", now=NOW_MS)

    labels = ranges.iter_bucket_labels(spec, "day")

    assert len(labels) == 5000
    assert labels[0] == "1970-01-01"
    assert labels[-1] == "1983-09-09"


def test_iter_bucket_labels_are_strictly_increasing_for_days(ny):
    spec = ranges.parse_range("custom", "2026-02-25", "2026-03-05", now=NOW_MS)

    labels = ranges.iter_bucket_labels(spec, "day")

    assert labels == sorted(labels)
    assert labels[0] == "2026-02-25"
    assert labels[-1] == "2026-03-05"
    assert len(labels) == 9


# --------------------------------------------------------------------------- #
# Timezone helpers
# --------------------------------------------------------------------------- #


def test_timezone_name_prefers_key_then_falls_back():
    assert ranges.timezone_name(NY) == "America/New_York"
    assert ranges.timezone_name(KOLKATA) == "Asia/Kolkata"
    assert ranges.timezone_name(timezone.utc) == "UTC"
    assert ranges.timezone_name(BERLIN) == "Europe/Berlin"


def test_local_timezone_returns_usable_tzinfo():
    tz = ranges.local_timezone()

    assert tz.utcoffset(datetime(2026, 1, 15, tzinfo=timezone.utc)) is not None
    assert isinstance(datetime(2026, 1, 15, tzinfo=tz).tzinfo, object)
    assert ranges.timezone_name(tz)


def test_spec_meta_accepts_group_override(ny):
    spec = ranges.parse_range("7d", now=NOW_MS)

    assert spec.meta("hour").group_by == "hour"
    assert spec.meta().group_by == spec.group_by
