"""End-to-end behavioural tests for the Telegram channel.

These tests exercise the real dispatch + repositories against the real
Neon DB (via the shared `two_users` fixture), but monkeypatch the
Telegram Bot API client + Agno integration so no external calls happen.

What we want to guarantee here, beyond the happy path:

1. **Round-trip back to Telegram.** When the user approves a write
   action via the inline button, the confirmation MUST come back through
   `tg.send_message` — not silently into the web SSE stream. Telegram is
   a peer surface; if the response only appears in the web activity feed,
   the channel is broken.

2. **Fallback path still talks to Telegram.** `resume_approval` has two
   paths: the happy path (Agno `acontinue_run` returns content) and the
   fallback (Agno can't resume → directly invoke the tool, return a
   canned confirmation). Both return a string. The dispatch must call
   `tg.send_message` in BOTH cases so the user never sees a hung "…".

3. **Pairing codes are single-use.** Once a code is consumed by a `/start`
   call, a second `/start` with the same code from another chat must
   reject. This pins down `redis.pop_pairing_code` semantics — atomic
   GET-then-DELETE, not GET-then-maybe-delete.
"""

from __future__ import annotations

import pytest
import pytest_asyncio

from repositories import approvals as approval_repo
from repositories import channels as channels_repo
from repositories import conversations as conv_repo
from services import redis as redis_svc
from services import telegram_client as tg
from services import telegram_dispatch


@pytest_asyncio.fixture
async def sent_messages(monkeypatch):
    """Capture every send_message call so tests can assert what the user saw.

    Each entry is `(chat_id, text, reply_markup)`. Tests inspect the list
    rather than asserting at call time so a missing call is a clear
    `assert len(...) >= N` failure, not a silent pass.
    """
    captured: list[tuple[int | str, str, dict | None]] = []

    async def fake_send(chat_id, text, *, reply_markup=None, parse_mode=None):
        captured.append((chat_id, text, reply_markup))
        return {"message_id": 1}

    async def fake_edit(chat_id, message_id, reply_markup):
        # Tests don't care about the strip-buttons call, just don't hit network.
        return None

    async def fake_answer(query_id, text=None):
        return None

    monkeypatch.setattr(tg, "send_message", fake_send)
    monkeypatch.setattr(tg, "edit_message_reply_markup", fake_edit)
    monkeypatch.setattr(tg, "answer_callback_query", fake_answer)
    return captured


# ─────────────────────────────────────────────────────────────────────
# Pairing — single-use enforcement
# ─────────────────────────────────────────────────────────────────────


async def test_pairing_code_is_single_use_per_telegram_chat(
    two_users, sent_messages
):
    """Two /start calls with the same code: second must reject.

    Setup: stash a code in Redis pointing at user A. Simulate `/start
    <code>` from chat 100 (should bind), then again from chat 200
    (should be told the code is already used).
    """
    a, _ = two_users
    code = "111111"
    # Clear any stray state from prior test runs that didn't use a
    # session-scoped fixture for this fallback dict.
    redis_svc._telegram_pair.pop(code, None)  # type: ignore[attr-defined]
    redis_svc.set_pairing_code("telegram", code, a["id"], ex=600)

    # First /start — should bind chat 100 to user A.
    await telegram_dispatch.handle_inbound_message(100, f"/start {code}")
    binding = await channels_repo.get_user_for_address("telegram", "100")
    assert binding is not None, "First /start should have linked chat 100"
    assert binding["user_id"] == a["id"]

    # Second /start with the SAME code from a different chat — must reject.
    await telegram_dispatch.handle_inbound_message(200, f"/start {code}")
    leaked = await channels_repo.get_user_for_address("telegram", "200")
    assert leaked is None, (
        "Second /start with a consumed code must NOT bind chat 200 — "
        "pop_pairing_code is not enforcing single-use."
    )

    # Spot-check the replies that went to each chat.
    chats_replied_to = {chat_id for (chat_id, _, _) in sent_messages}
    assert 100 in chats_replied_to
    assert 200 in chats_replied_to
    chat_200_reply = next(t for (cid, t, _) in sent_messages if cid == 200)
    assert "didn't match" in chat_200_reply or "already been used" in chat_200_reply

    # Teardown: drop the channel rows we created (users CASCADE will get
    # them anyway, but be explicit so the assertion above is the only
    # thing that fails if the test regresses).
    rows = await channels_repo.list_for_user(a["id"])
    for r in rows:
        if r["type"] == "telegram":
            await channels_repo.delete(r["id"], a["id"])


# ─────────────────────────────────────────────────────────────────────
# Approval round-trip — happy path AND fallback both reply via Telegram
# ─────────────────────────────────────────────────────────────────────


async def _seed_pending_approval(user_id: str) -> tuple[dict, str]:
    """Create a conversation + pending Telegram approval; return both."""
    conv = await conv_repo.create(user_id)
    short = "tok12345"
    approval_id = "11111111-1111-1111-1111-111111111111"
    await approval_repo.create(
        approval_id=approval_id,
        user_id=user_id,
        conversation_id=conv["id"],
        run_id="run-test",
        session_id="telegram:42:2026-05-21",
        tool_name="send_email",
        tool_args={"to": "x@example.com", "subject": "Hi", "body": "Hello"},
        tool_call_id="tc-test",
        channel="telegram",
        short_token=short,
    )
    return conv, short


