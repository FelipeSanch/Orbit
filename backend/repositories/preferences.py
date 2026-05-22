"""user_preferences repository — one row per user, upserted by user_id.

Schema: id, user_id (UNIQUE), timezone, default_calendar_id, created_at,
updated_at. Owned by Drizzle (frontend/src/db/schema.ts); this file is
read/write via raw SQL through asyncpg, matching the rest of the
backend's repository pattern.
"""

from __future__ import annotations

import uuid as _uuid

from services.database import get_pool


def _to_uuid(val: str) -> _uuid.UUID:
    return _uuid.UUID(val) if isinstance(val, str) else val


def _row_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif hasattr(v, "hex"):
            d[k] = str(v)
    return d


async def get(user_id: str) -> dict | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM user_preferences WHERE user_id = $1",
            _to_uuid(user_id),
        )
    return _row_to_dict(row) if row else None


async def upsert(user_id: str, *, timezone: str | None = None) -> dict:
    """Upsert preferences for a user. Only updates fields explicitly
    passed (None means "leave unchanged"). Returns the resulting row.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        # Existing row first — keeps the update narrow and avoids
        # COALESCE-on-INSERT cleverness that breaks under NULL inputs.
        existing = await conn.fetchrow(
            "SELECT * FROM user_preferences WHERE user_id = $1",
            _to_uuid(user_id),
        )
        if existing is None:
            row = await conn.fetchrow(
                """INSERT INTO user_preferences (user_id, timezone)
                   VALUES ($1, COALESCE($2, 'UTC')) RETURNING *""",
                _to_uuid(user_id),
                timezone,
            )
        else:
            row = await conn.fetchrow(
                """UPDATE user_preferences
                   SET timezone = COALESCE($2, timezone),
                       updated_at = NOW()
                   WHERE user_id = $1
                   RETURNING *""",
                _to_uuid(user_id),
                timezone,
            )
    return _row_to_dict(row)
