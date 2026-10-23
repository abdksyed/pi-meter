"""Unit tests for the pure session parser (``app/services/parser.py``).

Everything here is in-memory: records come from ``tests/fixtures`` builders and
are parsed with the ``parse_records`` / ``parse_text`` fixtures. No file outside
``tmp_path`` is written or read and no database is touched.

Expectations come from ``tests.fixtures.corpus`` (independently computed) rather
than from re-running production helpers.
"""

from __future__ import annotations

from pathlib import Path

from tests.fixtures import corpus
from tests.fixtures import jsonl as j

from app.services.parser import parse_iso_ms, parse_session_file, parse_session_lines

MAIN_RECORDS = corpus.main_session_records()


def _normalized(session) -> tuple:
    """Comparable projection of everything the three entry points must agree on."""
    return (
        session.session_id,
        session.title,
        session.title_source,
        session.cwd,
        session.version,
        session.parse_status,
        session.totals,
        session.counts,
        [
            (e.entry_index, e.line_number, e.entry_type, e.entry_id, e.parent_id, e.raw)
            for e in session.entries
        ],
        [r.raw for r in session.usage_records],
        [(i.code, i.severity, i.line_number) for i in session.issues],
    )


# --------------------------------------------------------------------------- #
# Entry points
# --------------------------------------------------------------------------- #


def test_three_entry_points_produce_equivalent_results(parse_text, tmp_path: Path):
    text = j.to_jsonl(MAIN_RECORDS)

    from_text = parse_text(text)
    from_lines = parse_session_lines(text.split("\n"))
    path = j.write_session_text(tmp_path / "main.jsonl", text)
    from_file = parse_session_file(path)

    assert _normalized(from_text) == _normalized(from_lines) == _normalized(from_file)


def test_file_entry_point_records_path_and_size(tmp_path: Path):
    text = j.to_jsonl(MAIN_RECORDS)
    path = j.write_session_text(tmp_path / "main.jsonl", text)

    parsed = parse_session_file(path)

    assert parsed.file_path == path
    assert parsed.file_size == len(text.encode("utf-8"))
    assert parsed.file_mtime_ns == path.stat().st_mtime_ns


def test_unreadable_file_reports_error(tmp_path: Path):
    parsed = parse_session_file(tmp_path / "missing.jsonl")

    assert parsed.parse_status == "error"
    assert parsed.entries == []
    assert [issue.code for issue in parsed.issues] == ["file_read_error"]


def test_bytes_lines_and_crlf_and_bom_are_accepted(parse_text):
    text = j.to_jsonl(MAIN_RECORDS)
    expected = parse_text(text).session_id

    assert parse_session_lines([line.encode() for line in text.split("\n")]).session_id == expected
    assert parse_text(text.replace("\n", "\r\n")).session_id == expected
    assert parse_text("\ufeff" + text).session_id == expected


# --------------------------------------------------------------------------- #
# Header
# --------------------------------------------------------------------------- #


def test_header_fields_are_parsed(parse_text):
    parsed = parse_text(j.to_jsonl(MAIN_RECORDS))

    assert parsed.header is not None
    assert parsed.header.raw == MAIN_RECORDS[0]
    assert parsed.session_id == corpus.MAIN_ID
    assert parsed.cwd == corpus.MAIN_CWD
    assert parsed.version == 3
    assert parsed.header.timestamp_ms == j.epoch_ms(corpus.MAIN_TIMES["start"])


def test_missing_header_is_fatal(parse_text):
    parsed = parse_text(corpus.EDGE_CASE_FILES["edge/no_header.jsonl"])

    assert parsed.parse_status == "error"
    assert parsed.parse_error == "first JSON object is not a session header"
    assert parsed.entries == []
    assert [issue.code for issue in parsed.issues] == ["missing_header"]


def test_invalid_header_id_is_fatal(parse_text):
    parsed = parse_text(j.to_jsonl([{"type": "session", "id": "   "}]))

    assert parsed.parse_status == "error"
    assert parsed.session_id is None
    assert parsed.issues[0].code == "invalid_header"


