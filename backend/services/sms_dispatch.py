"""Glue between Twilio inbound SMS and the Orbit agent team.

Single coroutine `handle_inbound_sms(from_address, body)` does the
full loop:
  - identity lookup (channels table)
  - YES/NO detection — if the user has a pending SMS approval, treat the
    reply as the answer to it
  - otherwise, run the agent fresh; if it pauses on a write, store the
    approval and SMS a preview asking for YES/NO
  - reply via Twilio outbound, persist messages
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from repositories import approvals as approval_repo
from repositories import channels as channels_repo
from repositories import conversations as conv_repo
from repositories import messages as msg_repo
from services.agent_factory import create_team_for_user
from services.run_resume import resume_approval
from services.sms_safety import (
    cap_for_segment_budget,
    count_sms_segments,
    normalize_phone_e164,
)
from services.twilio_client import send_sms

logger = logging.getLogger(__name__)

# Outbound segment budget. GSM-7 fits 153 chars/segment in concatenated
# multi-segment SMS; UCS-2 fits 67. cap_for_segment_budget picks the
# right char cap from the detected encoding so a reply full of emoji
# doesn't quietly turn into 15 segments and burn $$$.
_MAX_REPLY_SEGMENTS = 6

_AFFIRMATIVE = {"y", "yes", "yep", "yeah", "ok", "okay", "send it", "go", "do it"}
_NEGATIVE = {"n", "no", "nope", "cancel", "stop", "don't", "dont"}


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _truncate_for_sms(text: str) -> str:
    """Cap `text` to fit within _MAX_REPLY_SEGMENTS, encoding-aware.

    The cap differs for GSM-7 vs UCS-2 because each encoding packs a
    different number of characters per segment. A reply with one emoji
    is UCS-2 across its entire length, so the budget shrinks accordingly.
    """
    if not text:
        return text
    limit = cap_for_segment_budget(text, max_segments=_MAX_REPLY_SEGMENTS)
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _interpret_reply(body: str) -> str | None:
    """Map an SMS body to 'yes', 'no', or None (not a reply to approval)."""
    norm = body.strip().lower().rstrip("!.")
    if norm in _AFFIRMATIVE:
        return "yes"
    if norm in _NEGATIVE:
        return "no"
    return None


def _summarize_tool_for_sms(tool_name: str, tool_args: dict) -> str:
    """Build a one-line preview for an approval prompt over SMS."""
    if tool_name == "send_email":
        to = tool_args.get("to", "")
        subject = tool_args.get("subject", "")
        body = (tool_args.get("body") or "").strip().splitlines()
        first = body[0] if body else ""
        return f"Send email to {to} — \"{subject}\": {first[:80]}"
    if tool_name == "reply_to_email":
        body = (tool_args.get("body") or "").strip().splitlines()
        first = body[0] if body else ""
        return f"Reply: {first[:120]}"
    if tool_name in ("create_event", "update_event"):
        title = tool_args.get("summary") or tool_args.get("title", "")
        start = tool_args.get("start_time") or tool_args.get("start", "")
        return f"Create event \"{title}\" at {start}"
    if tool_name == "delete_event":
        return f"Delete event {tool_args.get('event_id', '')}"
    if tool_name == "create_task":
        return f"Add task: {tool_args.get('title', '')}"
    if tool_name == "complete_task":
        return f"Mark task done: {tool_args.get('task_id', '')}"
    if tool_name == "delete_task":
        return f"Delete task: {tool_args.get('task_id', '')}"
    if tool_name == "trash_email":
        return f"Move email {tool_args.get('email_id', '')} to trash"
    return f"{tool_name.replace('_', ' ')}"


async def _find_or_create_sms_conversation(user_id: str, day: str) -> str:
    title = f"SMS · {day}"
    existing = await conv_repo.find_by_title(user_id, title)
    if existing:
        return existing["id"]
    created = await conv_repo.create(user_id)
    await conv_repo.update_title(created["id"], title)
    return created["id"]


async def _persist_user_msg(
    conversation_id: str, user_id: str, body: str, session_id: str, from_address: str
) -> None:
    await msg_repo.create(
        conversation_id,
        user_id,
        "user",
        body,
        {"channel": "sms", "session_id": session_id, "from": from_address},
    )


async def _persist_assistant_msg(
    conversation_id: str,
    user_id: str,
    body: str,
    session_id: str,
    to_address: str,
) -> None:
    await msg_repo.create(
        conversation_id,
        user_id,
        "assistant",
        body,
        {"channel": "sms", "session_id": session_id, "to": to_address},
    )


async def _send_and_log(
    to_address: str,
    reply: str,
    conversation_id: str,
    user_id: str,
    session_id: str,
) -> None:
    truncated = _truncate_for_sms(reply)
    segments, encoding = count_sms_segments(truncated)
    logger.info(
        "Outbound SMS: %d char, %d segment(s), encoding=%s, to=%s",
        len(truncated),
        segments,
        encoding,
        to_address,
    )
    await _persist_assistant_msg(
        conversation_id, user_id, truncated, session_id, to_address
    )
    await conv_repo.update_timestamp(conversation_id)
    try:
        send_sms(to_address, truncated)
    except Exception as e:
        logger.exception("Failed sending outbound SMS reply: %s", e)


async def _handle_pending_reply(
    pending: dict, user_id: str, from_address: str, body: str
) -> None:
    """User replied YES/NO to a pending SMS approval. Resume the run."""
    intent = _interpret_reply(body)
    if intent is None:
        return  # caller falls through to a fresh agent run
    approved = intent == "yes"

    conv_id = str(pending["conversation_id"])
    await _persist_user_msg(
        conv_id, user_id, body, pending["session_id"], from_address
    )

    await approval_repo.resolve(
        str(pending["id"]), "approved" if approved else "rejected"
    )

    tool_args_raw = pending["tool_args"]
    tool_args = (
        json.loads(tool_args_raw)
        if isinstance(tool_args_raw, str)
        else tool_args_raw
    ) or {}

    reply = await resume_approval(
        user_id=user_id,
        session_id=pending["session_id"],
        run_id=pending["run_id"],
        tool_call_id=pending["tool_call_id"],
        tool_name=pending["tool_name"],
        tool_args=tool_args,
        approved=approved,
    )
    await _send_and_log(
        from_address, reply, conv_id, user_id, pending["session_id"]
    )


async def handle_inbound_sms(from_address: str, body: str) -> None:
    body = (body or "").strip()
    if not body:
        return

    # Twilio sends E.164 on inbound, but normalize defensively so an
    # operator inserting a row by hand or a future ngrok tunnel test
    # can't desync the lookup by stray whitespace / different formatting.
    normalized_from = normalize_phone_e164(from_address) or from_address
    if normalized_from != from_address:
        logger.warning(
            "Inbound SMS phone format mismatch: raw=%r normalized=%r",
            from_address,
            normalized_from,
        )
    from_address = normalized_from

    channel = await channels_repo.get_user_for_address("sms", from_address)
    if not channel:
        try:
            send_sms(
                from_address,
                "This number isn't linked to an Orbit account. Open the "
                "Orbit web app and add this phone in Hub → Twilio (SMS).",
            )
        except Exception as e:
            logger.exception("Failed sending unlinked-number nudge: %s", e)
        return

    user_id = channel["user_id"]

    # If there's a pending SMS approval and the body looks like YES/NO,
    # treat this as a response to that approval.
    pending = await approval_repo.get_latest_pending_for_user(user_id, "sms")
    if pending and _interpret_reply(body) is not None:
        await _handle_pending_reply(pending, user_id, from_address, body)
        return

    # Fresh turn
    day = _today_utc()
    session_id = f"sms:{from_address}:{day}"
    conversation_id = await _find_or_create_sms_conversation(user_id, day)

    await _persist_user_msg(conversation_id, user_id, body, session_id, from_address)

    fallback_note = await msg_repo.fallback_context(conversation_id)
    input_message = (
        f"{fallback_note}\n\n{body}" if fallback_note else body
    )

    team = await create_team_for_user(user_id, session_id)
    try:
        run = await team.arun(
            input_message, stream=False, stream_events=False
        )
    except Exception as e:
        logger.exception("Agent run failed for SMS from %s: %s", from_address, e)
        await _send_and_log(
            from_address,
            "I hit an error trying to handle that. Try again in a moment.",
            conversation_id,
            user_id,
            session_id,
        )
        return

    # If the run paused for a write-tool confirmation, persist an SMS
    # approval and ask the user to reply YES/NO.
    status = getattr(run, "status", None)
    status_str = getattr(status, "value", str(status))
    if status_str == "paused":
        requirements = getattr(run, "requirements", None) or []
        for req in requirements:
            te = getattr(req, "tool_execution", None)
            if te is None:
                continue
            requires_conf = getattr(te, "requires_confirmation", False)
            already_confirmed = getattr(te, "confirmed", None) is not None
            if not requires_conf or already_confirmed:
                continue
            tool_name = getattr(te, "tool_name", "unknown")
            if tool_name == "delegate_task_to_member":
                continue
            tool_args = getattr(te, "tool_args", {}) or {}
            if not isinstance(tool_args, dict):
                tool_args = {}
            tool_call_id = getattr(te, "tool_call_id", str(uuid.uuid4()))

            approval_id = str(uuid.uuid4())
            await approval_repo.create(
                approval_id=approval_id,
                user_id=user_id,
                conversation_id=conversation_id,
                run_id=getattr(run, "run_id", "") or "",
                session_id=session_id,
                tool_name=tool_name,
                tool_args=tool_args,
                tool_call_id=tool_call_id,
                channel="sms",
            )
            preview = _summarize_tool_for_sms(tool_name, tool_args)
            reply = f"{preview}\n\nReply YES to send, NO to cancel."
            await _send_and_log(
                from_address, reply, conversation_id, user_id, session_id
            )
            return  # only the first un-confirmed requirement, others queue

    # Normal completion
    content = (getattr(run, "content", None) or "").strip()
    if not content:
        content = "Got it — nothing to say back, but I'm here when you need me."
    await _send_and_log(
        from_address, content, conversation_id, user_id, session_id
    )
