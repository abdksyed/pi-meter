"""Unit tests for content normalization (``app/services/parser_content.py``).

Content blocks, text extraction, search text, and preview/collapse thresholds.
Pure functions only: no files, no database, no network.
"""

from __future__ import annotations

import json

from tests.fixtures import corpus
from tests.fixtures import jsonl as j

from app.services import parser_content as pc
from app.services.parser_models import ContentBlock, ImageData


# --------------------------------------------------------------------------- #
# Block normalization
# --------------------------------------------------------------------------- #


def test_normalize_content_accepts_none_string_and_list():
    assert pc.normalize_content(None) == []

    single = pc.normalize_content("hello")
    assert [(b.type, b.text) for b in single] == [("text", "hello")]

    blocks = pc.normalize_content(
        [{"type": "text", "text": "a"}, {"type": "thinking", "thinking": "b"}]
    )
    assert [b.type for b in blocks] == ["text", "thinking"]


def test_normalize_content_coerces_non_text_scalars():
    blocks = pc.normalize_content(42)

    assert [(b.type, b.text) for b in blocks] == [("text", "42")]


def test_text_block_without_text_is_empty_not_missing():
    block = pc.normalize_content_block({"type": "text"})

    assert block.type == "text"
    assert block.text == ""


def test_thinking_block_keeps_redaction_and_summary():
    block = pc.normalize_content_block(
        {"type": "thinking", "thinking": "internal reasoning", "redacted": True}
    )

    assert block.type == "thinking"
    assert block.thinking == "internal reasoning"
    assert block.redacted is True
    assert block.summary is not None
    assert block.summary.kind == "thinking"
    assert block.summary.preview == "internal reasoning"


def test_image_block_reports_mime_and_approximate_byte_size():
    block = pc.normalize_content_block(j.image_block(data="iVBORw0KGgoAAAANSUhEUg=="))

    assert block.type == "image"
    assert block.image is not None
    assert block.image.mime_type == "image/png"
    assert block.image.byte_size == pc.image_byte_size("iVBORw0KGgoAAAANSUhEUg==")

    # Padding characters are discounted by the approximation.
    assert pc.image_byte_size("") == 0
    assert pc.image_byte_size("QQ==") == 1


def test_image_block_defaults_mime_when_missing():
    block = pc.normalize_content_block({"type": "image", "data": "QQ=="})

    assert block.image.mime_type == "application/octet-stream"


def test_tool_call_block_serializes_arguments():
    block = pc.normalize_content_block(j.tool_call_block("call-1", "bash", {"command": "ls"}))

    assert block.type == "toolCall"
    call = block.tool_call
    assert call.id == "call-1"
    assert call.name == "bash"
    assert call.arguments == {"command": "ls"}
    assert json.loads(call.arguments_json) == {"command": "ls"}
    assert call.arguments_error is None
    assert block.summary is not None
    assert block.summary.kind == "tool_args"
    assert block.summary.format == "json"


def test_tool_call_with_broken_arguments_is_preserved_verbatim():
    block = pc.normalize_content_block(
        j.tool_call_block(
            "",
            "edit",
            raw_arguments='{"path": ',
            arguments_error="unexpected end of JSON input",
        )
    )

    call = block.tool_call
    assert call.arguments_json == '{"path": '
    assert call.arguments_error == "unexpected end of JSON input"
    # Missing ids get a deterministic positional placeholder.
    assert call.id == "call:0"


def test_unknown_block_type_is_preserved_in_raw():
    block = pc.normalize_content_block({"type": "futureBlock", "payload": {"nested": True}})

    assert block.type == "futureBlock"
    assert block.raw == {"type": "futureBlock", "payload": {"nested": True}}


def test_non_dict_non_str_block_is_unknown():
    block = pc.normalize_content_block(7)

    assert block.type == "unknown"
    assert block.raw == {"value": 7}


def test_missing_block_type_is_unknown():
    assert pc.normalize_content_block({"payload": 1}).type == "unknown"