def test_empty_file_is_fatal(parse_text):
    parsed = parse_text(corpus.EDGE_CASE_FILES["edge/empty.jsonl"])

    assert parsed.parse_status == "error"
    assert parsed.parse_error == "empty file"
    assert parsed.entries == []


def test_version_warnings_are_reported(parse_text):
    legacy = parse_text(j.to_jsonl([j.session_header("s1", version=1)]))
    future = parse_text(j.to_jsonl([j.session_header("s2", version=9)]))
    non_integer = parse_text(j.to_jsonl([{"type": "session", "id": "s3", "version": "3"}]))

    assert [(i.code, i.severity) for i in legacy.issues] == [("legacy_version", "warning")]
    assert [(i.code, i.severity) for i in future.issues] == [("future_version", "warning")]
    assert [(i.code, i.severity) for i in non_integer.issues] == [("legacy_version", "warning")]
    # A non-integer version is assumed to be 1 rather than rejected.
    assert non_integer.version == 1


def test_invalid_header_timestamp_is_a_warning(parse_text):
    parsed = parse_text(j.to_jsonl([{"type": "session", "id": "s1", "timestamp": "yesterday"}]))

    assert parsed.parse_status == "ok"
    assert parsed.header.timestamp_ms is None
    assert [i.code for i in parsed.issues] == ["legacy_version", "invalid_timestamp"]
    assert parsed.issues[1].severity == "warning"


def test_parse_iso_ms_accepts_offsets_and_rejects_garbage():
    assert parse_iso_ms("2026-01-15T09:00:00.000Z") == j.epoch_ms("2026-01-15T09:00:00.000Z")
    assert parse_iso_ms(" 2026-01-15T09:00:00.500Z ") == j.epoch_ms("2026-01-15T09:00:00.500Z")
    assert parse_iso_ms("2026-01-15T09:00:00") == j.epoch_ms("2026-01-15T09:00:00.000Z")
    assert parse_iso_ms("not-a-timestamp") is None
    assert parse_iso_ms(None) is None
    assert parse_iso_ms("   ") is None


# --------------------------------------------------------------------------- #
# Ordering, losslessness, diagnostics
# --------------------------------------------------------------------------- #


def test_raw_order_ids_and_payloads_are_preserved(parse_records):
    parsed = parse_records(MAIN_RECORDS)

    assert [e.entry_index for e in parsed.entries] == list(range(corpus.MAIN.entry_count))
    assert [e.raw for e in parsed.entries] == MAIN_RECORDS[1:]
    assert parsed.header.raw == MAIN_RECORDS[0]
    assert [e.entry_id for e in parsed.entries] == [r["id"] for r in MAIN_RECORDS[1:]]
    # ``parentId`` is only present on some entries; missing becomes ``None``.
    assert parsed.entries[0].parent_id is None
    assert parsed.entries[1].parent_id == "u1"


def test_malformed_lines_are_skipped_and_later_lines_still_parse(parse_text):
    parsed = parse_text(corpus.EDGE_CASE_FILES["edge/malformed.jsonl"])

    assert parsed.parse_status == "partial"
    assert [e.entry_id for e in parsed.entries] == ["e-u1", "e-a1"]
    invalid = [i for i in parsed.issues if i.code == "invalid_json"]
    assert len(invalid) == 1
    assert invalid[0].severity == "error"
    assert invalid[0].line_number == 3
    assert invalid[0].raw_excerpt == "{not valid json"


def test_non_object_json_lines_are_errors(parse_text):
    parsed = parse_text(j.to_jsonl([j.session_header("s1"), "[1, 2, 3]", "ok"]))

    assert parsed.entries == []
    assert [i.code for i in parsed.issues] == ["invalid_json", "invalid_json"]
    assert parsed.issues[0].message == "line is not a JSON object"


