"""Glue between Telegram inbound updates and the Orbit agent team.

Mirrors `sms_dispatch.py` (deleted in `60e68c4`, recoverable via
`git show 5de2916:backend/services/sms_dispatch.py` if you need the
historical reference). Where SMS used YES/NO text replies as the approval
mechanism, Telegram uses inline-keyboard callbacks — much nicer UX, but
the wire shape is slightly different:

- Inbound message → `handle_inbound_message`
  - `/start <code>` is the pairing entrypoint (consume Redis code, bind
    chat_id to user_id in `channels`).
  - `/start` with no code, or any message from an unlinked chat, nudges
    the user toward the Hub.
  - `/help` lists commands.
  - Free text → agent run; if it pauses on a write tool, send an
    approval message with ✅ Send / ❌ Reject buttons.

- Inline-button tap → `handle_callback_query` (`a:<short>` / `r:<short>`)
  - Looks up the approval by `short_token`, resolves it, strips the
    buttons from the original message so the user can't double-tap,
    then resumes the run and posts the result as a new message.

Both handlers run inside a `BackgroundTasks` queue spawned from the
webhook route — the webhook itself returns 200 immediately (Telegram
retries on non-200 within ~15s).
"""

from __future__ import annotations

import json
import logging
import secrets
import uuid
from datetime import datetime, timezone

from repositories import approvals as approval_repo
from repositories import channels as channels_repo
from repositories import conversations as conv_repo
from repositories import messages as msg_repo
from services import redis as redis_svc
from services import telegram_client as tg
from services.agent_factory import create_team_for_user
from services.run_resume import resume_approval

logger = logging.getLogger(__name__)

# Telegram messages cap at 4096 chars. We leave headroom for trailing
# context (preview, etc.) — most agent replies are well under this.
_MAX_REPLY_CHARS = 3500

_HELP_TEXT = (
    "Hey, I'm Orbit. Talk to me like you would in the web app:\n"
    "  • 'what's on my calendar today?'\n"
    "  • 'reply to <sender> saying I'll be there'\n"
    "  • 'add a task to call mom tomorrow'\n\n"
    "Anything that sends an email, changes your calendar, or modifies a "
    "task will pop up an Approve / Reject button before I do it.\n\n"
    "Commands:\n"
    "  /start <code> — link this chat to your Orbit account\n"
    "  /help — this message"
)


def _today_utc() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _truncate(text: str, limit: int = _MAX_REPLY_CHARS) -> str:
    if not text or len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def _new_short_token() -> str:
    """8-char URL-safe random token. Fits well inside the 64-byte
    callback_data limit even with a 2-char `a:` / `r:` prefix.
    """
    return secrets.token_urlsafe(6)[:8]


def _summarize_tool(tool_name: str, tool_args: dict) -> str:
    """One-line action preview shown above the inline-keyboard buttons."""
    if tool_name == "send_email":
        to = tool_args.get("to", "")
        subject = tool_args.get("subject", "")
        body = (tool_args.get("body") or "").strip().splitlines()
        first = body[0] if body else ""
        return f"📧 Send email to {to}\nSubject: {subject}\n\n{first[:200]}"
    if tool_name == "reply_to_email":
        body = (tool_args.get("body") or "").strip().splitlines()
        first = body[0] if body else ""
        return f"↩️ Reply: {first[:240]}"
    if tool_name in ("create_event", "update_event"):
        title = tool_args.get("summary") or tool_args.get("title", "")
        start = tool_args.get("start_time") or tool_args.get("start", "")
        verb = "Create" if tool_name == "create_event" else "Update"
        return f"📅 {verb} event \"{title}\" at {start}"
    if tool_name == "delete_event":
        return f"🗑️ Delete event {tool_args.get('event_id', '')}"
    if tool_name == "create_task":
        return f"✅ Add task: {tool_args.get('title', '')}"
    if tool_name == "complete_task":
        return f"☑️ Mark task done: {tool_args.get('task_id', '')}"
    if tool_name == "delete_task":
        return f"🗑️ Delete task: {tool_args.get('task_id', '')}"
    if tool_name == "trash_email":
        return f"🗑️ Move email {tool_args.get('email_id', '')} to trash"
    return tool_name.replace("_", " ")