def test_summarize_blocks_fills_missing_thinking_and_tool_call_summaries():
    thinking = ContentBlock(type="thinking", thinking="deep")
    call = ContentBlock(
        type="toolCall",
        tool_call=pc._normalize_tool_call({"id": "c1", "name": "bash", "arguments": {"a": 1}}, 0),
    )

    pc.summarize_blocks([thinking, call, ContentBlock(type="text", text="x")])

    assert thinking.summary is not None and thinking.summary.kind == "thinking"
    assert call.summary is not None and call.summary.kind == "tool_args"
    # Unknown/other blocks get no summary from the helper.
    assert pc.summarize_blocks([ContentBlock(type="futureBlock")]) is None


def test_summarize_blocks_keeps_existing_summaries():
    block = ContentBlock(type="thinking", thinking="deep")
    pc.summarize_blocks([block])
    original = block.summary
    block.thinking = "changed"

    pc.summarize_blocks([block])

    assert block.summary is original
    assert block.summary.preview == "deep"


def test_summaries_are_filled_for_thinking_and_tool_calls_only():
    blocks = pc.normalize_content(
        [
            {"type": "text", "text": "plain"},
            {"type": "thinking", "thinking": "deep"},
            j.tool_call_block("c1", "bash", {"command": "ls"}),
            {"type": "futureBlock"},
        ]
    )

    assert [b.summary is not None for b in blocks] == [False, True, True, False]


# --------------------------------------------------------------------------- #
# Text extraction
# --------------------------------------------------------------------------- #


def test_extract_text_joins_text_blocks_with_space():
    blocks = pc.normalize_content(
        [
            {"type": "text", "text": "a"},
            {"type": "thinking", "thinking": "ignored"},
            {"type": "text", "text": "b"},
        ]
    )

    assert pc.extract_text(blocks) == "a b"
    assert pc.extract_text("raw string") == "raw string"
    assert pc.extract_text(None) == ""


def test_extract_text_ignores_images_and_tool_calls():
    blocks = pc.normalize_content(
        [j.image_block(), j.tool_call_block("c1", "bash", {"command": "ls"})]
    )

    assert pc.extract_text(blocks) == ""


def test_normalize_content_block_accepts_plain_strings():
    block = pc.normalize_content_block("already text")

    assert (block.type, block.text) == ("text", "already text")


def test_extract_text_handles_mixed_lists_and_scalars():
    assert pc.extract_text(["a", "b"]) == "a b"
    assert pc.extract_text(["a", {"type": "text", "text": "ignored"}]) == "a"
    assert pc.extract_text(7) == "7"


def test_extract_first_text_skips_non_text_and_blank_blocks():
    assert pc.extract_first_text("hello") == "hello"
    # For a list, only normalized ``ContentBlock`` instances are inspected.
    blocks = pc.normalize_content(
        [
            {"type": "thinking", "thinking": "x"},
            {"type": "text", "text": "  "},
            {"type": "text", "text": "t"},
        ]
    )
    assert pc.extract_first_text(blocks) == "t"
    assert pc.extract_first_text([]) is None


# --------------------------------------------------------------------------- #
# Search text
# --------------------------------------------------------------------------- #


def test_build_search_text_is_lowercase_and_includes_tool_arguments():
    blocks = pc.normalize_content(
        [
            {"type": "text", "text": "Hello World"},
            {"type": "thinking", "thinking": "Deep Thought"},
            j.tool_call_block("c1", "Bash", {"command": "ls -la"}),
        ]
    )

    text = pc.build_search_text(blocks)

    assert text == text.lower()
    assert text.startswith("hello world deep thought bash")
    assert "ls -la" in text


def test_build_search_text_excludes_image_payloads():
    blocks = pc.normalize_content(
        [
            {"type": "text", "text": "picture"},
            j.image_block(data="QUJDREVGRw=="),
        ]
    )

    text = pc.build_search_text(blocks)

    assert "picture" in text
    assert "qujdrevgrw" not in text


def test_build_search_text_includes_unknown_block_json():
    blocks = pc.normalize_content([{"type": "futureBlock", "payload": {"tag": "Searchable"}}])

    assert "searchable" in pc.build_search_text(blocks)