def test_blank_lines_are_skipped_without_diagnostics(parse_text):
    parsed = parse_text(corpus.EDGE_CASE_FILES["edge/blank_lines.jsonl"])

    assert parsed.parse_status == "ok"
    assert [e.entry_id for e in parsed.entries] == ["b-u1"]
    assert parsed.issues == []


def test_every_diagnostic_is_retained_in_order(parse_text):
    records = [j.session_header("s1")] + ["{bad"] * 10 + [j.user_message("u1", "ok")]
    parsed = parse_text(j.to_jsonl(records))

    codes = [i.code for i in parsed.issues]
    assert codes.count("invalid_json") == 10
    assert [i.line_number for i in parsed.issues if i.code == "invalid_json"] == list(range(2, 12))
    # Raw excerpts are capped, so a huge broken line cannot bloat diagnostics.
    assert all(len(i.raw_excerpt or "") <= 200 for i in parsed.issues)


def test_missing_entry_ids_get_stable_placeholders(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            {
                "type": "message",
                "timestamp": j.DEFAULT_TIMESTAMP,
                "message": {"role": "user", "content": []},
            },
        ]
    )

    entry = parsed.entries[0]
    assert entry.entry_id == "line-2"
    assert "missing_field" in [i.code for i in entry.issues]


def test_unknown_entry_types_are_preserved(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.unknown_entry("u1", entry_type="brand_new_event", payload={"a": 1}),
        ]
    )

    entry = parsed.entries[0]
    assert entry.entry_type == "brand_new_event"
    assert entry.unknown is not None
    assert entry.unknown.raw_type == "brand_new_event"
    assert entry.raw["payload"] == {"a": 1}
    assert [i.code for i in parsed.issues] == ["unknown_entry_type"]
    assert parsed.issues[0].severity == "info"


def test_duplicate_session_header_is_preserved_as_unknown_entry(parse_records):
    parsed = parse_records(
        [j.session_header("s1"), j.session_header("s1", cwd="/elsewhere")]
    )

    entry = parsed.entries[0]
    assert entry.entry_type == "session"
    assert entry.unknown is not None and entry.unknown.raw_type == "session"
    assert [i.code for i in parsed.issues] == ["duplicate_header"]
    assert parsed.session_id == "s1"


# --------------------------------------------------------------------------- #
# Timestamps, duration, timeline
# --------------------------------------------------------------------------- #


def test_canonical_entry_timestamp_wins_over_nested_message_timestamp(parse_records):
    record = j.assistant_message("a1", text="hi", timestamp="2026-02-01T00:00:00.000Z")
    record["message"]["timestamp"] = j.epoch_ms("2026-01-01T00:00:00.000Z")

    entry = parse_records([j.session_header("s1"), record]).entries[0]

    assert entry.timestamp_ms == j.epoch_ms("2026-02-01T00:00:00.000Z")
    assert entry.message_started_at_ms == j.epoch_ms("2026-01-01T00:00:00.000Z")


def test_invalid_entry_timestamp_falls_back_to_nested_message_timestamp(parse_records):
    record = j.assistant_message("a1", text="hi", timestamp="2026-02-01T00:00:00.000Z")
    record["timestamp"] = "not-a-timestamp"

    parsed = parse_records([j.session_header("s1"), record])

    assert parsed.entries[0].timestamp_ms == j.epoch_ms("2026-02-01T00:00:00.000Z")
    assert "invalid_timestamp" in [i.code for i in parsed.issues]
    assert parsed.parse_status == "ok"


def test_duration_uses_recorded_value_then_timestamp_delta(parse_records):
    recorded = j.assistant_message(
        "a1", text="x", timestamp="2026-01-15T09:00:04.000Z", duration_ms=4000
    )
    derived = j.assistant_message("a2", text="x", timestamp="2026-01-15T09:00:04.000Z")
    derived["message"]["timestamp"] = j.epoch_ms("2026-01-15T09:00:00.000Z")

    entries = parse_records([j.session_header("s1"), recorded, derived]).entries

    assert entries[0].duration_ms == 4000
    assert entries[1].duration_ms == 4000


