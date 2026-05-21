"""SMS-side normalizers + budget helpers.

Centralized so the webhook handler, the channel-registration path (when
it lands), and the outbound truncator all use the same rules.

  * normalize_phone_e164 — strip whitespace/separators, require leading
    '+', return the canonical E.164 string for storage and lookup. Twilio
    sends E.164 on inbound, but anything user-supplied (Hub registration
    UI, REST clients) needs scrubbing before it hits the channels table.

  * count_sms_segments — returns (segments, encoding). GSM-7 packs 160
    chars per segment (153 in concatenated multi-segment); UCS-2 packs
    70 chars (67 in concatenated). One emoji or non-Latin char in the
    body downgrades the WHOLE message to UCS-2.

  * cap_for_segment_budget — given a max segment budget, return the
    char limit for the encoding the text would use. Lets _truncate
    cap at "6 segments worth" regardless of whether the body is GSM
    or UCS-2, so a reply full of emoji doesn't quietly blow $$$.
"""

from __future__ import annotations

import re

# 3GPP TS 23.038 §6.2.1 — GSM 7-bit default alphabet + extension table.
# Everything else forces UCS-2 encoding (incl. emoji, accented Latin chars
# not in the default table, CJK, etc.).
_GSM7_BASE = (
    "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\x1bÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?"
    "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
_GSM7_EXT = "\f^{}\\[~]|€"
_GSM7_CHARS = set(_GSM7_BASE) | set(_GSM7_EXT)

# E.164: leading '+', then 1–15 digits. Conservative scrub for everything else.
_NON_DIGIT_RE = re.compile(r"[^\d+]")
_E164_RE = re.compile(r"^\+\d{8,15}$")


def normalize_phone_e164(raw: str) -> str | None:
    """Return a canonical E.164 string, or None if `raw` can't be coerced.

    Accepts forms commonly typed by humans: '+1 (555) 123-4567',
    '+1-555-123-4567', '+15551234567'. Rejects anything ambiguous —
    notably bare 10-digit US numbers without a country code, because
    guessing is worse than failing.
    """
    if not raw:
        return None
    stripped = _NON_DIGIT_RE.sub("", raw.strip())
    if stripped.startswith("+"):
        candidate = "+" + stripped[1:]
    elif stripped.startswith("00"):
        candidate = "+" + stripped[2:]
    else:
        return None
    return candidate if _E164_RE.match(candidate) else None


def count_sms_segments(text: str) -> tuple[int, str]:
    """Return (segment_count, encoding) where encoding is 'gsm7' or 'ucs2'.

    A single segment fits 160 GSM-7 chars or 70 UCS-2 chars. Multi-segment
    SMS reserves 7 bytes per segment for User Data Headers, so the per-
    segment payload shrinks to 153 (GSM-7) / 67 (UCS-2).
    """
    if not text:
        return 0, "gsm7"

    # GSM-7 extension chars count as 2 chars each in the segment math.
    ext_count = sum(1 for c in text if c in _GSM7_EXT)
    if all(c in _GSM7_CHARS for c in text):
        length = len(text) + ext_count
        if length <= 160:
            return 1, "gsm7"
        return (length + 152) // 153, "gsm7"

    length = len(text)
    if length <= 70:
        return 1, "ucs2"
    return (length + 66) // 67, "ucs2"


def cap_for_segment_budget(text: str, *, max_segments: int) -> int:
    """Return the character limit `text` should be truncated to so it fits
    within `max_segments` SMS segments, given its detected encoding.

    Picks the GSM-7 budget if the text is all-GSM-7-safe, otherwise the
    UCS-2 budget — does NOT change encoding, just sizes for it.
    """
    if max_segments < 1:
        max_segments = 1
    if all(c in _GSM7_CHARS for c in (text or "")):
        return 160 if max_segments == 1 else 153 * max_segments
    return 70 if max_segments == 1 else 67 * max_segments
