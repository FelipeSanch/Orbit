"""Tests for the titler's error-only guard.

The auto-titler runs after the first exchange in a new conversation. If
the assistant's only content for the run was an error (Anthropic 429
envelope, our run_error envelope, a raw exception string), titling that
text produces broken sidebar entries like "Error code 429 type". The
guard short-circuits before the model call so we don't spend tokens or
write bogus titles.
"""

from __future__ import annotations

from services.conversation_titler import _looks_like_error_only


def test_empty_response_is_error_only():
    assert _looks_like_error_only("") is True
    assert _looks_like_error_only("   ") is True


def test_anthropic_error_envelope_string_is_error_only():
    raw = "Error code: 429 - {'type': 'error', 'error': {...}}"
    assert _looks_like_error_only(raw) is True


def test_our_error_envelope_json_is_error_only():
    raw = '{"error": "Graph timed out", "code": "graph_timeout"}'
    assert _looks_like_error_only(raw) is True


def test_anthropic_type_error_json_is_error_only():
    raw = '{"type": "error", "error": {"type": "overloaded_error"}}'
    assert _looks_like_error_only(raw) is True


def test_traceback_prefix_is_error_only():
    raw = "Traceback (most recent call last):\n  File ..."
    assert _looks_like_error_only(raw) is True


def test_real_assistant_response_is_not_error_only():
    raw = "Here are your 3 upcoming meetings: ..."
    assert _looks_like_error_only(raw) is False


def test_response_mentioning_error_word_in_prose_not_classified():
    # "I checked your inbox and didn't find any error reports" — should
    # NOT be flagged as an error stringification.
    raw = "I checked your inbox and didn't find any error reports."
    assert _looks_like_error_only(raw) is False