def test_session_timeline_matches_corpus(parse_records):
    parsed = parse_records(MAIN_RECORDS)

    assert parsed.started_at_ms == j.epoch_ms(corpus.MAIN.started_at)
    assert parsed.last_activity_at_ms == j.epoch_ms(corpus.MAIN.last_activity_at)
    assert parsed.duration_ms == (
        j.epoch_ms(corpus.MAIN.last_activity_at) - j.epoch_ms(corpus.MAIN.started_at)
    )


def test_timeline_falls_back_to_first_entry_then_file_mtime(parse_text):
    header = j.session_header("s1")
    header.pop("timestamp")
    first_entry = j.user_message("u1", "q", timestamp="2026-01-15T10:00:00.000Z")

    assert parse_text(j.to_jsonl([header, first_entry])).started_at_ms == j.epoch_ms(
        "2026-01-15T10:00:00.000Z"
    )

    header_only = parse_text(j.to_jsonl([header]), file_mtime_ns=1_700_000_000_123_456_789)
    assert header_only.started_at_ms == 1_700_000_000_123


# --------------------------------------------------------------------------- #
# Title precedence
# --------------------------------------------------------------------------- #


def test_title_prefers_session_info(parse_records):
    parsed = parse_records(MAIN_RECORDS)

    assert parsed.name == corpus.MAIN_TITLE
    assert parsed.title == corpus.MAIN.title
    assert parsed.title_source == "session_info"


def test_title_falls_back_to_first_user_message_and_normalizes_whitespace(parse_records):
    parsed = parse_records(
        [j.session_header("s1"), j.user_message("u1", "  Hello \n  world   again  ")]
    )

    assert parsed.name is None
    assert parsed.first_user_message == "Hello world again"
    assert parsed.title == "Hello world again"
    assert parsed.title_source == "first_user_message"


def test_title_is_truncated_at_120_characters(parse_records):
    exact = parse_records([j.session_header("s1"), j.user_message("u1", "B" * 120)])
    longer = parse_records([j.session_header("s1"), j.user_message("u1", "C" * 119 + " D")])

    assert exact.title == "B" * 120
    assert exact.title_source == "first_user_message"
    assert longer.first_user_message == "C" * 119 + " D"
    assert longer.title == "C" * 119 + "\u2026"
    assert len(longer.title) == 120


def test_cleared_session_name_falls_back_to_first_user_message(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.user_message("u1", "first message"),
            j.session_info("si1", name="Named session"),
            j.session_info("si2", name=None),
        ]
    )

    assert parsed.name is None
    assert parsed.title == "first message"
    assert parsed.title_source == "first_user_message"


def test_untitled_session_uses_fallback_title(parse_records):
    parsed = parse_records(corpus.metadata_session_records())

    assert parsed.title == corpus.METADATA["title"]
    assert parsed.title_source == "fallback"


# --------------------------------------------------------------------------- #
# Entry-type coverage / counts
# --------------------------------------------------------------------------- #


def test_main_counts_match_corpus_expectations(parse_records):
    counts = parse_records(MAIN_RECORDS).counts

    for field in (
        "entry_count",
        "message_count",
        "user_message_count",
        "assistant_message_count",
        "tool_result_count",
        "tool_call_count",
        "model_change_count",
        "thinking_level_change_count",
        "usage_entry_count",
        "compaction_count",
        "context_edit_count",
        "branch_summary_count",
        "custom_count",
        "custom_message_count",
        "label_count",
        "session_info_count",
        "unknown_entry_count",
    ):
        assert getattr(counts, field) == getattr(corpus.MAIN, field), field


def test_metadata_corpus_counts_and_issue_codes(parse_records):
    parsed = parse_records(corpus.metadata_session_records())

    assert parsed.counts.entry_count == corpus.METADATA["entry_count"]
    assert parsed.counts.message_count == corpus.METADATA["message_count"]
    assert parsed.counts.system_message_count == corpus.METADATA["system_message_count"]
    assert parsed.counts.unknown_entry_count == corpus.METADATA["unknown_entry_count"]
    assert tuple(i.code for i in parsed.issues if i.code != "multiple_roots") == (
        corpus.METADATA["issue_codes"]
    )
    assert parsed.parse_status == "ok"