def _approval_keyboard(short_token: str) -> dict:
    return tg.inline_keyboard(
        [
            [
                {"text": "✅ Send", "callback_data": f"a:{short_token}"},
                {"text": "❌ Reject", "callback_data": f"r:{short_token}"},
            ]
        ]
    )


async def _find_or_create_telegram_conversation(
    user_id: str, day: str
) -> str:
    title = f"Telegram · {day}"
    existing = await conv_repo.find_by_title(user_id, title)
    if existing:
        return existing["id"]
    created = await conv_repo.create(user_id)
    await conv_repo.update_title(created["id"], title)
    return created["id"]


async def _persist_user_msg(
    conversation_id: str, user_id: str, body: str, session_id: str, chat_id: str
) -> None:
    await msg_repo.create(
        conversation_id,
        user_id,
        "user",
        body,
        {"channel": "telegram", "session_id": session_id, "chat_id": chat_id},
    )


async def _persist_assistant_msg(
    conversation_id: str,
    user_id: str,
    body: str,
    session_id: str,
    chat_id: str,
) -> None:
    await msg_repo.create(
        conversation_id,
        user_id,
        "assistant",
        body,
        {"channel": "telegram", "session_id": session_id, "chat_id": chat_id},
    )


async def _send_and_log(
    chat_id: int | str,
    reply: str,
    conversation_id: str,
    user_id: str,
    session_id: str,
    *,
    reply_markup: dict | None = None,
) -> None:
    truncated = _truncate(reply)
    await _persist_assistant_msg(
        conversation_id, user_id, truncated, session_id, str(chat_id)
    )
    await conv_repo.update_timestamp(conversation_id)
    try:
        await tg.send_message(chat_id, truncated, reply_markup=reply_markup)
    except tg.TelegramError as e:
        logger.exception("Failed sending Telegram reply: %s", e)


async def _send_unlinked_nudge(chat_id: int | str) -> None:
    try:
        await tg.send_message(
            chat_id,
            "This chat isn't linked to an Orbit account yet. Open the Orbit "
            "web app → Hub → Telegram to grab a pairing code, then send it "
            "here as `/start <code>`.",
        )
    except tg.TelegramError as e:
        logger.warning("Failed sending unlinked nudge: %s", e)


# --------- /start <code> pairing ---------


async def _handle_pairing(chat_id: int, code: str) -> None:
    """Consume a 6-digit pairing code from Redis and bind the chat to a user.

    Codes are single-use: delete the Redis entry on success. If the code
    is missing/expired or already consumed, reply with a hint.
    """
    code = code.strip()
    if not code:
        await tg.send_message(
            chat_id,
            "Send a pairing code along with /start, e.g. `/start 123456`.",
        )
        return

    user_id = redis_svc.pop_pairing_code("telegram", code)
    if not user_id:
        await tg.send_message(
            chat_id,
            "That code didn't match anything (or it's already been used). "
            "Generate a new one in the Orbit Hub.",
        )
        return

    await channels_repo.upsert_verified(user_id, "telegram", str(chat_id))
    await tg.send_message(
        chat_id,
        "✅ Linked. You can talk to me here now — try 'what's on my calendar "
        "today?' or send /help.",
    )


# --------- Inbound message dispatch ---------


