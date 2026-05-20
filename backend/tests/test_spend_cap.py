"""Tests for the daily-spend cap.

Verifies the pure pricing math and the integrated check that reads
real token metrics from `messages.metadata.metrics`. The integration
tests use the same two_users fixture and ephemeral-user cleanup as
the repository isolation suite, so a failed test never leaves residue.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone

import pytest

from config import settings
from services import spend_cap
from services.pricing import (
    INPUT_COST_PER_MTOK,
    OUTPUT_COST_PER_MTOK,
    usd_cost,
)

# ── Pricing math (pure, no DB) ─────────────────────────────────────


def test_usd_cost_zero_tokens_is_zero():
    assert usd_cost(0, 0) == 0.0


def test_usd_cost_uses_published_sonnet_rates():
    # 1M input + 1M output should equal $3 + $15 = $18.
    assert usd_cost(1_000_000, 1_000_000) == pytest.approx(
        INPUT_COST_PER_MTOK + OUTPUT_COST_PER_MTOK
    )


def test_usd_cost_input_only():
    # 500k input tokens at $3/M = $1.50.
    assert usd_cost(500_000, 0) == pytest.approx(1.5)


def test_usd_cost_output_only():
    # 500k output tokens at $15/M = $7.50.
    assert usd_cost(0, 500_000) == pytest.approx(7.5)


# ── Cap check (hits real Neon) ─────────────────────────────────────


async def _seed_metrics(
    pool, conversation_id: str, user_id: str, input_tokens: int, output_tokens: int
) -> None:
    """Insert an assistant message carrying the given token metrics."""
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO messages (conversation_id, user_id, role, content, metadata, created_at)
            VALUES ($1, $2, 'assistant', 'seed', $3::jsonb, NOW())
            """,
            __import__("uuid").UUID(conversation_id),
            user_id,
            json.dumps(
                {
                    "metrics": {
                        "input_tokens": input_tokens,
                        "output_tokens": output_tokens,
                        "total_tokens": input_tokens + output_tokens,
                    }
                }
            ),
        )


async def _new_conversation(pool, user_id: str) -> str:
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO conversations (user_id) VALUES ($1) RETURNING id",
            user_id,
        )
    return str(row["id"])


async def test_cap_allows_under_cap(monkeypatch, two_users, pool):
    """Fresh user with no usage today is allowed through."""
    monkeypatch.setattr(settings, "daily_spend_cap_usd", 1.0)
    user_a, _ = two_users
    result = await spend_cap.check_daily_spend(user_a["id"])
    assert result.allowed is True
    assert result.current_usd == 0.0
    assert result.cap_usd == 1.0


async def test_cap_blocks_at_or_over_cap(monkeypatch, two_users, pool):
    """Once accumulated cost ≥ cap, requests are blocked."""
    monkeypatch.setattr(settings, "daily_spend_cap_usd", 0.50)
    user_a, _ = two_users
    conv = await _new_conversation(pool, user_a["id"])
    # 100k input + 25k output = $0.30 + $0.375 = $0.675, well over the $0.50 cap.
    await _seed_metrics(pool, conv, user_a["id"], 100_000, 25_000)
    result = await spend_cap.check_daily_spend(user_a["id"])
    assert result.allowed is False
    assert result.current_usd >= 0.50
    assert result.cap_usd == 0.50


async def test_cap_is_per_user(monkeypatch, two_users, pool):
    """User A's spend never affects user B's cap."""
    monkeypatch.setattr(settings, "daily_spend_cap_usd", 0.10)
    user_a, user_b = two_users
    conv_a = await _new_conversation(pool, user_a["id"])
    # Push user A well over the cap.
    await _seed_metrics(pool, conv_a, user_a["id"], 200_000, 50_000)

    a_check = await spend_cap.check_daily_spend(user_a["id"])
    b_check = await spend_cap.check_daily_spend(user_b["id"])

    assert a_check.allowed is False
    assert b_check.allowed is True
    assert b_check.current_usd == 0.0


async def test_cap_of_zero_disables_check(monkeypatch, two_users, pool):
    """A cap of 0 short-circuits the DB read and always allows."""
    monkeypatch.setattr(settings, "daily_spend_cap_usd", 0.0)
    user_a, _ = two_users
    # Even with huge spend, cap=0 means no check happens.
    conv = await _new_conversation(pool, user_a["id"])
    await _seed_metrics(pool, conv, user_a["id"], 10_000_000, 10_000_000)
    result = await spend_cap.check_daily_spend(user_a["id"])
    assert result.allowed is True


async def test_cap_ignores_yesterdays_spend(monkeypatch, two_users, pool):
    """The check only sums spend since the current UTC day's midnight."""
    monkeypatch.setattr(settings, "daily_spend_cap_usd", 0.10)
    user_a, _ = two_users
    conv = await _new_conversation(pool, user_a["id"])
    yesterday = (
        datetime.now(timezone.utc)
        .replace(hour=0, minute=0, second=0, microsecond=0)
        .replace(day=max(1, datetime.now(timezone.utc).day - 1))
    )

    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO messages (conversation_id, user_id, role, content, metadata, created_at)
            VALUES ($1, $2, 'assistant', 'old', $3::jsonb, $4)
            """,
            __import__("uuid").UUID(conv),
            user_a["id"],
            json.dumps({"metrics": {"input_tokens": 1_000_000, "output_tokens": 1_000_000}}),
            yesterday,
        )

    result = await spend_cap.check_daily_spend(user_a["id"])
    assert result.allowed is True
    assert result.current_usd == 0.0