def test_tool_results_are_all_kept_once_including_orphans(parse_records):
    parsed = parse_records(MAIN_RECORDS)

    results = [e for e in parsed.entries if e.role == "toolResult"]
    assert [e.tool_call_id for e in results] == ["call-1", "call-2", "call-missing"]
    assert parsed.counts.tool_call_count == 2
    assert parsed.counts.tool_result_count == 3


def test_tool_call_and_result_metadata_is_exposed(parse_records):
    parsed = parse_records(MAIN_RECORDS)
    by_id = {e.entry_id: e for e in parsed.entries}

    call_block = next(b for b in by_id["a2"].message.content if b.type == "toolCall")
    assert call_block.tool_call.id == "call-2"
    assert call_block.tool_call.name == "edit"
    assert call_block.tool_call.arguments_error == "unexpected end of JSON input"

    failed = by_id["r2"]
    assert failed.tool_name == "edit"
    assert failed.is_error is True
    assert by_id["r1"].is_error is False


def test_model_and_thinking_level_state_are_tracked(parse_records):
    parsed = parse_records(MAIN_RECORDS)
    by_id = {e.entry_id: e for e in parsed.entries}

    change = by_id["mc1"].model_change
    assert change.provider == "openai"
    assert change.model_id == "gpt-5.1"
    assert change.previous_provider == "anthropic"
    assert change.previous_model_id == "claude-sonnet-4-5"

    thinking = by_id["tl1"].thinking_level_change
    assert thinking.thinking_level == "high"
    # Only ``thinking_level_change`` entries feed the previous level; the
    # assistant message's own ``thinkingLevel`` is not carried forward.
    assert thinking.previous_thinking_level is None

    # Assistant messages without recorded provider/model are attributed the
    # model that was current in file order.
    assert by_id["a1"].model_source == "recorded"
    assert by_id["a1"].provider == "anthropic"
    assert by_id["a3"].provider == "openai"


def test_models_seen_and_distribution(parse_records):
    parsed = parse_records(MAIN_RECORDS)

    assert [(m.provider, m.model) for m in parsed.models_seen] == list(corpus.MAIN.model_seen)
    assert [
        (m.provider, m.model, m.usage_entry_count, m.cost_total_micro)
        for m in parsed.models_with_usage
    ] == list(corpus.MAIN.models_with_usage)


# --------------------------------------------------------------------------- #
# Links: parents, labels, compaction, context edit, branch summary
# --------------------------------------------------------------------------- #


def test_parent_links_and_branch_points(parse_records):
    parsed = parse_records(MAIN_RECORDS)
    by_id = {e.entry_id: e for e in parsed.entries}

    assert by_id["r1"].parent_entry_index == by_id["a1"].entry_index
    # r2, r3 and mc1 all name a2 as their parent -> a2 is a branch point.
    assert by_id["a2"].child_count == 3
    assert by_id["a2"].is_branch_point is True
    assert by_id["a1"].is_branch_point is False


def test_self_parent_and_orphan_parent_become_roots(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.user_message("u1", "x", parent_id="u1"),
            j.user_message("u2", "y", parent_id="does-not-exist"),
        ]
    )

    codes = [i.code for i in parsed.issues]
    assert "self_parent" in codes
    assert "orphan_parent" in codes
    assert [e.parent_id for e in parsed.entries] == [None, "does-not-exist"]
    assert "multiple_roots" in codes


def test_labels_are_resolved_and_clearing_removes_them(parse_records):
    parsed = parse_records(corpus.metadata_session_records())

    # The corpus sets a label then clears it for the same target.
    assert parsed.labels == {}
    labels = [e.label for e in parsed.entries if e.label is not None]
    assert labels[0].label == "spaced label"
    assert labels[0].cleared is False
    assert labels[1].cleared is True


