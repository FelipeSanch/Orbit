"""Tests for graph_safety.format_graph_error.

Pure unit tests — no DB, no network. Verifies that library-specific
exception strings are mapped to the right `code` and that we extract
Retry-After when present.
"""

from __future__ import annotations

import json

from services.graph_safety import HTTP_TIMEOUT_S, format_graph_error


def _parse(s: str) -> dict:
    return json.loads(s)


def test_timeout_string_is_classified_as_graph_timeout():
    err = (
        "HTTPSConnectionPool(host='graph.microsoft.com', port=443): "
        f"Read timed out. (read timeout={int(HTTP_TIMEOUT_S)})"
    )
    out = _parse(format_graph_error(err, tool_name="list_emails"))
    assert out["code"] == "graph_timeout"
    assert "list_emails" in out["error"]
    assert str(int(HTTP_TIMEOUT_S)) in out["error"]


def test_connect_timeout_is_also_graph_timeout():
    err = "ConnectTimeout: connection to graph.microsoft.com failed"
    out = _parse(format_graph_error(err, tool_name="list_events"))
    assert out["code"] == "graph_timeout"


def test_429_status_string_is_classified_as_throttled():
    err = (
        "429 Client Error: Too Many Requests for url: https://graph.microsoft.com/v1.0/me/messages"
    )
    out = _parse(format_graph_error(err, tool_name="search_emails"))
    assert out["code"] == "graph_throttled"
    assert "search_emails" in out["error"]


def test_retry_after_extracted_when_present():
    err = "429 Too Many Requests. Headers: {'Retry-After': '30'}"
    out = _parse(format_graph_error(err, tool_name="send_email"))
    assert out["code"] == "graph_throttled"
    assert out["retry_after_s"] == 30


def test_retry_after_absent_does_not_error():
    err = "429 Too Many Requests"
    out = _parse(format_graph_error(err, tool_name="send_email"))
    assert out["code"] == "graph_throttled"
    assert "retry_after_s" not in out


def test_generic_error_falls_through_to_graph_error():
    err = "Some weird unknown failure happened"
    out = _parse(format_graph_error(err, tool_name="create_event"))
    assert out["code"] == "graph_error"
    assert "create_event" in out["error"]


def test_error_message_truncated_to_avoid_blowing_tool_result():
    err = "Some failure: " + ("x" * 5000)
    out = _parse(format_graph_error(err, tool_name="create_event"))
    # Body should be capped well under 5000 chars.
    assert len(out["error"]) < 500


def test_works_with_exception_instance_not_just_string():
    exc = RuntimeError("Read timed out (read timeout=25)")
    out = _parse(format_graph_error(exc, tool_name="list_emails"))
    assert out["code"] == "graph_timeout"
