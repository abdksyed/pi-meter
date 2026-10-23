"""Unit tests for usage extraction and cost accounting.

Targets ``app/services/parser_usage.py`` plus the usage plumbing in
``app/services/parser.py``. Expected micro-unit values come from
``tests.fixtures.corpus`` (independent Decimal arithmetic), not from the code
under test.
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP

import pytest

from tests.fixtures import corpus
from tests.fixtures import jsonl as j

import app.services.parser_usage as pu
from app.services.parser_models import UsageTokens


# --------------------------------------------------------------------------- #
# cost_to_micro
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("recorded", "expected"),
    [
        ("0.0036", 3600),
        ("0.0045", 4500),
        ("0.0012297", 1230),  # half-up beyond micro precision
        ("0.0000005", 1),  # exact half rounds up
        ("0.0000004", 0),  # below half rounds down (precision is lost)
        ("0", 0),
        (1, 1_000_000),
        ("1.5", 1_500_000),
        ("-0.000001", -1),  # recorded negatives are preserved, not clamped
    ],
)
def test_cost_to_micro_matches_independent_decimal_arithmetic(recorded, expected):
    assert pu.cost_to_micro(recorded) == expected
    assert corpus.micro(recorded) == expected


@pytest.mark.parametrize("invalid", [None, True, False, "not a number", "", "nan", "inf"])
def test_cost_to_micro_returns_zero_for_invalid_or_non_finite(invalid):
    assert pu.cost_to_micro(invalid) == 0


def test_cost_conversion_uses_decimal_not_binary_floats():
    # 0.1 + 0.2 style float error must not leak into micro-unit conversion.
    total = pu.cost_to_micro("0.1") + pu.cost_to_micro("0.2")
    assert total == 300_000
    assert total == corpus.micro("0.3")


# --------------------------------------------------------------------------- #
# token_to_int / usage_total_tokens
# --------------------------------------------------------------------------- #


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, 0),
        (True, 0),
        (7, 7),
        (7.9, 7),
        (-5, 0),
        ("12", 12),
        (" 12 ", 12),
        ("bad", 0),
        ([1], 0),
    ],
)
def test_token_to_int(value, expected):
    assert pu.token_to_int(value) == expected


def test_usage_total_tokens_prefers_recorded_total():
    tokens = UsageTokens(input=10, output=5, reasoning=500, total=15)

    assert pu.usage_total_tokens(tokens) == 15


def test_usage_total_tokens_derives_from_components_without_reasoning():
    tokens = UsageTokens(input=10, output=5, reasoning=99, cache_read=2, cache_write=3)

    # reasoning is a subset of output: never added a second time.
    assert pu.usage_total_tokens(tokens) == 20


# --------------------------------------------------------------------------- #
# normalize_usage
# --------------------------------------------------------------------------- #


def test_normalize_usage_maps_tokens_and_costs():
    raw = j.usage_object(
        input=1200,
        output=340,
        reasoning=60,
        cache_read=4000,
        cache_write=500,
        cache_write_1h=70,
        total_tokens=None,
        cost={
            "input": "0.0036",
            "output": "0.0051",
            "cacheRead": "0.0004",
            "cacheWrite": "0.00187",
        },
    )

    record = pu.normalize_usage(
        raw,
        source="assistant",
        entry_id="a1",
        entry_index=2,
        provider="anthropic",
        model="claude-sonnet-4-5",
        model_source="recorded",
        timestamp_ms=1_700_000_000_000,
    )

    assert record is not None
    assert record.source == "assistant"
    assert record.entry_id == "a1"
    assert record.entry_index == 2
    assert (record.provider, record.model) == ("anthropic", "claude-sonnet-4-5")
    assert record.timestamp_ms == 1_700_000_000_000
    assert record.tokens == UsageTokens(
        input=1200,
        output=340,
        reasoning=60,
        cache_read=4000,
        cache_write=500,
        cache_write_1h=70,
        total=0,
    )
    # No recorded total: the components are summed.
    assert record.cost.input_micro == corpus.micro("0.0036")
    assert record.cost.output_micro == corpus.micro("0.0051")
    assert record.cost.cache_read_micro == corpus.micro("0.0004")
    assert record.cost.cache_write_micro == corpus.micro("0.00187")
    assert record.cost.total_micro == sum(
        corpus.micro(v) for v in ("0.0036", "0.0051", "0.0004", "0.00187")
    )


def test_normalize_usage_keeps_recorded_total_separate_from_component_sum():
    raw = j.usage_object(
        input=2000,
        output=500,
        total_tokens=3500,
        cost={
            "input": "0.001",
            "output": "0.002",
            "cacheWrite": "0.0005",
            "total": "0.0037777",
        },
    )

    record = pu.normalize_usage(
        raw,
        source="assistant",
        entry_id="a3",
        entry_index=3,
        provider=None,
        model=None,
        model_source="attributed",
        timestamp_ms=None,
    )

    components = corpus.micro("0.001") + corpus.micro("0.002") + corpus.micro("0.0005")
    assert components == 3500
    assert record.cost.total_micro == corpus.micro("0.0037777") == 3778
    assert record.cost.total_micro != components


def test_normalize_usage_handles_missing_cost_and_token_fields():
    record = pu.normalize_usage(
        {"input": 5},
        source="other",
        entry_id=None,
        entry_index=0,
        provider=None,
        model=None,
        model_source="recorded",
        timestamp_ms=None,
    )

    assert record.tokens.input == 5
    assert record.tokens.output == 0
    assert record.cost.total_micro == 0


def test_normalize_usage_rejects_non_objects():
    assert (
        pu.normalize_usage(
            ["not", "a", "dict"],  # type: ignore[arg-type]
            source="usage",
            entry_id=None,
            entry_index=0,
            provider=None,
            model=None,
            model_source="recorded",
            timestamp_ms=None,
        )
        is None
    )


# --------------------------------------------------------------------------- #
# extract_usage_records: exactly one record per logical entry
# --------------------------------------------------------------------------- #


def test_message_usage_comes_from_the_nested_message_only():
    record = j.assistant_message(
        "a1", text="x", usage=j.usage_object(input=1, output=1, total_tokens=2)
    )
    record["usage"] = j.usage_object(input=99, output=99, total_tokens=198, cost={"total": "9.0"})

    records = pu.extract_usage_records(record, entry_index=0, entry_id="a1")

    assert len(records) == 1
    assert records[0].source == "assistant"
    assert records[0].tokens.input == 1
    assert records[0].cost.total_micro == 0


@pytest.mark.parametrize(
    ("role", "expected_source"),
    [("assistant", "assistant"), ("toolResult", "tool_result"), ("user", "other")],
)
def test_message_sources_follow_the_role(role, expected_source):
    record = j.message_entry("m1", role, [j.text_block("x")], usage=j.usage_object(input=1))

    records = pu.extract_usage_records(record, entry_index=0, entry_id="m1")

    assert len(records) == 1
    assert records[0].source == expected_source


@pytest.mark.parametrize("entry_type", ["usage", "compaction", "branch_summary"])
def test_standalone_usage_entries_use_top_level_usage(entry_type):
    record = {
        "type": entry_type,
        "id": "e1",
        "usage": j.usage_object(input=10, output=5, total_tokens=15),
    }

    records = pu.extract_usage_records(record, entry_index=0, entry_id="e1")

    assert len(records) == 1
    assert records[0].source == entry_type
    assert records[0].tokens.input == 10


def test_usage_entry_records_its_kind():
    record = j.usage_entry("use1", j.usage_object(input=1), kind="session_total")

    records = pu.extract_usage_records(record, entry_index=0, entry_id="use1")

    assert records[0].kind == "session_total"


def test_metadata_only_entries_contribute_no_usage():
    for record in (
        j.model_change("mc1", provider="openai", model_id="gpt-5.1"),
        j.thinking_level_change("tl1", thinking_level="high"),
        j.label("l1", target_id="x", label_text="l"),
        j.session_info("si1", name="n"),
        j.custom("c1", custom_type="t", data={"a": 1}),
        j.custom_message("cm1", custom_type="t", text="hi"),
        j.context_edit("ce1", target_id="x"),
    ):
        assert pu.extract_usage_records(record, entry_index=0) == [], record["type"]


def test_extract_is_inert_for_unknown_entries_at_the_parser_level(parse_records):
    # ``extract_usage_records`` itself accepts unknown shapes, but the parser
    # only wires usage for known entry types. Document that boundary here.
    record = {
        "type": "future_event",
        "id": "x1",
        "usage": j.usage_object(input=4, output=4, total_tokens=8, cost={"total": "0.0004"}),
    }
    assert len(pu.extract_usage_records(record, entry_index=0)) == 1

    parsed = parse_records([j.session_header("s1"), record])
    assert parsed.entries[0].usage_records == []
    assert parsed.totals.total_tokens == 0


# --------------------------------------------------------------------------- #
# dedupe_usage / sum_usage
# --------------------------------------------------------------------------- #


def test_identical_usage_on_separate_entries_counts_twice(parse_records):
    shared = j.usage_object(input=300, output=40, total_tokens=340, cost={"total": "0.0005"})
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.assistant_message("a1", text="before", usage=shared),
            j.assistant_message("a2", text="after", usage=shared),
        ]
    )

    assert len(parsed.usage_records) == 2
    assert parsed.totals.input_tokens == 600
    assert parsed.totals.output_tokens == 80
    assert parsed.totals.cost_total_micro == 1000


def test_dedupe_usage_only_collapses_the_same_entry_and_payload():
    record = j.assistant_message("a1", text="x", usage=j.usage_object(input=1, total_tokens=1))
    extracted = pu.extract_usage_records(record, entry_index=0, entry_id="a1")

    assert len(pu.dedupe_usage(extracted + extracted)) == 1
    assert len(pu.dedupe_usage(extracted)) == 1


def test_beta_corpus_counts_both_midnight_records(parse_records):
    parsed = parse_records(corpus.beta_session_records())

    assert len(parsed.usage_records) == corpus.BETA["usage_record_count"]
    assert parsed.totals.input_tokens == corpus.BETA["input_tokens"]
    assert parsed.totals.output_tokens == corpus.BETA["output_tokens"]
    assert parsed.totals.total_tokens == corpus.BETA["total_tokens"]
    assert parsed.totals.cost_total_micro == corpus.BETA["cost_total_micro"]
    # The two records really are on either side of the UTC midnight boundary.
    timestamps = [r.timestamp_ms for r in parsed.usage_records]
    assert timestamps == [
        j.epoch_ms(corpus.BETA_BEFORE_MIDNIGHT),
        j.epoch_ms(corpus.BETA_AFTER_MIDNIGHT),
    ]


def test_sum_usage_never_double_counts_reasoning():
    tokens = UsageTokens(
        input=100, output=50, reasoning=40, cache_read=10, cache_write=5, total=165
    )
    record = pu.normalize_usage(
        {
            "input": 100,
            "output": 50,
            "reasoning": 40,
            "cacheRead": 10,
            "cacheWrite": 5,
            "totalTokens": 165,
        },
        source="assistant",
        entry_id="a1",
        entry_index=0,
        provider=None,
        model=None,
        model_source="recorded",
        timestamp_ms=None,
    )

    totals = pu.sum_usage([record])

    assert totals.reasoning_tokens == 40
    assert totals.output_tokens == 50
    assert totals.total_tokens == 165
    # total tokens is the recorded total, not the component sum. The recorded
    # 165 already equals input + output + cacheRead + cacheWrite, which proves
    # reasoning was not added on top.
    assert tokens.input + tokens.output + tokens.cache_read + tokens.cache_write == 165


# --------------------------------------------------------------------------- #
# Session-level accounting against the corpus
# --------------------------------------------------------------------------- #


def test_main_corpus_totals_match_independent_expectations(parse_records):
    parsed = parse_records(corpus.main_session_records())
    totals = parsed.totals

    assert len(parsed.usage_records) == corpus.MAIN.usage_record_count
    assert totals.input_tokens == corpus.MAIN.input_tokens
    assert totals.output_tokens == corpus.MAIN.output_tokens
    assert totals.reasoning_tokens == corpus.MAIN.reasoning_tokens
    assert totals.cache_read_tokens == corpus.MAIN.cache_read_tokens
    assert totals.cache_write_tokens == corpus.MAIN.cache_write_tokens
    assert totals.total_tokens == corpus.MAIN.total_tokens
    assert totals.cost_input_micro == corpus.MAIN.cost_input_micro
    assert totals.cost_output_micro == corpus.MAIN.cost_output_micro
    assert totals.cost_cache_read_micro == corpus.MAIN.cost_cache_read_micro
    assert totals.cost_cache_write_micro == corpus.MAIN.cost_cache_write_micro
    assert totals.cost_total_micro == corpus.MAIN.cost_total_micro


def test_reasoning_is_a_subset_of_output_in_the_main_corpus(parse_records):
    totals = parse_records(corpus.main_session_records()).totals

    assert corpus.MAIN.reasoning_subset_of_output is True
    assert totals.reasoning_tokens <= totals.output_tokens
    # The recorded total equals the components, so reasoning never inflates it.
    component_total = (
        totals.input_tokens
        + totals.output_tokens
        + totals.cache_read_tokens
        + totals.cache_write_tokens
    )
    assert totals.total_tokens == component_total


def test_recorded_session_total_differs_from_component_costs(parse_records):
    """The corpus records a total that deliberately disagrees with its parts."""

    totals = parse_records(corpus.main_session_records()).totals
    component_cost = (
        totals.cost_input_micro
        + totals.cost_output_micro
        + totals.cost_cache_read_micro
        + totals.cost_cache_write_micro
    )

    assert component_cost == 18_970
    assert totals.cost_total_micro == corpus.MAIN.cost_total_micro == 19_409
    assert totals.cost_total_micro != component_cost


def test_per_model_usage_sums_to_the_session_total(parse_records):
    parsed = parse_records(corpus.main_session_records())

    assert sum(m.total_tokens for m in parsed.models_with_usage) == parsed.totals.total_tokens
    assert (
        sum(m.cost_total_micro for m in parsed.models_with_usage) == parsed.totals.cost_total_micro
    )
    assert sum(m.usage_entry_count for m in parsed.models_with_usage) == len(parsed.usage_records)


def test_usage_on_tool_results_is_counted(parse_records):
    usage = j.usage_object(input=7, output=3, total_tokens=10, cost={"total": "0.001"})
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.assistant_message("a1", text="x", usage=j.usage_object(input=1, total_tokens=1)),
            j.tool_result_message("r1", call_id="c1", usage=usage),
        ]
    )

    sources = [r.source for r in parsed.usage_records]
    assert sources == ["assistant", "tool_result"]
    assert parsed.totals.input_tokens == 8
    assert parsed.totals.cost_total_micro == 1000


def test_assistant_message_without_usage_is_warned_not_counted(parse_records):
    parsed = parse_records(
        [j.session_header("s1"), j.assistant_message("a1", text="x")]
    )

    assert parsed.usage_records == []
    assert parsed.totals.total_tokens == 0
    assert "missing_usage" in [i.code for i in parsed.issues]


def test_zero_usage_still_produces_a_record(parse_records):
    parsed = parse_records(
        [j.session_header("s1"), j.assistant_message("a1", text="x", usage=j.usage_object())]
    )

    assert len(parsed.usage_records) == 1
    assert parsed.totals.total_tokens == 0
    assert parsed.totals.cost_total_micro == 0
    assert parsed.usage_records[0].tokens == UsageTokens()


def test_sub_micro_scoped_costs_round_at_the_boundary(parse_records):
    def total_for(amount: str) -> int:
        parsed = parse_records(
            [
                j.session_header("s1"),
                j.assistant_message(
                    "a1",
                    text="x",
                    usage=j.usage_object(input=1, total_tokens=1, cost={"total": amount}),
                ),
            ]
        )
        return parsed.totals.cost_total_micro

    assert total_for("0.0000004") == 0  # documented precision loss
    assert total_for("0.0000005") == 1  # half-up
    assert total_for("0.0000015") == 2


def test_long_corpus_usage_is_counted_once_per_assistant_entry(parse_records):
    parsed = parse_records(corpus.long_session_records())

    assert len(parsed.usage_records) == corpus.LONG["usage_record_count"]
    assert parsed.totals.total_tokens == corpus.LONG["total_tokens"]
    assert parsed.totals.cost_total_micro == corpus.LONG["cost_total_micro"]


def test_no_reasoning_cost_field_is_invented(parse_records):
    parsed = parse_records(corpus.main_session_records())

    for record in parsed.usage_records:
        assert not hasattr(record.cost, "reasoning_micro")
        # Cost total is either recorded verbatim or the exact component sum.
        component_sum = (
            record.cost.input_micro
            + record.cost.output_micro
            + record.cost.cache_read_micro
            + record.cost.cache_write_micro
        )
        if "total" in record.raw.get("cost", {}):
            expected = int(
                (Decimal(str(record.raw["cost"]["total"])) * 1_000_000).to_integral_value(
                    rounding=ROUND_HALF_UP
                )
            )
            assert record.cost.total_micro == expected
        else:
            assert record.cost.total_micro == component_sum
