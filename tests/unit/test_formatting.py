"""Unit tests for API-boundary formatting (``app/services/formatting.py``).

Costs live as integer micro-units throughout the backend and are converted to
decimal currency only here. Expected values are hand-computed integers; they are
never derived by calling the helpers under test.
"""

from __future__ import annotations

import pytest

from app.db import MICRO_PER_UNIT
from app.services import formatting

MICRO = 1_000_000


# --------------------------------------------------------------------------- #
# micro_to_cost
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("micro", "expected"),
    [
        (0, 0.0),
        (None, 0.0),
        (1, 0.000001),
        (1230, 0.00123),
        (1000, 0.001),
        (12_345, 0.012345),
        (1_234_567, 1.234567),
        (123_456_789, 123.456789),
        (-1, -0.000001),
        (-1_500_000, -1.5),
    ],
)
def test_micro_to_cost_converts_decimal_units(micro, expected):
    value = formatting.micro_to_cost(micro)

    assert value == pytest.approx(expected, abs=1e-12)
    assert isinstance(value, float)


def test_micro_to_cost_treats_zero_and_none_identically():
    assert formatting.micro_to_cost(None) == formatting.micro_to_cost(0) == 0.0


def test_micro_to_cost_matches_micro_per_unit_constant():
    assert MICRO_PER_UNIT == MICRO
    assert formatting.micro_to_cost(MICRO) == 1.0
    assert formatting.micro_to_cost(2.5 * MICRO) == 2.5
    assert formatting.micro_to_cost(MICRO * 10**6) == 1_000_000.0


def test_micro_to_cost_round_trips_whole_micro_units():
    # Conversion in both directions is lossless for every whole micro-unit.
    for micro in (1, 7, 999_999, 1_000_001, 123_456_789):
        assert formatting.cost_to_micro(formatting.micro_to_cost(micro)) == micro
        assert formatting.micro_to_cost(micro) == micro / MICRO


def test_micro_to_cost_rounds_to_six_decimals():
    # Sub-micro precision cannot be represented; the helper rounds at 6 decimals.
    assert formatting.micro_to_cost(1234) == 0.001234
    assert formatting.micro_to_cost(1) == 0.000001


# --------------------------------------------------------------------------- #
# cost_to_micro
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, 0),
        (0, 0),
        ("0", 0),
        (1, MICRO),
        ("1", MICRO),
        (1.5, 1_500_000),
        ("0.0036", 3600),
        ("0.012345", 12_345),
        (" 1.5 ", 1_500_000),
        ("1e-6", 1),
        (123, 123 * MICRO),
        (-1, -MICRO),
        ("-0.000001", -1),
        (-1.5, -1_500_000),
    ],
)
def test_cost_to_micro_converts_decimal_amounts(value, expected):
    assert formatting.cost_to_micro(value) == expected


@pytest.mark.parametrize(
    ("value", "expected", "note"),
    [
        ("0.0000015", 2, "above half rounds up"),
        ("0.0000025", 2, "exact .5 with even neighbour rounds down"),
        ("0.1234565", 123_456, "exact .5 with even neighbour rounds down"),
        ("0.0000005", 0, "below one micro-unit of precision is lost"),
        ("0.0000004", 0, "below half a micro-unit is lost entirely"),
        ("0.0049999", 5000, "sub-micro remainder rounds up"),
        ("0.0049994", 4999, "sub-micro remainder rounds down"),
    ],
)
def test_cost_to_micro_rounding_boundaries(value, expected, note):
    # Python's round() is half-to-even, so tests must not assume half-up.
    assert formatting.cost_to_micro(value) == expected, note


def test_cost_to_micro_rounding_is_symmetric_for_negatives():
    assert formatting.cost_to_micro("-0.0000015") == -2
    assert formatting.cost_to_micro("-0.0000005") == 0
    assert formatting.cost_to_micro("-0.0000025") == -2


def test_cost_to_micro_accumulates_decimal_amounts_without_float_drift():
    total = sum(formatting.cost_to_micro(v) for v in ("0.1", "0.2"))

    assert total == 300_000
    assert formatting.cost_to_micro("0.3") == 300_000


def test_cost_to_micro_accepts_binary_float_artifacts():
    # 0.1 + 0.2 == 0.30000000000000004; rounding absorbs the artifact.
    assert formatting.cost_to_micro(0.1 + 0.2) == 300_000