def test_entry_search_text_covers_non_message_entry_types(parse_records):
    parsed = parse_records(corpus.main_session_records())
    by_id = {e.entry_id: e for e in parsed.entries}

    assert "readfiles" not in by_id["cmp1"].search_text  # only the summary text is indexed
    assert "compacted the early parser" in by_id["cmp1"].search_text
    assert "branch summary from the first" in by_id["bs1"].search_text
    assert "todo" in by_id["cust1"].search_text
    assert "notification" in by_id["cm1"].search_text
    assert "first-answer" in by_id["lab1"].search_text
    assert "refactor parser pipeline" in by_id["si1"].search_text
    assert "gpt-5.1" in by_id["mc1"].search_text
    assert "high" in by_id["tl1"].search_text
    assert "future_event" in by_id["unk1"].search_text
    assert by_id["u1"].search_text.startswith("user please refactor")


def test_entry_search_text_is_truncated(parse_records):
    parsed = parse_records([j.session_header("s1"), j.user_message("u1", "z" * 250_000)])

    assert len(parsed.entries[0].search_text) == 200_000


def test_entry_search_text_excludes_base64_image_data(parse_records):
    parsed = parse_records(
        [
            j.session_header("s1"),
            j.user_message("u1", "pic", blocks=[j.image_block(data="QUJDREVGRw==")]),
        ]
    )

    assert "qujd" not in parsed.entries[0].search_text


# --------------------------------------------------------------------------- #
# Counting helpers
# --------------------------------------------------------------------------- #


def test_count_lines_and_bytes():
    assert pc.count_lines("") == 0
    assert pc.count_lines("a") == 1
    assert pc.count_lines("a\n") == 1
    assert pc.count_lines("a\nb") == 2
    assert pc.count_bytes("héllo") == len("héllo".encode("utf-8"))
    assert pc.count_bytes("") == 0


def test_is_json_text():
    assert pc.is_json_text('{"a": 1}') is True
    assert pc.is_json_text("[1, 2]") is True
    assert pc.is_json_text("  {\"a\": 1}  ") is True
    assert pc.is_json_text("not json") is False
    assert pc.is_json_text("") is False


# --------------------------------------------------------------------------- #
# Preview / collapse summaries
# --------------------------------------------------------------------------- #


def test_short_text_never_collapses():
    summary = pc.summarize_text("short markdown", kind="tool_result")

    assert summary.collapsed_by_default is False
    assert summary.truncated is False
    assert summary.preview == "short markdown"
    assert summary.format == "code"


def test_long_tool_output_collapses_and_previews_four_lines():
    text = "line\n" * 20
    summary = pc.summarize_text(text, kind="tool_result")

    assert summary.collapsed_by_default is True
    assert summary.truncated is True
    assert summary.line_count == 20
    assert summary.char_count == len(text)
    assert summary.preview_line_count == pc.PREVIEW_TOOL_RESULT_LINES
    assert summary.preview == "line\nline\nline\nline"


def test_long_single_line_tool_output_is_char_truncated():
    summary = pc.summarize_text("x" * (pc.COLLAPSE_TOOL_RESULT_CHARS + 1), kind="tool_result")

    assert summary.collapsed_by_default is True
    assert len(summary.preview) == pc.PREVIEW_TOOL_RESULT_CHARS


def test_tool_result_json_is_formatted_as_json():
    assert pc.summarize_text('{"a": 1}', kind="tool_result").format == "json"
    assert pc.summarize_text("plain output", kind="tool_result").format == "code"


def test_error_tool_results_stay_open_longer():
    text = "\n".join(f"error {i}" for i in range(15))

    normal = pc.summarize_text(text, kind="tool_result")
    error = pc.summarize_text(text, kind="tool_result", is_error=True)

    assert normal.collapsed_by_default is True
    assert error.collapsed_by_default is False


def test_pi_truncation_forces_collapse_and_records_it():
    summary = pc.summarize_text("short", kind="tool_result", pi_truncation={"truncated": True})

    assert summary.collapsed_by_default is True
    assert summary.truncated_by_pi is True
    assert summary.pi_truncation == {"truncated": True}


def test_system_prompts_always_collapse():
    summary = pc.summarize_text("system prompt", kind="system")

    assert summary.collapsed_by_default is True
    assert summary.format == "system"


