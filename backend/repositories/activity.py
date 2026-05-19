import json
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


async def create(
    user_id: str,
    conversation_id: str | None,
    event_type: str,
    event_data: dict,
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO activity_log (user_id, conversation_id, event_type, event_data)
               VALUES ($1, $2, $3, $4) RETURNING *""",
            user_id,
            _to_uuid(conversation_id) if conversation_id else None,
            event_type,
            json.dumps(event_data),
        )
    return _row_to_dict(row)


async def list_for_user(
    user_id: str,
    event_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    pool = get_pool()
    async with pool.acquire() as conn:
        if event_type:
            rows = await conn.fetch(
                """SELECT * FROM activity_log
                   WHERE user_id = $1 AND event_type = $2
                   ORDER BY created_at DESC LIMIT $3 OFFSET $4""",
                user_id,
                event_type,
                limit,
                offset,
            )
        else:
            rows = await conn.fetch(
                """SELECT * FROM activity_log
                   WHERE user_id = $1
                   ORDER BY created_at DESC LIMIT $2 OFFSET $3""",
                user_id,
                limit,
                offset,
            )
    return [_row_to_dict(r) for r in rows]
