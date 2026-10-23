"""Synthetic session corpora with independently computed expectations.

Every corpus is deterministic: fixed ids, fixed ISO timestamps (UTC), fixed
recorded costs as decimal strings. Expectation values in this module are
derived from the fixture definitions with their own local arithmetic (see
:func:`micro`) and deliberately do **not** import ``app``. Compare production
results against these numbers instead of re-deriving them through the code
under test.

Corpus variants
---------------
``"empty"``
    An empty sessions directory (no files at all).
``"none"``
    Only the edge-case files (empty file, header-only, malformed, ...).
``"full"``
    Every corpus: main conversation, midnight/beta session, parent + mapped
    children + decoy sessions, metadata session, long transcript.

Directory layout written by :func:`write_corpus` (all below ``sessions_dir``)::

    alpha/2026-01-15T09-00-00_main.jsonl          MAIN_ID
    beta/2026-01-15T23-58-00_beta.jsonl           BETA_ID
    parent/2026-01-14T08-00-00_parent.jsonl       PARENT_ID
    parent/children/*.jsonl                       MAPPED_CHILD_IDS (+ decoys)
    meta/2026-01-13T10-00-00_meta.jsonl           METADATA_ID
    long/2026-01-12T06-00-00_long.jsonl           LONG_ID
    edge/*.jsonl                                  see EDGE_CASE_FILES
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from pathlib import Path
from typing import Any, Mapping

from tests.fixtures import jsonl as j

MICRO = 1_000_000

# --------------------------------------------------------------------------- #
# Stable ids
# --------------------------------------------------------------------------- #

MAIN_ID = "11111111-1111-4111-8111-111111111111"
BETA_ID = "22222222-2222-4222-8222-222222222222"
METADATA_ID = "33333333-3333-4333-8333-333333333333"
LONG_ID = "44444444-4444-4444-8444-444444444444"

#: Parent id referenced by the production relationship map.
PARENT_ID = "01a16174-80c5-7088-aefb-de5e5b743c5f"

#: The five children explicitly mapped to PARENT_ID in
#: ``app/services/aggregation.py::_RELATED_SESSION_IDS``.
MAPPED_CHILD_IDS = (
    "01a162e4-2f54-72b8-a3ae-9ac22276c51e",
    "01a162e4-2f61-71b3-a045-2b26634d7e5d",
    "01a162e4-2f93-741b-ae94-98195e19e3ca",
    "01a162f8-bf3d-76df-a7b0-17dcbb50e572",
    "01a16365-3cba-730e-aae2-ad6f622a0043",
)

#: Sessions that must never be reported as children of PARENT_ID. They exist
#: on disk and are mentioned by UUID in the parent transcript, tool output and
#: directory listings, but are not in the explicit relationship map.
DECOY_SESSION_IDS = (
    "99999999-0000-4000-8000-000000000001",
    "99999999-0000-4000-8000-000000000002",
    "99999999-0000-4000-8000-000000000003",
)

#: The bug report names three additional excluded ids. They were not supplied
#: with the plan, so the contract is "whatever the bug report lists, minus the
#: mapped five". Worker 4 should fill this in when the ids are published.
EXCLUDED_RELATED_SESSION_IDS: tuple[str, ...] = ()


# --------------------------------------------------------------------------- #
# Independent arithmetic helpers
# --------------------------------------------------------------------------- #


def micro(value: str | int | float) -> int:
    """Convert a recorded decimal cost to integer micro-units (rounded half up).

    Independent of ``app.services.parser_usage.cost_to_micro`` on purpose.
    """
    return int((Decimal(str(value)) * MICRO).to_integral_value(rounding=ROUND_HALF_UP))


def _token_total(tokens: Mapping[str, int], recorded_total: int | None) -> int:
    if recorded_total:
        return recorded_total
    return (
        tokens["input"]
        + tokens["output"]
        + tokens["cache_read"]
        + tokens["cache_write"]
    )


# --------------------------------------------------------------------------- #
# Main conversation session (two models, tools, all usage shapes)
# --------------------------------------------------------------------------- #

MAIN_TIMES = {
    "start": "2026-01-15T09:00:00.000Z",
    "user": "2026-01-15T09:00:00.000Z",
    "assistant1": "2026-01-15T09:00:04.000Z",
    "tool1": "2026-01-15T09:00:05.000Z",
    "assistant2": "2026-01-15T09:00:09.000Z",
    "tool2": "2026-01-15T09:00:11.000Z",
    "orphan": "2026-01-15T09:00:12.000Z",
    "model_change": "2026-01-15T09:01:00.000Z",
    "assistant3": "2026-01-15T09:01:02.000Z",
    "thinking_change": "2026-01-15T09:01:03.000Z",
    "compaction": "2026-01-15T09:02:00.000Z",
    "context_edit": "2026-01-15T09:02:05.000Z",
    "branch_summary": "2026-01-15T09:02:10.000Z",
    "custom": "2026-01-15T09:02:15.000Z",
    "custom_message": "2026-01-15T09:02:20.000Z",
    "label": "2026-01-15T09:02:25.000Z",
    "usage": "2026-01-15T09:02:30.000Z",
    "unknown": "2026-01-15T09:02:35.000Z",
    "session_info": "2026-01-15T09:02:40.000Z",
}

MAIN_TITLE = "Refactor parser pipeline"
MAIN_CWD = "/work/alpha"

#: Usage per logical record. ``total`` is ``None`` when the fixture omits
#: ``totalTokens`` so production must derive it from the components.
MAIN_USAGE = {
    "assistant1": {
        "tokens": {"input": 1200, "output": 340, "reasoning": 60, "cache_read": 4000, "cache_write": 500},
        "recorded_total": None,
        "cost": {
            "input": "0.0036",
            "output": "0.0051",
            "cacheRead": "0.0004",
            "cacheWrite": "0.00187",
            # no recorded total: production sums the components
        },
    },
    "assistant2": {
        "tokens": {"input": 900, "output": 120, "reasoning": 0, "cache_read": 0, "cache_write": 0},
        "recorded_total": 1020,
        "cost": {
            "input": "0.0027",
            "output": "0.0018",
            "cacheRead": "0",
            "cacheWrite": "0",
            "total": "0.0045",
        },
    },
    "assistant3": {
        "tokens": {"input": 2000, "output": 500, "reasoning": 200, "cache_read": 0, "cache_write": 1000},
        "recorded_total": 3500,
        "cost": {
            "input": "0.001",
            "output": "0.002",
            "cacheRead": "0",
            "cacheWrite": "0.0005",
            # recorded total deliberately differs from the component sum
            "total": "0.0037777",
        },
    },
    "compaction": {
        "tokens": {"input": 100, "output": 50, "reasoning": 0, "cache_read": 0, "cache_write": 0},
        "recorded_total": None,
        "cost": {"total": "0.0001"},
    },
    "branch_summary": {
        "tokens": {"input": 0, "output": 0, "reasoning": 0, "cache_read": 0, "cache_write": 0},
        "recorded_total": None,
        "cost": {"total": "0.00005"},
    },
    "usage": {
        "tokens": {"input": 10, "output": 5, "reasoning": 0, "cache_read": 0, "cache_write": 0},
        "recorded_total": None,
        "cost": {"total": "0.000011"},
    },
}


def _usage(name: str) -> dict[str, Any]:
    spec = MAIN_USAGE[name]
    tokens = spec["tokens"]
    return j.usage_object(
        input=tokens["input"],
        output=tokens["output"],
        reasoning=tokens["reasoning"],
        cache_read=tokens["cache_read"],
        cache_write=tokens["cache_write"],
        total_tokens=spec["recorded_total"],
        cost=spec["cost"],
    )


def main_session_records() -> list[j.JsonLine]:
    """A complete conversation with tools, errors, media, metadata and usage."""
    t = MAIN_TIMES
    return [
        j.session_header(MAIN_ID, timestamp=t["start"], cwd=MAIN_CWD),
        j.user_message(
            "u1",
            "Please refactor the parser pipeline and keep the tests green.",
            timestamp=t["user"],
            blocks=[j.image_block()],
        ),
        j.assistant_message(
            "a1",
            timestamp=t["assistant1"],
            parent_id="u1",
            thinking="I will inspect the parser first.",
            text="Inspecting the parser and running the unit tests.",
            tool_calls=[
                j.tool_call_block("call-1", "bash", {"command": "pytest tests/unit -q"}),
            ],
            usage=_usage("assistant1"),
            duration_ms=4000,
            thinking_level="medium",
        ),
        j.tool_result_message(
            "r1",
            call_id="call-1",
            output="3 passed in 0.42s",
            timestamp=t["tool1"],
            parent_id="a1",
            details={"truncation": {"truncated": False, "originalBytes": 18}},
        ),
        j.assistant_message(
            "a2",
            timestamp=t["assistant2"],
            parent_id="r1",
            text="Applying the rename.",
            tool_calls=[
                j.tool_call_block(
                    "call-2",
                    "edit",
                    raw_arguments='{"path": "app/services/parser.py", "old": "x",',
                    arguments_error="unexpected end of JSON input",
                ),
            ],
            usage=_usage("assistant2"),
            duration_ms=3200,
        ),
        j.tool_result_message(
            "r2",
            call_id="call-2",
            tool_name="edit",
            output="Error: edit failed because the anchor text was not found.",
            timestamp=t["tool2"],
            parent_id="a2",
            is_error=True,
        ),
        # Orphan result: no tool call with this id anywhere in the session.
        j.tool_result_message(
            "r3",
            call_id="call-missing",
            tool_name="read",
            output="orphan output that must not be dropped",
            timestamp=t["orphan"],
            parent_id="a2",
        ),
        j.model_change(
            "mc1",
            provider="openai",
            model_id="gpt-5.1",
            timestamp=t["model_change"],
            parent_id="a2",
        ),
        j.assistant_message(
            "a3",
            timestamp=t["assistant3"],
            parent_id="mc1",
            provider="openai",
            model="gpt-5.1",
            text="Second model answering with the same session.",
            usage=_usage("assistant3"),
            duration_ms=2500,
        ),
        j.thinking_level_change("tl1", thinking_level="high", timestamp=t["thinking_change"]),
        j.compaction(
            "cmp1",
            summary="Compacted the early parser exploration into a short summary.",
            timestamp=t["compaction"],
            parent_id="a3",
            usage=_usage("compaction"),
            tokens_before=9000,
            first_kept_entry_id="a3",
            details={"readFiles": ["app/services/parser.py"], "modifiedFiles": []},
        ),
        j.context_edit(
            "ce1",
            target_id="r2",
            replacement=[j.text_block("redacted failure detail")],
            timestamp=t["context_edit"],
        ),
        j.branch_summary(
            "bs1",
            summary="Branch summary from the first assistant answer.",
            from_id="a1",
            timestamp=t["branch_summary"],
            usage=_usage("branch_summary"),
        ),
        j.custom(
            "cust1",
            custom_type="todo",
            data={"items": [{"text": "rename parser helpers", "done": False}], "nested": {"a": [1, 2, 3]}},
            timestamp=t["custom"],
        ),
        j.custom_message(
            "cm1",
            custom_type="notification",
            text="Custom message rendered as user content.",
            timestamp=t["custom_message"],
        ),
        j.label("lab1", target_id="a1", label_text="first-answer", timestamp=t["label"]),
        j.usage_entry(
            "use1",
            _usage("usage"),
            kind="session_total",
            timestamp=t["usage"],
            provider="openai",
            model="gpt-5.1",
            note="standalone usage record",
        ),
        j.unknown_entry(
            "unk1",
            entry_type="future_event",
            timestamp=t["unknown"],
            payload={"html": "<script>alert(1)</script>", "markdown": "[link](javascript:alert(1))"},
        ),
        j.session_info("si1", name=MAIN_TITLE, timestamp=t["session_info"]),
    ]


@dataclass(frozen=True)
class MainExpectations:
    session_id: str = MAIN_ID
    title: str = MAIN_TITLE
    cwd: str = MAIN_CWD
    entry_count: int = 18
    message_count: int = 7
    user_message_count: int = 1
    assistant_message_count: int = 3
    tool_result_count: int = 3
    tool_call_count: int = 2
    model_change_count: int = 1
    thinking_level_change_count: int = 1
    compaction_count: int = 1
    context_edit_count: int = 1
    branch_summary_count: int = 1
    custom_count: int = 1
    custom_message_count: int = 1
    label_count: int = 1
    session_info_count: int = 1
    unknown_entry_count: int = 1
    usage_entry_count: int = 1
    usage_record_count: int = 6
    input_tokens: int = 4210
    output_tokens: int = 1015
    reasoning_tokens: int = 260
    cache_read_tokens: int = 4000
    cache_write_tokens: int = 1500
    total_tokens: int = 10725
    cost_input_micro: int = 7300
    cost_output_micro: int = 8900
    cost_cache_read_micro: int = 400
    cost_cache_write_micro: int = 2370
    cost_total_micro: int = 19409
    started_at: str = MAIN_TIMES["start"]
    last_activity_at: str = MAIN_TIMES["session_info"]
    model_change_provider: str = "openai"
    model_change_model: str = "gpt-5.1"
    label_target_id: str = "a1"
    label_text: str = "first-answer"
    orphan_tool_call_id: str = "call-missing"
    failed_tool_call_id: str = "call-2"
    reasoning_subset_of_output: bool = True
    # Metadata entries omit ``parentId`` on purpose, so the parser reports
    # ``multiple_roots`` (a warning, not an error). The one info issue comes
    # from the deliberately unknown ``future_event`` entry.
    parse_status: str = "ok"
    issue_codes: tuple[str, ...] = ("unknown_entry_type", "multiple_roots")
    models_with_usage: tuple[tuple[str, str, int, int], ...] = (
        ("anthropic", "claude-sonnet-4-5", 2, 15470),
        ("openai", "gpt-5.1", 4, 3939),
    )
    model_seen: tuple[tuple[str, str], ...] = (
        ("anthropic", "claude-sonnet-4-5"),
        ("openai", "gpt-5.1"),
    )


MAIN = MainExpectations()


def main_usage_totals() -> dict[str, int]:
    """Recompute MAIN token/cost totals from ``MAIN_USAGE`` independently.

    Returns a dict with ``input_tokens`` ... ``cost_total_micro`` keys. Used by
    the self-check test in ``tests/fixtures/test_corpus_contract.py`` so a typo
    in ``MainExpectations`` cannot silently pass.
    """
    totals = {
        "input_tokens": 0,
        "output_tokens": 0,
        "reasoning_tokens": 0,
        "cache_read_tokens": 0,
        "cache_write_tokens": 0,
        "total_tokens": 0,
        "cost_input_micro": 0,
        "cost_output_micro": 0,
        "cost_cache_read_micro": 0,
        "cost_cache_write_micro": 0,
        "cost_total_micro": 0,
    }
    for spec in MAIN_USAGE.values():
        tokens = spec["tokens"]
        cost = spec["cost"]
        totals["input_tokens"] += tokens["input"]
        totals["output_tokens"] += tokens["output"]
        totals["reasoning_tokens"] += tokens["reasoning"]
        totals["cache_read_tokens"] += tokens["cache_read"]
        totals["cache_write_tokens"] += tokens["cache_write"]
        totals["total_tokens"] += _token_total(tokens, spec["recorded_total"])
        totals["cost_input_micro"] += micro(cost.get("input", 0))
        totals["cost_output_micro"] += micro(cost.get("output", 0))
        totals["cost_cache_read_micro"] += micro(cost.get("cacheRead", 0))
        totals["cost_cache_write_micro"] += micro(cost.get("cacheWrite", 0))
        recorded_total = cost.get("total")
        totals["cost_total_micro"] += (
            micro(recorded_total)
            if recorded_total is not None
            else micro(cost.get("input", 0))
            + micro(cost.get("output", 0))
            + micro(cost.get("cacheRead", 0))
            + micro(cost.get("cacheWrite", 0))
        )
    return totals


# --------------------------------------------------------------------------- #
# Midnight / range session
# --------------------------------------------------------------------------- #

BETA_BEFORE_MIDNIGHT = "2026-01-15T23:58:00.000Z"
BETA_AFTER_MIDNIGHT = "2026-01-16T00:02:00.000Z"
BETA_ID_ENTRY = "b-a1"
BETA_ID_ENTRY_2 = "b-a2"
BETA_TOKENS = {"input": 300, "output": 40, "reasoning": 0, "cache_read": 0, "cache_write": 0}
BETA_COST = {"input": "0.0003", "output": "0.0002", "total": "0.0005"}


def beta_session_records() -> list[j.JsonLine]:
    """One session straddling a UTC midnight boundary with two usage records."""
    usage = j.usage_object(total_tokens=340, cost=BETA_COST, **BETA_TOKENS)
    return [
        j.session_header(
            BETA_ID, timestamp=BETA_BEFORE_MIDNIGHT, cwd="/work/beta"
        ),
        j.user_message(
            "b-u1",
            "Check usage around midnight.",
            timestamp=BETA_BEFORE_MIDNIGHT,
        ),
        j.assistant_message(
            BETA_ID_ENTRY,
            timestamp=BETA_BEFORE_MIDNIGHT,
            parent_id="b-u1",
            provider="openai",
            model="gpt-5.1",
            text="Before midnight.",
            usage=usage,
        ),
        j.assistant_message(
            BETA_ID_ENTRY_2,
            timestamp=BETA_AFTER_MIDNIGHT,
            parent_id=BETA_ID_ENTRY,
            provider="openai",
            model="gpt-5.1",
            text="After midnight.",
            usage=usage,
        ),
    ]


BETA = {
    "session_id": BETA_ID,
    "timezone_boundary_utc": "2026-01-16T00:00:00.000Z",
    "title": "Check usage around midnight.",
    "cwd": "/work/beta",
    "entry_count": 3,
    "usage_record_count": 2,
    # Two identical usage records still count twice (different entries).
    "input_tokens": 600,
    "output_tokens": 80,
    "reasoning_tokens": 0,
    "cache_read_tokens": 0,
    "cache_write_tokens": 0,
    "total_tokens": 680,
    "cost_input_micro": 600,
    "cost_output_micro": 400,
    "cost_cache_read_micro": 0,
    "cost_cache_write_micro": 0,
    "cost_total_micro": 1000,
    "started_at": BETA_BEFORE_MIDNIGHT,
    "last_activity_at": BETA_AFTER_MIDNIGHT,
}

# --------------------------------------------------------------------------- #
# Relationship corpus
# --------------------------------------------------------------------------- #

PARENT_START = "2026-01-14T08:00:00.000Z"
CHILD_COST = "0.02"
CHILD_COST_MICRO = micro(CHILD_COST)


def child_session_records(
    child_id: str, *, title: str, cwd: str = "/work/alpha", cost: str = CHILD_COST
) -> list[j.JsonLine]:
    """Minimal child session whose whole cost is one assistant usage record."""
    started = "2026-01-14T09:00:00.000Z"
    return [
        j.session_header(child_id, timestamp=started, cwd=cwd, parent_session="parent.jsonl"),
        j.user_message("c-u1", title, timestamp=started),
        j.assistant_message(
            f"c-a1-{child_id[:8]}",
            timestamp=started,
            parent_id="c-u1",
            text=f"Child answer for {title}.",
            usage=j.usage_object(
                input=100,
                output=50,
                cache_read=0,
                cache_write=0,
                total_tokens=150,
                cost={"input": cost, "total": cost},
            ),
        ),
    ]


def parent_session_records() -> list[j.JsonLine]:
    """Parent session that mentions every child and decoy id in its text."""
    mentioned = " ".join(MAPPED_CHILD_IDS + DECOY_SESSION_IDS)
    lines = [
        j.session_header(PARENT_ID, timestamp=PARENT_START, cwd="/work/alpha"),
        j.user_message(
            "p-u1",
            "Launch five sub-agents and reconcile their reports.",
            timestamp=PARENT_START,
        ),
        j.assistant_message(
            "p-a1",
            timestamp=PARENT_START,
            parent_id="p-u1",
            text="Spawning sub-agents.",
            tool_calls=[j.tool_call_block("p-call-1", "subagent", {"task": "inspect parser"})],
            usage=j.usage_object(
                input=500,
                output=100,
                total_tokens=600,
                cost={"input": "0.0005", "output": "0.0002", "total": "0.0007"},
            ),
        ),
        j.tool_result_message(
            "p-r1",
            call_id="p-call-1",
            tool_name="subagent",
            output="child sessions:\n" + mentioned,
            timestamp=PARENT_START,
            parent_id="p-a1",
        ),
        j.user_message(
            "p-u2",
            # A UUID mention in prose must never create a relationship.
            f"Unrelated ids seen in copied source: {mentioned}",
            timestamp=PARENT_START,
            parent_id="p-r1",
        ),
    ]
    return lines


PARENT = {
    "session_id": PARENT_ID,
    "tool_call_id": "p-call-1",
    "tool_name": "subagent",
    "mapped_child_cost_micro": CHILD_COST_MICRO,
    "decoy_child_cost_micro": CHILD_COST_MICRO,
    "combined_cost_micro_with_mapped_children": micro("0.0007") + CHILD_COST_MICRO * len(MAPPED_CHILD_IDS),
    "title": "Launch five sub-agents and reconcile their reports.",
    "cwd": "/work/alpha",
    "entry_count": 4,
    "usage_record_count": 1,
    "cost_total_micro": micro("0.0007"),
    "total_tokens": 600,
}

# --------------------------------------------------------------------------- #
# Metadata / unknown-shape session
# --------------------------------------------------------------------------- #

METADATA_TIMES = {
    "start": "2026-01-13T10:00:00.000Z",
    "end": "2026-01-13T11:30:00.000Z",
}

METADATA_TITLE = "Metadata and unknown events"


def metadata_session_records() -> list[j.JsonLine]:
    """Every supported metadata event plus unknown roles, blocks and types."""
    start = METADATA_TIMES["start"]
    return [
        j.session_header(METADATA_ID, timestamp=start, cwd="/work/meta"),
        j.message_entry(
            "m-sys",
            "system",
            [j.text_block("You are a helpful coding agent.")],
            timestamp=start,
            sections={"identity": "You are a helpful coding agent.", "empty": None},
            toolsAdded=[{"name": "bash"}, {"name": "edit"}],
            toolsRemoved=[{"name": "legacy_tool"}],
        ),
        j.message_entry(
            "m-unknown-role",
            "mysteryRole",
            [j.text_block("unknown role body")],
            timestamp=start,
        ),
        j.message_entry(
            "m-unknown-blocks",
            "assistant",
            [
                j.unknown_block("futureBlock", payload={"nested": True}),
                j.thinking_block("redacted thinking", redacted=True),
                j.text_block("known text next to unknown blocks"),
            ],
            timestamp=start,
            provider="anthropic",
            model="claude-sonnet-4-5",
            usage=j.usage_object(
                input=10,
                output=5,
                total_tokens=15,
                cost={"total": "0.000015"},
            ),
        ),
        j.message_entry(
            "m-bash",
            "bashExecution",
            [j.text_block("echo hello")],
            timestamp=start,
            command="echo hello",
            output="hello\n",
            exitCode=0,
            cancelled=False,
            truncated=False,
        ),
        j.compaction(
            "m-compact",
            summary="summary of the metadata session",
            timestamp=start,
            tokens_before=1200,
        ),
        j.branch_summary("m-branch", summary="branch summary text", timestamp=start),
        j.custom("m-custom", custom_type="note", data={"text": "custom payload"}, timestamp=start),
        j.custom_message(
            "m-custom-message",
            custom_type="hook",
            text="hook injected message",
            timestamp=start,
            display=False,
        ),
        j.label(
            "m-label-set",
            target_id="m-unknown-blocks",
            label_text="  spaced label  ",
            timestamp=start,
        ),
        j.label("m-label-cleared", target_id="m-unknown-blocks", label_text=None, timestamp=start),
        j.session_info("m-name-set", name="Metadata and unknown events", timestamp=start),
        j.session_info("m-name-cleared", name=None, timestamp=start),
        j.thinking_level_change("m-thinking", thinking_level="low", timestamp=start),
        j.model_change(
            "m-model-change",
            provider="openai",
            model_id="gpt-5.1",
            timestamp=start,
        ),
        j.unknown_entry("m-unknown-type", entry_type="brand_new_event", timestamp=start),
        j.unknown_entry("m-duplicate-header", entry_type="session", timestamp=start, cwd="/work/meta"),
        j.unknown_entry("m-no-timestamp", entry_type="future_event"),
    ]


METADATA = {
    "session_id": METADATA_ID,
    "entry_count": 17,
    "message_count": 4,
    "system_message_count": 1,
    "usage_record_count": 1,
    "cost_total_micro": micro("0.000015"),
    "total_tokens": 15,
    "unknown_entry_count": 3,
    # The last session_info clears the name and there is no user message, so
    # the title is the untitled fallback.
    "title": "(untitled session)",
    "cleared_name": True,
    # The last label entry for the target has no ``label`` field (cleared).
    "final_label": None,
    # Diagnostic codes the metadata corpus is designed to trigger, in order.
    "issue_codes": (
        "unknown_entry_type",
        "duplicate_header",
        "unknown_entry_type",
    ),
    "unknown_block_type": "futureBlock",
    "unknown_role": "mysteryRole",
    "bash_command": "echo hello",
    "custom_type": "note",
    "custom_message_type": "hook",
    "custom_message_display": False,
}

# --------------------------------------------------------------------------- #
# Long transcript
# --------------------------------------------------------------------------- #

LONG_ENTRY_PAIRS = 40
LONG_TOOL_OUTPUT_CHARS = 20_000
LONG_START = "2026-01-12T06:00:00.000Z"


def long_session_records(pairs: int = LONG_ENTRY_PAIRS) -> list[j.JsonLine]:
    """Long transcript plus one unbroken multi-KB tool output string."""
    records: list[j.JsonLine] = [
        j.session_header(LONG_ID, timestamp=LONG_START, cwd="/work/long"),
    ]
    for index in range(pairs):
        records.append(
            j.user_message(
                f"l-u{index}",
                f"Follow-up question {index}: " + ("detail " * 20),
                timestamp=LONG_START,
            )
        )
        records.append(
            j.assistant_message(
                f"l-a{index}",
                timestamp=LONG_START,
                parent_id=f"l-u{index}",
                text=f"Answer {index}",
                usage=j.usage_object(
                    input=10,
                    output=5,
                    total_tokens=15,
                    cost={"total": "0.00001"},
                ),
            )
        )
    records.append(
        j.tool_result_message(
            "l-r1",
            call_id="l-call-1",
            output="x" * LONG_TOOL_OUTPUT_CHARS,
            timestamp=LONG_START,
        )
    )
    return records


LONG = {
    "session_id": LONG_ID,
    "title_prefix": "Follow-up question 0:",
    "entry_count": LONG_ENTRY_PAIRS * 2 + 1,
    "usage_record_count": LONG_ENTRY_PAIRS,
    "total_tokens": LONG_ENTRY_PAIRS * 15,
    "cost_total_micro": LONG_ENTRY_PAIRS * micro("0.00001"),
    "longest_string_chars": LONG_TOOL_OUTPUT_CHARS,
}

# --------------------------------------------------------------------------- #
# Edge-case file contents (raw strings, never parsed by the builders)
# --------------------------------------------------------------------------- #

EDGE_CASE_FILES: dict[str, str] = {
    # 1 line: header only.
    "edge/header_only.jsonl": j.to_jsonl(
        [j.session_header("55555555-5555-4555-8555-555555555555", cwd="/work/edge")]
    ),
    # Empty file (0 bytes).
    "edge/empty.jsonl": "",
    # Malformed JSON between two valid entries.
    "edge/malformed.jsonl": j.to_jsonl(
        [
            j.session_header("66666666-6666-4666-8666-666666666666", cwd="/work/edge"),
            j.user_message("e-u1", "before the broken line"),
            "{not valid json",
            j.assistant_message(
                "e-a1",
                timestamp=j.DEFAULT_TIMESTAMP,
                parent_id="e-u1",
                text="after the broken line",
                usage=j.usage_object(
                    input=5, output=5, total_tokens=10, cost={"total": "0.00001"}
                ),
            ),
        ]
    ),
    # First line is not a session header.
    "edge/no_header.jsonl": j.to_jsonl([j.user_message("n-u1", "no header here")]),
    # Blank lines interspersed; must be skipped without diagnostics.
    "edge/blank_lines.jsonl": j.to_jsonl(
        [
            j.session_header("77777777-7777-4777-8777-777777777777", cwd="/work/edge"),
            "",
            j.user_message("b-u1", "message after a blank line"),
            "   ",
        ]
    ),
    # Unsafe payloads for Markdown/ANSI rendering tests.
    "edge/unsafe_content.jsonl": j.to_jsonl(
        [
            j.session_header("88888888-8888-4888-8888-888888888888", cwd="/work/edge"),
            j.user_message(
                "x-u1",
                "<script>alert('xss')</script> "
                '<img src=x onerror="alert(1)"> '
                "[click](javascript:alert(1)) "
                "[file](file:///etc/passwd) "
                "\u001b[31mred terminal text\u001b[0m",
            ),
            j.assistant_message(
                "x-a1",
                timestamp=j.DEFAULT_TIMESTAMP,
                parent_id="x-u1",
                text="<b>bold?</b> and `code` and \u001b[1mbold ansi\u001b[0m",
            ),
        ]
    ),
}

#: Files in ``EDGE_CASE_FILES`` that production must treat as *failed* files.
EDGE_CASE_ERROR_FILES = ("edge/empty.jsonl", "edge/no_header.jsonl")
#: Files that parse partially (valid entries plus diagnostics).
EDGE_CASE_PARTIAL_FILES = ("edge/malformed.jsonl",)
#: Files written by the ``"full"`` variant (all corpus sessions incl. edge cases).
FULL_VARIANT_FILES = 19
#: Sessions the ``"full"`` variant indexes (every file except the two failures).
FULL_VARIANT_INDEXED_SESSIONS = FULL_VARIANT_FILES - len(EDGE_CASE_ERROR_FILES)
#: Sync status expected after indexing the ``"full"`` corpus unchanged.
FULL_VARIANT_SYNC_STATUS = "partial"

EDGE = {
    "header_only_entry_count": 0,
    "malformed_valid_entries": 2,
    "blank_lines_entry_count": 1,
    "malformed_session_id": "66666666-6666-4666-8666-666666666666",
    "header_only_session_id": "55555555-5555-4555-8555-555555555555",
}

# --------------------------------------------------------------------------- #
# Corpus writers
# --------------------------------------------------------------------------- #

#: Relative path -> record list. Built lazily so imports stay cheap.
FileSpec = tuple[str, list[j.JsonLine] | str]


@dataclass
class Corpus:
    """Paths written by :func:`write_corpus`, keyed by logical name."""

    root: Path
    sessions: dict[str, Path] = field(default_factory=dict)

    def path(self, name: str) -> Path:
        return self.sessions[name]


def corpus_file_specs() -> list[FileSpec]:
    """Every non-edge file of the ``"full"`` variant as ``(relative, records)``."""
    specs: list[FileSpec] = [
        ("alpha/2026-01-15T09-00-00_main.jsonl", main_session_records()),
        ("beta/2026-01-15T23-58-00_beta.jsonl", beta_session_records()),
        ("parent/2026-01-14T08-00-00_parent.jsonl", parent_session_records()),
        ("meta/2026-01-13T10-00-00_meta.jsonl", metadata_session_records()),
        ("long/2026-01-12T06-00-00_long.jsonl", long_session_records()),
    ]
    for index, child_id in enumerate(MAPPED_CHILD_IDS):
        specs.append(
            (
                f"parent/children/child-{index + 1}.jsonl",
                child_session_records(child_id, title=f"Mapped child {index + 1}"),
            )
        )
    for index, decoy_id in enumerate(DECOY_SESSION_IDS):
        specs.append(
            (
                f"parent/decoy/decoy-{index + 1}.jsonl",
                child_session_records(decoy_id, title=f"Decoy session {index + 1}"),
            )
        )
    return specs


def write_corpus(sessions_dir: Path, variant: str = "full") -> Corpus:
    """Write a corpus variant under ``sessions_dir`` and return its paths.

    ``variant`` is ``"empty"``, ``"none"`` (edge cases only) or ``"full"``.
    Names in :attr:`Corpus.sessions` map logical keys (``main``, ``beta``,
    ``parent``, ``meta``, ``long``, ``children``, ``decoys``, ``edge:<stem>``) to
    the written paths. Existing files are overwritten, nothing outside
    ``sessions_dir`` is touched.
    """
    corpus = Corpus(root=sessions_dir)
    sessions_dir.mkdir(parents=True, exist_ok=True)
    if variant == "empty":
        return corpus

    for relative, text in EDGE_CASE_FILES.items():
        corpus.sessions[f"edge:{Path(relative).stem}"] = j.write_session_text(
            sessions_dir / relative, text
        )
    if variant == "none":
        return corpus

    for relative, records in corpus_file_specs():
        path = j.write_jsonl(sessions_dir / relative, records)
        corpus.sessions[_logical_name(relative)] = path
    return corpus


def write_all_corpus(sessions_dir: Path) -> Corpus:
    return write_corpus(sessions_dir, "full")


def _logical_name(relative: str) -> str:
    stem = Path(relative).stem.split("_")[-1]
    if "children" in relative:
        return "children"
    if "decoy" in relative:
        return "decoys"
    return stem


def write_single_session(
    sessions_dir: Path, records: list[j.JsonLine], *, name: str = "session.jsonl"
) -> Path:
    """Write one ad-hoc session file (used by tests that mutate a fixture)."""
    return j.write_jsonl(sessions_dir / name, records)