def test_thinking_summary_uses_char_thresholds():
    short = pc.summarize_text("x" * pc.PREVIEW_THINKING_CHARS, kind="thinking")
    long = pc.summarize_text("x" * (pc.COLLAPSE_THINKING_CHARS + 1), kind="thinking")

    assert short.collapsed_by_default is False
    assert long.collapsed_by_default is True
    assert len(long.preview) == pc.PREVIEW_THINKING_CHARS


def test_plain_text_kind_never_collapses():
    summary = pc.summarize_text("word " * 5_000, kind="text")

    assert summary.collapsed_by_default is False
    assert summary.format == "markdown"


def test_summarize_json_pretty_prints_and_tags_format():
    summary = pc.summarize_json({"b": 1, "a": [1, 2]})

    assert summary.format == "json"
    assert summary.kind == "custom"
    assert summary.preview.startswith("{\n  \"b\": 1")


def test_circular_structures_fall_back_to_str():
    circular: dict = {}
    circular["self"] = circular

    summary = pc.summarize_json(circular)
    assert summary.format == "json"
    assert "self" in summary.preview

    block = pc.normalize_content_block(
        {"type": "toolCall", "id": "c1", "name": "bash", "arguments": circular}
    )
    assert block.tool_call.arguments_json.startswith("{'self': {")


def test_image_block_with_non_string_data_is_empty():
    block = pc.normalize_content_block({"type": "image", "data": 123, "mimeType": 5})

    assert block.image.data == ""
    assert block.image.byte_size == 0
    assert block.image.mime_type == "application/octet-stream"


def test_summarize_json_handles_unserializable_values():
    summary = pc.summarize_json({"value": object()})

    assert summary.format == "json"
    assert "<object object at" in summary.preview


# --------------------------------------------------------------------------- #
# Integration with the parser
# --------------------------------------------------------------------------- #


def test_long_tool_result_summary_in_parsed_session(parse_records):
    parsed = parse_records(corpus.long_session_records())
    result = parsed.entries[-1]

    assert result.role == "toolResult"
    assert result.content_summary is not None
    assert result.content_summary.kind == "tool_result"
    assert result.content_summary.collapsed_by_default is True
    assert result.content_summary.char_count == corpus.LONG["longest_string_chars"]
    assert result.content_summary.line_count == 1
    assert len(result.content_summary.preview) == pc.PREVIEW_TOOL_RESULT_CHARS


def test_tool_result_summaries_in_main_corpus(parse_records):
    parsed = parse_records(corpus.main_session_records())
    by_id = {e.entry_id: e for e in parsed.entries}

    failed = by_id["r2"]
    assert failed.is_error is True
    assert failed.content_summary is not None
    assert failed.content_summary.kind == "tool_result"
    assert failed.content_summary.format == "code"
    # Short output stays expanded; failure only raises the collapse threshold.
    assert failed.content_summary.collapsed_by_default is False

    # Any pi truncation metadata forces the summary collapsed and sets
    # ``truncated_by_pi`` even when ``details.truncation.truncated`` is false.
    # That is current behavior, recorded here rather than asserted as correct.
    succeeded = by_id["r1"]
    assert succeeded.content_summary is not None
    assert succeeded.content_summary.pi_truncation == {"truncated": False, "originalBytes": 18}
    assert succeeded.content_summary.collapsed_by_default is True
    assert succeeded.content_summary.truncated_by_pi is True


def test_unsafe_payloads_are_stored_as_inert_text(parse_text):
    parsed = parse_text(corpus.EDGE_CASE_FILES["edge/unsafe_content.jsonl"])
    text = parsed.entries[0].message.content[0].text

    # The parser stores raw text only; it must not strip or execute it.
    assert "<script>alert('xss')</script>" in text
    assert "javascript:alert(1)" in text
    assert "\x1b[31m" in text
    assert isinstance(parsed.entries[0].message.content[0], ContentBlock)


def test_image_content_block_round_trips_through_parser(parse_records):
    parsed = parse_records([j.session_header("s1"), corpus.main_session_records()[1]])
    image = next(b for b in parsed.entries[0].message.content if b.type == "image")

    assert isinstance(image.image, ImageData)
    assert image.image.mime_type == "image/png"