def test_label_on_main_session_resolves_target(parse_records):
    parsed = parse_records(MAIN_RECORDS)

    assert list(parsed.labels) == [corpus.MAIN.label_target_id]
    info = parsed.labels[corpus.MAIN.label_target_id]
    assert info.label == corpus.MAIN.label_text
    assert info.target_entry_index == 1


def test_missing_label_target_is_a_warning(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.user_message("u1", "x"),
            j.label("l1", target_id="nope", label_text="l"),
        ]
    )

    assert parsed.labels["nope"].target_entry_index is None
    assert "missing_label_target" in [i.code for i in parsed.issues]


def test_compaction_context_edit_and_branch_summary_links(parse_records):
    parsed = parse_records(MAIN_RECORDS)
    by_id = {e.entry_id: e for e in parsed.entries}

    compaction = by_id["cmp1"].compaction
    assert compaction.first_kept_entry_index == by_id["a3"].entry_index
    assert compaction.tokens_before == 9000
    assert compaction.read_files == ["app/services/parser.py"]
    assert compaction.modified_files == []

    edit = by_id["ce1"].context_edit
    assert edit.target_entry_index == by_id["r2"].entry_index
    assert edit.target_role == "toolResult"
    assert edit.omitted is False
    assert edit.replacement_content[0].text == "redacted failure detail"

    assert by_id["bs1"].branch_summary.from_entry_index == by_id["a1"].entry_index


def test_message_entry_without_message_object(parse_records):
    parsed = parse_records(
        [j.session_header("s1"), {"type": "message", "id": "m1", "timestamp": j.DEFAULT_TIMESTAMP}]
    )

    entry = parsed.entries[0]
    assert entry.role == "unknown"
    assert entry.message is not None and entry.message.role == "unknown"
    assert entry.message.content == []
    assert [i.code for i in entry.issues] == ["missing_message"]


def test_unknown_and_legacy_hook_roles_are_normalized(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.message_entry("m1", "mysteryRole", [j.text_block("x")]),
            j.message_entry("m2", "hookMessage", [j.text_block("y")]),
            j.message_entry("m3", "", [j.text_block("z")]),
        ]
    )
    by_id = {e.entry_id: e for e in parsed.entries}

    assert by_id["m1"].role == "mysteryRole"
    assert "unknown_message_role" not in [i.code for i in by_id["m1"].issues]
    # A missing role becomes "unknown" and is reported as an info issue.
    assert by_id["m3"].role == "unknown"
    assert [i.code for i in by_id["m3"].issues] == ["unknown_message_role"]
    # Pi's legacy hookMessage role is normalized to custom.
    assert by_id["m2"].role == "custom"
    assert by_id["m2"].message.role == "custom"
    assert [i.code for i in by_id["m2"].issues] == ["legacy_hook_message"]


def test_system_prompt_sections_and_tool_names(parse_records):
    parsed = parse_records(corpus.metadata_session_records())

    system = parsed.entries[0].message.system
    assert system is not None
    assert system.content_text == "You are a helpful coding agent."
    assert system.sections == {
        "identity": "You are a helpful coding agent.",
        "empty": None,
    }
    assert system.section_names == ["identity", "empty"]
    assert system.tools_added_names == ["bash", "edit"]
    assert system.tools_removed_names == ["legacy_tool"]


def test_system_prompt_with_malformed_metadata_degrades_safely(parse_records):
    record = j.message_entry(
        "m-sys",
        "system",
        [j.text_block("prompt")],
        sections="not-a-dict",
        toolsAdded="not-a-list",
        toolsRemoved=[{"no_name": 1}, "plain", {"name": "bash"}],
    )
    system = parse_records([j.session_header("s1"), record]).entries[0].message.system

    assert system.content_text == "prompt"
    assert system.sections == {}
    assert system.section_names == []
    assert system.tools_added_names == []
    assert system.tools_added == []
    # Only dict entries with a string name are exposed as tool names.
    assert system.tools_removed_names == ["bash"]


