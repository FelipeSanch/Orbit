"""Tests for sms_safety: E.164 normalization + segment-aware budgeting.

These guarantees feed two production-readiness items from the Twilio
checklist (E.164 normalization, UCS-2 detection). Pure unit-level — no
DB, no Twilio API.
"""

from __future__ import annotations

import pytest

from services.sms_safety import (
    cap_for_segment_budget,
    count_sms_segments,
    normalize_phone_e164,
)

# ── normalize_phone_e164 ────────────────────────────────────────────


@pytest.mark.parametrize(
    "raw, expected",
    [
        ("+15551234567", "+15551234567"),
        ("+1 (555) 123-4567", "+15551234567"),
        ("+1-555-123-4567", "+15551234567"),
        ("  +15551234567  ", "+15551234567"),
        ("0015551234567", "+15551234567"),  # 00 prefix → +
        ("+447123456789", "+447123456789"),  # UK
    ],
)
def test_normalize_canonicalizes_valid_inputs(raw: str, expected: str) -> None:
    assert normalize_phone_e164(raw) == expected


@pytest.mark.parametrize(
    "raw",
    [
        "",
        None,
        "5551234567",  # no country code — refuse to guess
        "abc",
        "+",
        "+1234567",  # too short for E.164
        "+1234567890123456",  # too long (>15 digits)
        "555 123 4567",  # no + prefix
    ],
)
def test_normalize_rejects_ambiguous_inputs(raw: object) -> None:
    assert normalize_phone_e164(raw) is None  # type: ignore[arg-type]


# ── count_sms_segments ──────────────────────────────────────────────


def test_short_ascii_is_one_gsm_segment():
    n, enc = count_sms_segments("hello world")
    assert (n, enc) == (1, "gsm7")


def test_160_ascii_chars_is_one_segment():
    text = "a" * 160
    n, enc = count_sms_segments(text)
    assert (n, enc) == (1, "gsm7")


def test_161_ascii_chars_splits_into_two_concat_segments():
    text = "a" * 161
    n, enc = count_sms_segments(text)
    # Concatenated segments hold 153 chars each.
    assert (n, enc) == (2, "gsm7")


def test_emoji_forces_ucs2():
    n, enc = count_sms_segments("hello 🌍")
    assert enc == "ucs2"
    assert n == 1


def test_71_ucs2_chars_splits_into_two_segments():
    # Single emoji + 70 ascii = 71 UCS-2 chars → 2 concatenated segments (67/seg).
    text = "🌍" + ("a" * 70)
    n, enc = count_sms_segments(text)
    assert enc == "ucs2"
    assert n == 2


def test_gsm7_extension_chars_count_double():
    # '€' is in the GSM-7 extension table — counts as 2 chars in segment math.
    # 80 of them = 160 raw chars but they take 160 budget slots, so still
    # exactly one segment.
    text = "€" * 80
    n, enc = count_sms_segments(text)
    assert (n, enc) == (1, "gsm7")
    # 81 € chars = 162 budget slots → spills into a 2nd segment.
    n2, _ = count_sms_segments("€" * 81)
    assert n2 == 2


# ── cap_for_segment_budget ──────────────────────────────────────────


def test_gsm7_budget_for_six_segments():
    # 6 concatenated GSM-7 segments → 6 * 153 = 918 chars.
    assert cap_for_segment_budget("plain ascii", max_segments=6) == 918


def test_ucs2_budget_for_six_segments():
    # A single emoji marks the whole message UCS-2 → 6 * 67 = 402 chars.
    assert cap_for_segment_budget("hello 🌍", max_segments=6) == 402


def test_budget_for_single_segment():
    assert cap_for_segment_budget("plain", max_segments=1) == 160
    assert cap_for_segment_budget("🌍", max_segments=1) == 70


def test_budget_clamps_negative_segments_to_one():
    assert cap_for_segment_budget("plain", max_segments=0) == 160
    assert cap_for_segment_budget("plain", max_segments=-3) == 160
