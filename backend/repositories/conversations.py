import uuid as _uuid

from services.database import get_pool


def _to_uuid(val: str) -> _uuid.UUID:
    return _uuid.UUID(val) if isinstance(val, str) else val


def _row_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif hasattr(v, "hex"):  # UUID
            d[k] = str(v)
    return d


async def create(user_id: str) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO conversations (user_id) VALUES ($1) RETURNING *",
            user_id,
        )
    return _row_to_dict(row)


async def get(conversation_id: str, user_id: str) -> dict | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM conversations WHERE id = $1 AND user_id = $2",
            _to_uuid(conversation_id),
            user_id,
        )
    return _row_to_dict(row) if row else None


async def list_for_user(user_id: str) -> list[dict]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC",
            user_id,
        )
    return [_row_to_dict(r) for r in rows]


async def update_title(conversation_id: str, title: str) -> dict | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """UPDATE conversations SET title = $1, updated_at = NOW()
               WHERE id = $2 RETURNING *""",
            title,
            _to_uuid(conversation_id),
        )
    return _row_to_dict(row) if row else None


async def find_by_title(user_id: str, title: str) -> dict | None:
    """Look up a conversation by exact title for a user.

    Used by SMS dispatch to find the day's existing thread before
    creating a new one.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT * FROM conversations
               WHERE user_id = $1 AND title = $2
               ORDER BY updated_at DESC LIMIT 1""",
            user_id,
            title,
        )
    return _row_to_dict(row) if row else None


async def update_timestamp(conversation_id: str) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "UPDATE conversations SET updated_at = NOW() WHERE id = $1",
            _to_uuid(conversation_id),
        )


async def delete(conversation_id: str, user_id: str) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM conversations WHERE id = $1 AND user_id = $2",
            _to_uuid(conversation_id),
            user_id,
        )