def test_compaction_details_with_non_string_lists(parse_records):
    record = j.compaction(
        "c1",
        summary="s",
        details={"readFiles": "not-a-list", "modifiedFiles": ["a.py", 7, "b.py"]},
    )
    compaction = parse_records([j.session_header("s1"), record]).entries[0].compaction

    assert compaction.read_files == []
    assert compaction.modified_files == ["a.py", "b.py"]


def test_message_summary_field_is_indexed(parse_records):
    record = j.assistant_message("a1", text="x")
    record["message"]["summary"] = "Short Summary"
    entry = parse_records([j.session_header("s1"), record]).entries[0]

    assert entry.message.summary == "Short Summary"
    assert "short summary" in entry.search_text


def test_bash_execution_data_and_search_text(parse_records):
    parsed = parse_records(corpus.metadata_session_records())
    bash = next(e for e in parsed.entries if e.role == "bashExecution")

    assert bash.message.bash is not None
    assert bash.message.bash.command == corpus.METADATA["bash_command"]
    assert bash.message.bash.output == "hello\n"
    assert bash.message.bash.exit_code == 0
    assert bash.is_error is False
    assert bash.content_summary is not None and bash.content_summary.kind == "bash"
    assert corpus.METADATA["bash_command"] in bash.search_text


def test_failed_bash_execution_is_an_error(parse_records):
    record = j.message_entry(
        "b1", "bashExecution", [j.text_block("cmd")], command="false", output="", exitCode=1
    )
    entry = parse_records([j.session_header("s1"), record]).entries[0]

    assert entry.is_error is True
    assert entry.message.bash.exit_code == 1


def test_custom_and_custom_message_entries(parse_records):
    parsed = parse_records(corpus.metadata_session_records())
    by_type = {e.entry_type: e for e in parsed.entries}

    custom = by_type["custom"].custom
    assert custom.custom_type == corpus.METADATA["custom_type"]
    assert custom.data == {"text": "custom payload"}
    assert by_type["custom"].content_summary.format == "json"

    message = by_type["custom_message"].custom_message
    assert message.custom_type == corpus.METADATA["custom_message_type"]
    assert message.display is corpus.METADATA["custom_message_display"]
    assert message.content[0].text == "hook injected message"


def test_custom_entry_without_data_has_no_summary(parse_records):
    record = {"type": "custom", "id": "c1", "timestamp": j.DEFAULT_TIMESTAMP, "customType": "t"}
    entry = parse_records([j.session_header("s1"), record]).entries[0]

    assert entry.custom.data is None
    assert entry.content_summary is None


def test_context_edit_with_omitted_replacement_and_missing_target(parse_records):
    parsed = parse_records(
        [j.session_header("s1"), j.context_edit("ce1", target_id="nope")]
    )
    edit = parsed.entries[0].context_edit

    assert edit.omitted is True
    assert edit.replacement_content is None
    assert edit.replacement_summary is None
    assert "missing_context_target" in [i.code for i in parsed.issues]


def test_context_edit_without_target_id_is_warned(parse_records):
    record = {"type": "context_edit", "id": "ce1", "timestamp": j.DEFAULT_TIMESTAMP}
    parsed = parse_records([j.session_header("s1"), record])

    assert parsed.entries[0].context_edit.target_id is None
    assert "missing_field" in [i.code for i in parsed.issues]


def test_label_and_session_info_without_target_or_name(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            {"type": "label", "id": "l1", "timestamp": j.DEFAULT_TIMESTAMP},
            {"type": "session_info", "id": "si1", "timestamp": j.DEFAULT_TIMESTAMP},
        ]
    )
    label, info = parsed.entries

    assert label.label.target_id is None
    assert label.label.cleared is True
    assert "missing_field" in [i.code for i in parsed.issues]
    assert info.session_info.name is None
    assert info.session_info.cleared is True


