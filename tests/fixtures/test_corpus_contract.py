"""Self-checks for the shared fixture corpus.

These tests import no production modules beyond the parser's public entry point
for one smoke comparison; they exist so a typo in the fixture expectations
fails loudly *before* Worker 2-4 assertions are written against them.
"""

from __future__ import annotations

import json

from tests.fixtures import corpus, jsonl


def test_main_expectations_match_independent_arithmetic():
    totals = corpus.main_usage_totals()
    assert totals["input_tokens"] == corpus.MAIN.input_tokens
    assert totals["output_tokens"] == corpus.MAIN.output_tokens
    assert totals["reasoning_tokens"] == corpus.MAIN.reasoning_tokens
    assert totals["cache_read_tokens"] == corpus.MAIN.cache_read_tokens
    assert totals["cache_write_tokens"] == corpus.MAIN.cache_write_tokens
    assert totals["total_tokens"] == corpus.MAIN.total_tokens
    assert totals["cost_input_micro"] == corpus.MAIN.cost_input_micro
    assert totals["cost_output_micro"] == corpus.MAIN.cost_output_micro
    assert totals["cost_cache_read_micro"] == corpus.MAIN.cost_cache_read_micro
    assert totals["cost_cache_write_micro"] == corpus.MAIN.cost_cache_write_micro
    assert totals["cost_total_micro"] == corpus.MAIN.cost_total_micro


def test_main_counts_match_record_list():
    records = corpus.main_session_records()
    assert len(records) - 1 == corpus.MAIN.entry_count  # minus the header
    types = [record["type"] for record in records[1:]]
    assert types.count("message") == corpus.MAIN.message_count
    assert types.count("model_change") == corpus.MAIN.model_change_count
    assert types.count("thinking_level_change") == corpus.MAIN.thinking_level_change_count
    assert types.count("usage") == corpus.MAIN.usage_entry_count
    assert types.count("compaction") == corpus.MAIN.compaction_count
    assert types.count("context_edit") == corpus.MAIN.context_edit_count
    assert types.count("branch_summary") == corpus.MAIN.branch_summary_count
    assert types.count("custom") == corpus.MAIN.custom_count
    assert types.count("custom_message") == corpus.MAIN.custom_message_count
    assert types.count("label") == corpus.MAIN.label_count
    assert types.count("session_info") == corpus.MAIN.session_info_count
    assert types.count("future_event") == corpus.MAIN.unknown_entry_count


def test_micro_rounds_half_up_without_floats():
    assert corpus.micro("0.0036") == 3600
    assert corpus.micro("0.0012297") == 1230
    assert corpus.micro("0.0000005") == 1  # half-up from a decimal string
    assert corpus.micro("0") == 0


def test_corpus_writer_layout(tmp_path):
    written = corpus.write_corpus(tmp_path / "sessions", "full")
    names = set(written.sessions)
    assert {
        "main",
        "beta",
        "parent",
        "meta",
        "long",
        "children",
        "decoys",
        "edge:empty",
        "edge:header_only",
        "edge:malformed",
        "edge:no_header",
        "edge:blank_lines",
        "edge:unsafe_content",
    } <= names
    for path in written.sessions.values():
        assert path.is_file()
    assert not list(tmp_path.rglob("*.sqlite"))


def test_empty_corpus_has_no_files(tmp_path):
    written = corpus.write_corpus(tmp_path / "sessions", "empty")
    assert written.sessions == {}
    assert list((tmp_path / "sessions").rglob("*.jsonl")) == []


def test_jsonl_builders_are_json_only_and_order_preserving():
    records = corpus.main_session_records()
    text = jsonl.to_jsonl(records)
    assert text.endswith("\n")
    parsed = [json.loads(line) for line in text.splitlines()]
    assert parsed == records
    assert parsed[0]["type"] == "session"
    assert jsonl.epoch_ms("2026-01-15T09:00:00.000Z") == 1768467600000


def test_nested_message_timestamp_is_epoch_milliseconds():
    entry = jsonl.assistant_message("a1", text="hi")
    assert isinstance(entry["message"]["timestamp"], int)
    assert entry["timestamp"] == jsonl.DEFAULT_TIMESTAMP


def test_relationship_ids_are_consistent():
    assert len(set(corpus.MAPPED_CHILD_IDS)) == 5
    assert not set(corpus.MAPPED_CHILD_IDS) & set(corpus.DECOY_SESSION_IDS)
    parent = corpus.parent_session_records()
    joined = jsonl.to_jsonl(parent)
    for session_id in corpus.MAPPED_CHILD_IDS + corpus.DECOY_SESSION_IDS:
        assert session_id in joined