@pytest.mark.parametrize("invalid", ["", "abc", "1,5", "$1.00"])
def test_cost_to_micro_rejects_unparseable_text(invalid):
    with pytest.raises(ValueError):
        formatting.cost_to_micro(invalid)


@pytest.mark.parametrize(("invalid", "error"), [("nan", ValueError), ("inf", OverflowError)])
def test_cost_to_micro_rejects_non_finite_values(invalid, error):
    with pytest.raises(error):
        formatting.cost_to_micro(invalid)


# --------------------------------------------------------------------------- #
# format_tokens
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "0"),
        (0, "0"),
        (1, "1"),
        (7, "7"),
        (999, "999"),
        (1000, "1.0K"),
        (1500, "1.5K"),
        (12_345, "12.3K"),
        (999_949, "999.9K"),
        (999_999, "1000.0K"),
        (1_000_000, "1.0M"),
        (1_234_567, "1.2M"),
        (10_725, "10.7K"),
        (1_000_000_000, "1.0B"),
        (2_500_000_000, "2.5B"),
        (1_000_000_000_000, "1000.0B"),
    ],
)
def test_format_tokens_compacts_by_magnitude(value, expected):
    assert formatting.format_tokens(value) == expected


def test_format_tokens_thresholds_are_inclusive_at_one_thousand():
    assert formatting.format_tokens(999) == "999"
    assert formatting.format_tokens(1000) == "1.0K"
    assert formatting.format_tokens(999_999) == "1000.0K"
    assert formatting.format_tokens(1_000_000) == "1.0M"


def test_format_tokens_leaves_small_and_negative_counts_alone():
    assert formatting.format_tokens(-5) == "-5"
    assert formatting.format_tokens(-1500) == "-1500"


def test_format_tokens_always_uses_one_decimal_above_threshold():
    for value, expected in [(1000, "1.0K"), (1500, "1.5K"), (2_000_000, "2.0M")]:
        rendered = formatting.format_tokens(value)
        assert rendered == expected
        number, suffix = rendered[:-1], rendered[-1]
        assert len(number.split(".", 1)[1]) == 1
        assert suffix in {"K", "M", "B"}


# --------------------------------------------------------------------------- #
# format_cost
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, "$0.00"),
        (0, "$0.00"),
        (1, "$1.00"),
        (1.5, "$1.50"),
        (0.01, "$0.01"),
        (12.345, "$12.35"),
        (1234.5, "$1,234.50"),
        (1_234_567.891, "$1,234,567.89"),
        (1_000_000_000, "$1,000,000,000.00"),
    ],
)
def test_format_cost_uses_currency_precision_and_grouping(value, expected):
    assert formatting.format_cost(value) == expected


def test_format_cost_keeps_negative_sign_before_symbol():
    assert formatting.format_cost(-1.5) == "$-1.50"
    assert formatting.format_cost(-1234.567) == "$-1,234.57"


def test_format_cost_rounds_half_to_even():
    # float formatting uses the same half-to-even rule as round().
    assert formatting.format_cost(0.005) == "$0.01"
    assert formatting.format_cost(0.015) == "$0.01"
    assert formatting.format_cost(0.025) == "$0.03"
    assert formatting.format_cost(1.005) == "$1.00"


def test_format_cost_matches_micro_round_trip_for_display():
    micro = 1_234_567

    units = formatting.micro_to_cost(micro)

    assert units == 1.234567
    assert formatting.format_cost(units) == "$1.23"


def test_format_cost_zeroes_tiny_amounts_after_rounding():
    assert formatting.format_cost(0.004) == "$0.00"
    assert formatting.format_cost(formatting.micro_to_cost(1)) == "$0.00"


# --------------------------------------------------------------------------- #
# Module surface and known gaps
# --------------------------------------------------------------------------- #


def test_module_documents_its_currency_conversion_boundary():
    assert formatting.__doc__ is not None
    assert "micro" in formatting.__doc__.lower()


def test_only_token_and_cost_formatters_exist_so_far():
    # The plan also asks for duration and byte formatting. Neither helper exists
    # in production yet; record the current surface instead of inventing one.
    public = {name for name in dir(formatting) if not name.startswith("_")}
    formatters = {name for name in public if name.startswith("format_")}

    assert formatters == {"format_tokens", "format_cost"}
    assert {"micro_to_cost", "cost_to_micro"} <= public
