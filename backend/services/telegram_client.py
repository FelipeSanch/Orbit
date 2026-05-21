"""Thin async wrapper around the Telegram Bot API.

No `python-telegram-bot` dependency — Telegram's HTTP API is small enough
that httpx + a handful of helpers is simpler than pulling in the SDK.

All methods raise `TelegramError` on a non-`ok: true` response so callers
can `try`/`except` once at the dispatch layer instead of inspecting
every response shape.

Bot username is cached at module level after the first `get_me()` call
so the pairing endpoint can return a `t.me/<username>?start=<code>`
deeplink without hitting the API on every request.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx

from config import settings

logger = logging.getLogger(__name__)

_BASE_URL = "https://api.telegram.org"
_DEFAULT_TIMEOUT_S = 10.0

# Cached at boot via main.py lifespan, or lazily on first pair request.
_bot_username: str | None = None


class TelegramError(Exception):
    """Telegram returned `ok: false` or the HTTP call failed."""


def _check_token() -> str:
    if not settings.telegram_bot_token:
        raise TelegramError(
            "TELEGRAM_BOT_TOKEN is not set — configure it in .env before "
            "calling the Telegram API."
        )
    return settings.telegram_bot_token


async def _call(method: str, payload: dict[str, Any]) -> dict[str, Any]:
    token = _check_token()
    url = f"{_BASE_URL}/bot{token}/{method}"
    async with httpx.AsyncClient(timeout=_DEFAULT_TIMEOUT_S) as client:
        try:
            resp = await client.post(url, json=payload)
        except httpx.HTTPError as e:
            raise TelegramError(f"HTTP error calling {method}: {e}") from e
    try:
        body = resp.json()
    except ValueError as e:
        raise TelegramError(
            f"{method} returned non-JSON (HTTP {resp.status_code}): {resp.text[:200]}"
        ) from e
    if not body.get("ok"):
        raise TelegramError(
            f"{method} failed (HTTP {resp.status_code}): "
            f"{body.get('description', body)}"
        )
    return body.get("result") or {}


def inline_keyboard(buttons: list[list[dict[str, str]]]) -> dict:
    """Build a Telegram inline_keyboard reply_markup payload.

    `buttons` is a list of rows; each row is a list of button dicts like
    `{"text": "✅ Send", "callback_data": "a:abcd1234"}`. Telegram caps
    callback_data at 64 bytes — use the short_token, not a UUID.
    """
    return {"inline_keyboard": buttons}


async def send_message(
    chat_id: int | str,
    text: str,
    *,
    reply_markup: dict | None = None,
    parse_mode: str | None = None,
) -> dict:
    """Send a text message. Returns the Telegram Message object."""
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text}
    if reply_markup is not None:
        payload["reply_markup"] = reply_markup
    if parse_mode is not None:
        payload["parse_mode"] = parse_mode
    return await _call("sendMessage", payload)


async def edit_message_reply_markup(
    chat_id: int | str,
    message_id: int,
    reply_markup: dict | None,
) -> None:
    """Strip or replace the inline keyboard on an existing message.

    Use after a callback resolves to remove the Approve/Reject buttons
    so the user can't double-tap.
    """
    payload: dict[str, Any] = {"chat_id": chat_id, "message_id": message_id}
    if reply_markup is None:
        # Telegram requires an empty inline_keyboard array to clear buttons.
        payload["reply_markup"] = {"inline_keyboard": []}
    else:
        payload["reply_markup"] = reply_markup
    try:
        await _call("editMessageReplyMarkup", payload)
    except TelegramError as e:
        # Not fatal — the user already got the result message either way.
        logger.warning("editMessageReplyMarkup failed: %s", e)


async def answer_callback_query(
    callback_query_id: str, text: str | None = None
) -> None:
    """Acknowledge a callback. Required within 15s or Telegram retries.

    Pass `text` to show a toast notification in the user's client; omit
    to silently dismiss the loading spinner.
    """
    payload: dict[str, Any] = {"callback_query_id": callback_query_id}
    if text:
        payload["text"] = text
    try:
        await _call("answerCallbackQuery", payload)
    except TelegramError as e:
        logger.warning("answerCallbackQuery failed: %s", e)


async def set_webhook(url: str, secret_token: str) -> dict:
    """Register the webhook URL and shared secret with Telegram."""
    return await _call(
        "setWebhook",
        {
            "url": url,
            "secret_token": secret_token,
            "allowed_updates": ["message", "callback_query"],
        },
    )


async def delete_webhook() -> dict:
    return await _call("deleteWebhook", {"drop_pending_updates": True})


async def get_webhook_info() -> dict:
    return await _call("getWebhookInfo", {})


async def get_me() -> dict:
    """Fetch the bot's own profile. Caches `username` for later use."""
    global _bot_username
    me = await _call("getMe", {})
    if me.get("username"):
        _bot_username = me["username"]
    return me


async def get_bot_username() -> str | None:
    """Return the cached bot username, fetching it once if missing.

    Returns None if no bot token is configured.
    """
    global _bot_username
    if _bot_username:
        return _bot_username
    if not settings.telegram_bot_token:
        return None
    try:
        await get_me()
    except TelegramError as e:
        logger.warning("get_me failed: %s", e)
        return None
    return _bot_username
