"""Service layer for Pi Meter.

The parser package is pure and database-independent:

- ``parser.parse_session_file`` / ``parse_session_text`` / ``parse_session_lines``
  turn one Pi JSONL file into a ``ParsedSession``.
- ``parser_models`` holds the normalized dataclasses (timestamps in UTC epoch
  milliseconds, costs in integer micro-units, raw JSON preserved).
- ``parser_content`` normalizes content blocks and computes preview metadata.
- ``parser_usage`` extracts usage once per entry and converts/sums costs.

Downstream workers (sync, aggregation, API) should consume ``ParsedSession``
and never re-parse JSONL themselves.
"""
