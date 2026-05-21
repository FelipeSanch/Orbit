"""Webhook-secret enforcement tests for the Telegram inbound route.

The webhook is publicly reachable — anyone on the internet can hit
`POST /api/webhooks/telegram/inbound`. The only thing standing between
an attacker and our dispatch is the `X-Telegram-Bot-Api-Secret-Token`
header. If that check ever regresses (e.g. someone refactors the route
and forgets `hmac.compare_digest`, or removes the header param), an
attacker can drive arbitrary agent runs against bound chat_ids.

So we pin the contract here:
  - missing header → 403
  - wrong secret → 403
  - right secret → 200
  - misconfigured server (no secret set) → 503

`TestClient` doesn't run the lifespan handler (no DB init) so we patch
the dispatch out — these tests are about the security gate, not the
downstream agent.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from api.routes import telegram as telegram_route
from config import settings


@pytest.fixture
def app_with_secret(monkeypatch):
    """A FastAPI app where the Telegram webhook secret is a known value
    and the dispatch is a no-op so the test doesn't need the DB pool."""
    monkeypatch.setattr(settings, "telegram_webhook_secret", "test-secret-abc")

    # Replace the dispatch handlers — the security gate runs before them
    # and we don't want to exercise the real agent loop here.
    async def noop_msg(chat_id, text):
        return None

    async def noop_cb(chat_id, message_id, query_id, data):
        return None

    monkeypatch.setattr(telegram_route, "handle_inbound_message", noop_msg)
    monkeypatch.setattr(telegram_route, "handle_callback_query", noop_cb)

    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(telegram_route.router)
    return app


@pytest.fixture
def client(app_with_secret):
    return TestClient(app_with_secret)


def _sample_update():
    return {
        "update_id": 1,
        "message": {
            "message_id": 1,
            "chat": {"id": 42, "type": "private"},
            "text": "hi",
        },
    }


def test_webhook_rejects_missing_secret_header(client):
    """No header at all — must 403, not 200, not 401."""
    resp = client.post(
        "/api/webhooks/telegram/inbound", json=_sample_update()
    )
    assert resp.status_code == 403, (
        f"Expected 403 with no secret header, got {resp.status_code}: "
        f"{resp.text}"
    )


def test_webhook_rejects_wrong_secret_header(client):
    resp = client.post(
        "/api/webhooks/telegram/inbound",
        json=_sample_update(),
        headers={"X-Telegram-Bot-Api-Secret-Token": "wrong-secret"},
    )
    assert resp.status_code == 403, (
        f"Expected 403 with wrong secret, got {resp.status_code}: {resp.text}"
    )


def test_webhook_accepts_correct_secret(client):
    """With the right header, the route should accept the payload and
    return {"ok": True} (dispatch was patched to no-op so DB isn't hit)."""
    resp = client.post(
        "/api/webhooks/telegram/inbound",
        json=_sample_update(),
        headers={"X-Telegram-Bot-Api-Secret-Token": "test-secret-abc"},
    )
    assert resp.status_code == 200, f"Got {resp.status_code}: {resp.text}"
    assert resp.json() == {"ok": True}


def test_webhook_returns_503_when_secret_not_configured(monkeypatch):
    """If the server hasn't been configured with a secret at all, the
    webhook must fail closed — we never want to silently pass-through
    any payload."""
    monkeypatch.setattr(settings, "telegram_webhook_secret", "")
    from fastapi import FastAPI

    app = FastAPI()
    app.include_router(telegram_route.router)
    c = TestClient(app)
    resp = c.post(
        "/api/webhooks/telegram/inbound",
        json=_sample_update(),
        headers={"X-Telegram-Bot-Api-Secret-Token": "anything"},
    )
    assert resp.status_code == 503, (
        f"Unconfigured server must 503, got {resp.status_code}: {resp.text}"
    )
