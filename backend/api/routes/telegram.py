"""Telegram channel routes.

Two surfaces:

1. **Webhook** — `POST /api/webhooks/telegram/inbound`. Public; Telegram
   posts every Update here. Auth is the secret header
   `X-Telegram-Bot-Api-Secret-Token`, which we registered via
   `setWebhook(secret_token=...)`. We compare in constant time and reject
   on mismatch. The handler MUST return 200 within ~15s or Telegram retries
   (and eventually backs off). So we queue dispatch via `BackgroundTasks`
   and return immediately.

2. **Pairing + status + disconnect** — `/api/channels/telegram/*`, all
   session-gated via `get_current_user`. The Hub UI calls these to
   generate a one-time code, poll for the chat to bind, and to revoke.
"""

from __future__ import annotations

import hmac
import logging
import secrets

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    Header,
    HTTPException,
    Request,
)

from api.deps import get_current_user
from config import settings
from repositories import channels as channels_repo
from services import redis as redis_svc
from services import telegram_client as tg
from services.telegram_dispatch import (
    handle_callback_query,
    handle_inbound_message,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["telegram"])


# --------- Webhook ---------


@router.post("/api/webhooks/telegram/inbound")
async def telegram_webhook(
    request: Request,
    background: BackgroundTasks,
    x_telegram_bot_api_secret_token: str | None = Header(default=None),
) -> dict:
    """Telegram pushes inbound Updates here. Return 200 fast."""
    expected = settings.telegram_webhook_secret
    if not expected:
        # Webhook isn't configured — refuse rather than silently passing
        # any payload through, which would let an attacker drive dispatch.
        raise HTTPException(
            status_code=503, detail="Telegram webhook is not configured"
        )
    provided = x_telegram_bot_api_secret_token or ""
    if not hmac.compare_digest(provided, expected):
        # Telegram retries on non-2xx; we want spoofed requests to fail
        # loudly in logs but not hammer the endpoint. 403 is terminal.
        logger.warning("Rejected Telegram webhook with bad secret header")
        raise HTTPException(status_code=403, detail="Invalid secret token")

    try:
        update = await request.json()
    except Exception as e:
        logger.warning("Telegram webhook got non-JSON body: %s", e)
        # Telegram will retry — but the body is malformed, return 200
        # anyway so it doesn't bounce forever.
        return {"ok": True}

    # `message` (text input) and `callback_query` (button tap) are the only
    # Update types we registered for. Everything else (edited messages,
    # channel posts) we ack and ignore.
    if msg := update.get("message"):
        chat = msg.get("chat") or {}
        chat_type = chat.get("type")
        # DM-only — ignore groups/channels for now.
        if chat_type != "private":
            return {"ok": True}
        chat_id = chat.get("id")
        text = msg.get("text") or ""
        if chat_id is not None and text:
            background.add_task(handle_inbound_message, chat_id, text)
        return {"ok": True}

    if cb := update.get("callback_query"):
        msg = cb.get("message") or {}
        chat = msg.get("chat") or {}
        chat_type = chat.get("type")
        if chat_type != "private":
            return {"ok": True}
        chat_id = chat.get("id")
        message_id = msg.get("message_id")
        query_id = cb.get("id")
        data = cb.get("data") or ""
        if (
            chat_id is not None
            and message_id is not None
            and query_id
            and data
        ):
            background.add_task(
                handle_callback_query, chat_id, message_id, query_id, data
            )
        return {"ok": True}

    return {"ok": True}


# --------- Pairing / status / disconnect ---------


def _pairing_code() -> str:
    """6-digit numeric code. `secrets.randbelow` is uniform; format with
    leading zeros so users always type the same shape.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


@router.post("/api/channels/telegram/pair")
async def pair_telegram(user: dict = Depends(get_current_user)) -> dict:
    """Generate a single-use, 10-minute pairing code.

    Returns the code, the bot username, and a deeplink the UI can present
    as an "Open Telegram" button (mobile + desktop both resolve t.me/...).
    """
    if not settings.telegram_bot_token:
        raise HTTPException(
            status_code=503,
            detail=(
                "Telegram bot is not configured. Set TELEGRAM_BOT_TOKEN in "
                "the backend .env."
            ),
        )

    bot_username = await tg.get_bot_username()
    if not bot_username:
        raise HTTPException(
            status_code=502,
            detail="Couldn't reach Telegram to look up the bot username.",
        )

    code = _pairing_code()
    redis_svc.set_pairing_code("telegram", code, user["id"], ex=600)

    return {
        "code": code,
        "bot_username": bot_username,
        "deeplink": f"https://t.me/{bot_username}?start={code}",
        "expires_in_seconds": 600,
    }


@router.get("/api/channels/telegram/status")
async def telegram_status(user: dict = Depends(get_current_user)) -> dict:
    """Return whether this user has a verified Telegram chat bound."""
    rows = await channels_repo.list_for_user(user["id"])
    tg_row = next(
        (r for r in rows if r["type"] == "telegram" and r["verified"]), None
    )
    if not tg_row:
        return {"connected": False}
    return {
        "connected": True,
        "chat_id": tg_row["address"],
        "verified_at": tg_row["verified_at"],
    }


@router.delete("/api/channels/telegram")
async def telegram_disconnect(
    user: dict = Depends(get_current_user),
) -> dict:
    rows = await channels_repo.list_for_user(user["id"])
    for r in rows:
        if r["type"] == "telegram":
            await channels_repo.delete(r["id"], user["id"])
    return {"status": "disconnected"}
