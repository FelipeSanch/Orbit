"""Channels repository: maps external addresses (phone numbers, etc.)
to Orbit users.

Schema (see frontend/src/db/schema.ts):
  channels(id, user_id, type, address, verified, verified_at, created_at)
  unique (type, address)
"""

from __future__ import annotations

import uuid as _uuid

from services.database import get_pool


def _row_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif hasattr(v, "hex"):  # UUID
            d[k] = str(v)
    return d


async def get_user_for_address(channel_type: str, address: str) -> dict | None:
    """Find a user by channel type+address. Returns None if no mapping."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT c.*, u.email AS user_email, u.name AS user_name
               FROM channels c
               JOIN users u ON u.id = c.user_id
               WHERE c.type = $1 AND c.address = $2 AND c.verified = true""",
            channel_type,
            address,
        )
    return _row_to_dict(row) if row else None


async def upsert_verified(
    user_id: str, channel_type: str, address: str
) -> dict:
    """Insert or update a channel mapping marked verified.

    Callers MUST canonicalize `address` before invoking — there's a
    `(type, address)` unique index, so two different formats of the
    same address would collide as separate rows otherwise. For
    Telegram, the address is a string chat_id (numeric).
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO channels (id, user_id, type, address, verified, verified_at)
               VALUES ($1, $2, $3, $4, true, NOW())
               ON CONFLICT (type, address) DO UPDATE SET
                 user_id = EXCLUDED.user_id,
                 verified = true,
                 verified_at = NOW()
               RETURNING *""",
            _uuid.uuid4(),
            user_id,
            channel_type,
            address,
        )
    return _row_to_dict(row)


async def list_for_user(user_id: str) -> list[dict]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM channels WHERE user_id = $1 ORDER BY created_at DESC",
            user_id,
        )
    return [_row_to_dict(r) for r in rows]


async def delete(channel_id: str, user_id: str) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM channels WHERE id = $1 AND user_id = $2",
            _uuid.UUID(channel_id),
            user_id,
        )