def test_entry_without_type_is_unknown(parse_records):
    parsed = parse_records([j.session_header("s1"), {"id": "x1", "timestamp": j.DEFAULT_TIMESTAMP}])

    entry = parsed.entries[0]
    assert entry.entry_type == "unknown"
    assert entry.unknown is not None and entry.unknown.raw_type is None
    # Reported twice: once for the missing type, once as an unknown entry.
    assert [i.code for i in parsed.issues] == ["missing_type", "unknown_entry_type"]
    assert parsed.counts.unknown_entry_count == 1


def test_duplicate_entry_ids_are_reported_and_last_wins(parse_records):
    parsed = parse_records(
        [j.session_header("s1"), j.user_message("u1", "first"), j.user_message("u1", "second")]
    )

    assert "duplicate_entry_id" in [i.code for i in parsed.issues]
    assert len(parsed.entries) == 2


def test_compaction_and_branch_summary_missing_links_are_warned(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.compaction("c1", summary="s", first_kept_entry_id="missing"),
            j.branch_summary("b1", summary="s", from_id="missing"),
        ]
    )

    codes = [i.code for i in parsed.issues]
    assert "missing_compaction_boundary" in codes
    assert "missing_branch_source" in codes


def test_compaction_tokens_before_defaults_to_zero(parse_records):
    parsed = parse_records([j.session_header("s1"), j.compaction("c1", summary="s")])

    compaction = parsed.entries[0].compaction
    assert compaction.tokens_before == 0
    assert compaction.first_kept_entry_id is None
    assert compaction.read_files == []


def test_custom_message_with_no_content_has_no_summary(parse_records):
    record = {
        "type": "custom_message",
        "id": "cm1",
        "timestamp": j.DEFAULT_TIMESTAMP,
        "customType": "empty",
        "content": [],
    }
    entry = parse_records([j.session_header("s1"), record]).entries[0]

    assert entry.custom_message.content == []
    assert entry.custom_message.display is True
    assert entry.content_summary is None
    assert entry.custom_message.custom_type in entry.search_text


def test_context_edit_replacement_can_be_a_plain_list(parse_records):
    record = {
        "type": "context_edit",
        "id": "ce1",
        "timestamp": j.DEFAULT_TIMESTAMP,
        "targetId": "u1",
        "replacement": [j.text_block("replaced")],
    }
    parsed = parse_records([j.session_header("s1"), j.user_message("u1", "orig"), record])
    edit = parsed.entries[1].context_edit

    assert edit.omitted is False
    assert edit.target_entry_index == 0
    assert edit.target_role == "user"
    assert edit.replacement_content[0].text == "replaced"


def test_model_entries_without_provider_or_model_are_skipped(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            {"type": "model_change", "id": "mc1", "timestamp": j.DEFAULT_TIMESTAMP},
        ]
    )

    assert parsed.entries[0].model_change.provider is None
    assert parsed.entries[0].model_change.model_id is None
    assert parsed.models_seen == []


def test_usage_entries_without_model_are_attributed_from_state(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.assistant_message("a1", text="x", usage=j.usage_object(input=1, total_tokens=1)),
            j.usage_entry("use1", j.usage_object(input=2, total_tokens=2)),
        ]
    )
    usage_entry = next(e for e in parsed.entries if e.entry_type == "usage")

    assert usage_entry.model_source == "attributed"
    assert usage_entry.usage_entry.provider == "anthropic"
    assert usage_entry.usage_entry.model == "claude-sonnet-4-5"
    assert usage_entry.usage_entry.kind == "session_total"


def test_empty_main_header_only_and_partial_statuses(parse_text):
    header_only = parse_text(corpus.EDGE_CASE_FILES["edge/header_only.jsonl"])
    malformed = parse_text(corpus.EDGE_CASE_FILES["edge/malformed.jsonl"])

    assert header_only.parse_status == "ok"
    assert header_only.entries == []
    assert header_only.counts.entry_count == 0

    assert malformed.parse_status == "partial"
    assert malformed.parse_error is not None and "not valid JSON" in malformed.parse_error