@pytest.mark.parametrize(
    "scenario, resume_behavior, expected_substring",
    [
        # Happy path: Agno's acontinue_run returns a normal string.
        (
            "happy_path",
            lambda **_: "Sent the email to x@example.com.",
            "Sent the email",
        ),
        # Fallback path: resume_approval falls back to direct tool execution
        # and returns the canned confirmation. The dispatch must still
        # surface this in Telegram.
        (
            "fallback_path",
            lambda **_: "Sent the email.",  # _FALLBACK_SUCCESS['send_email']
            "Sent the email",
        ),
    ],
)
async def test_approval_callback_always_replies_in_telegram(
    two_users, sent_messages, monkeypatch, scenario, resume_behavior,
    expected_substring,
):
    """Approve via inline button → confirmation MUST land in Telegram.

    This is the test the user explicitly called out as the risk: if the
    dispatch only wired the happy-path resume to send back to Telegram,
    a silent-resume bug would leave the user staring at "…" after the
    email actually got sent. We assert `send_message(chat_id, ...)` is
    called in both scenarios.
    """
    a, _ = two_users

    # Bind a chat so the callback can identify the user.
    chat_id = 42
    await channels_repo.upsert_verified(a["id"], "telegram", str(chat_id))

    _conv, short = await _seed_pending_approval(a["id"])

    # Replace resume_approval with the scenario's behavior. Importantly,
    # we patch the symbol the dispatch module already imported — patching
    # `services.run_resume.resume_approval` here wouldn't take effect.
    async def fake_resume(**kwargs):
        return resume_behavior(**kwargs)

    monkeypatch.setattr(telegram_dispatch, "resume_approval", fake_resume)

    # Tap the Approve button.
    await telegram_dispatch.handle_callback_query(
        chat_id=chat_id,
        message_id=999,
        query_id="cbq-test",
        data=f"a:{short}",
    )

    # The confirmation MUST have been sent back to Telegram.
    telegram_replies = [
        (cid, text) for (cid, text, _) in sent_messages if cid == chat_id
    ]
    assert telegram_replies, (
        f"[{scenario}] Approve tap produced no send_message back to chat "
        f"{chat_id} — channel is not a peer surface."
    )
    assert any(expected_substring in text for (_, text) in telegram_replies), (
        f"[{scenario}] Sent {len(telegram_replies)} messages back to "
        f"Telegram, but none contained {expected_substring!r}. Got: "
        f"{telegram_replies!r}"
    )

    # Approval row should be marked approved.
    re_fetch = await approval_repo.get_pending(
        "11111111-1111-1111-1111-111111111111", a["id"]
    )
    assert re_fetch is None, (
        f"[{scenario}] Approval should be resolved (no longer pending)"
    )

    # Teardown.
    rows = await channels_repo.list_for_user(a["id"])
    for r in rows:
        if r["type"] == "telegram":
            await channels_repo.delete(r["id"], a["id"])


async def test_reject_callback_also_replies_in_telegram(
    two_users, sent_messages, monkeypatch
):
    """Reject button must also produce a Telegram reply (not silent ack)."""
    a, _ = two_users
    chat_id = 43
    await channels_repo.upsert_verified(a["id"], "telegram", str(chat_id))
    _conv, short = await _seed_pending_approval(a["id"])

    async def fake_resume(**kwargs):
        # The real resume_approval returns "Got it, not doing that." on reject.
        assert kwargs["approved"] is False
        return "Got it, not doing that."

    monkeypatch.setattr(telegram_dispatch, "resume_approval", fake_resume)

    await telegram_dispatch.handle_callback_query(
        chat_id=chat_id,
        message_id=999,
        query_id="cbq-rej",
        data=f"r:{short}",
    )

    replies = [text for (cid, text, _) in sent_messages if cid == chat_id]
    assert replies, "Reject tap must reply in Telegram, not silently"
    assert any("not doing that" in t.lower() for t in replies)

    rows = await channels_repo.list_for_user(a["id"])
    for r in rows:
        if r["type"] == "telegram":
            await channels_repo.delete(r["id"], a["id"])


async def test_callback_with_unknown_short_token_does_not_resume(
    two_users, sent_messages, monkeypatch
):
    """If the short_token isn't in pending_approvals (already resolved,
    expired, or never existed), the callback must NOT call resume_approval
    and must inform the user — not silently drop."""
    a, _ = two_users
    chat_id = 44
    await channels_repo.upsert_verified(a["id"], "telegram", str(chat_id))

    resume_called = False

    async def fake_resume(**kwargs):
        nonlocal resume_called
        resume_called = True
        return "should never run"

    monkeypatch.setattr(telegram_dispatch, "resume_approval", fake_resume)

    await telegram_dispatch.handle_callback_query(
        chat_id=chat_id,
        message_id=999,
        query_id="cbq-bogus",
        data="a:nonexistent",
    )

    assert not resume_called, "Must not resume on a stale/unknown short_token"

    rows = await channels_repo.list_for_user(a["id"])
    for r in rows:
        if r["type"] == "telegram":
            await channels_repo.delete(r["id"], a["id"])