async def handle_inbound_message(chat_id: int, text: str) -> None:
    text = (text or "").strip()
    if not text:
        return

    # /start handling runs before identity lookup — pairing IS the way a
    # chat becomes linked.
    if text.startswith("/start"):
        # `/start` or `/start <code>` — split on first whitespace.
        parts = text.split(maxsplit=1)
        code = parts[1] if len(parts) > 1 else ""
        if code:
            await _handle_pairing(chat_id, code)
        else:
            await _send_unlinked_nudge(chat_id)
        return

    channel = await channels_repo.get_user_for_address("telegram", str(chat_id))
    if not channel:
        await _send_unlinked_nudge(chat_id)
        return

    user_id = channel["user_id"]

    if text.startswith("/help"):
        try:
            await tg.send_message(chat_id, _HELP_TEXT)
        except tg.TelegramError as e:
            logger.warning("Failed sending /help: %s", e)
        return

    # Reject other slash commands so a stray /foo doesn't get sent to the
    # model as a free-text turn (which would burn tokens for no reason).
    if text.startswith("/"):
        await tg.send_message(
            chat_id, "Unknown command. Send /help to see what I understand."
        )
        return

    # Fresh agent turn.
    day = _today_utc()
    session_id = f"telegram:{chat_id}:{day}"
    conversation_id = await _find_or_create_telegram_conversation(user_id, day)
    await _persist_user_msg(
        conversation_id, user_id, text, session_id, str(chat_id)
    )

    fallback_note = await msg_repo.fallback_context(conversation_id)
    input_message = f"{fallback_note}\n\n{text}" if fallback_note else text

    team = await create_team_for_user(user_id, session_id)
    try:
        run = await team.arun(input_message, stream=False, stream_events=False)
    except Exception as e:
        logger.exception("Agent run failed for Telegram chat %s: %s", chat_id, e)
        await _send_and_log(
            chat_id,
            "I hit an error trying to handle that. Try again in a moment.",
            conversation_id,
            user_id,
            session_id,
        )
        return

    # If the run paused on a write tool, persist the approval and send
    # an inline-keyboard prompt.
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
            short_token = _new_short_token()
            await approval_repo.create(
                approval_id=approval_id,
                user_id=user_id,
                conversation_id=conversation_id,
                run_id=getattr(run, "run_id", "") or "",
                session_id=session_id,
                tool_name=tool_name,
                tool_args=tool_args,
                tool_call_id=tool_call_id,
                channel="telegram",
                short_token=short_token,
            )
            preview = _summarize_tool(tool_name, tool_args)
            await _send_and_log(
                chat_id,
                preview,
                conversation_id,
                user_id,
                session_id,
                reply_markup=_approval_keyboard(short_token),
            )
            return  # only prompt for the first pending requirement

    # Normal completion.
    content = (getattr(run, "content", None) or "").strip()
    if not content:
        content = "Got it — nothing to say back, but I'm here when you need me."
    await _send_and_log(
        chat_id, content, conversation_id, user_id, session_id
    )


# --------- Callback (button tap) dispatch ---------


async def handle_callback_query(
    chat_id: int,
    message_id: int,
    query_id: str,
    data: str,
) -> None:
    # Always answer the callback first so the user's spinner stops, even
    # if the rest fails. Telegram retries on no-ack within 15s.
    if not data or ":" not in data:
        await tg.answer_callback_query(query_id, "Invalid button.")
        return

    action, _, short_token = data.partition(":")
    if action not in ("a", "r") or not short_token:
        await tg.answer_callback_query(query_id, "Invalid button.")
        return

    channel = await channels_repo.get_user_for_address(
        "telegram", str(chat_id)
    )
    if not channel:
        await tg.answer_callback_query(
            query_id, "This chat isn't linked anymore."
        )
        return

    user_id = channel["user_id"]
    pending = await approval_repo.get_by_short_token(short_token, user_id)
    if not pending:
        # Either already resolved, expired, or never existed for this user.
        await tg.answer_callback_query(
            query_id, "That action is no longer pending."
        )
        await tg.edit_message_reply_markup(chat_id, message_id, None)
        return

    approved = action == "a"
    await approval_repo.resolve(
        str(pending["id"]), "approved" if approved else "rejected"
    )
    await tg.answer_callback_query(
        query_id, "Approved." if approved else "Rejected."
    )
    # Strip the buttons so the user can't tap a second time.
    await tg.edit_message_reply_markup(chat_id, message_id, None)

    tool_args_raw = pending["tool_args"]
    tool_args = (
        json.loads(tool_args_raw)
        if isinstance(tool_args_raw, str)
        else tool_args_raw
    ) or {}

    try:
        reply = await resume_approval(
            user_id=user_id,
            session_id=pending["session_id"],
            run_id=pending["run_id"],
            tool_call_id=pending["tool_call_id"],
            tool_name=pending["tool_name"],
            tool_args=tool_args,
            approved=approved,
        )
    except Exception as e:
        logger.exception("resume_approval failed for telegram callback: %s", e)
        reply = "I marked that resolved but hit an error continuing the run."

    await _send_and_log(
        chat_id,
        reply,
        str(pending["conversation_id"]),
        user_id,
        pending["session_id"],
    )
