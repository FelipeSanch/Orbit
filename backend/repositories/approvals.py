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
    approval_id: str,
    user_id: str,
    conversation_id: str,
    run_id: str,
    session_id: str,
    tool_name: str,
    tool_args: dict,
    tool_call_id: str,
    channel: str = "web",
    short_token: str | None = None,
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO pending_approvals
               (id, user_id, conversation_id, run_id, session_id,
                tool_name, tool_args, tool_call_id, status, channel,
                short_token)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending', $9, $10)
               RETURNING *""",
            _to_uuid(approval_id),
            user_id,
            _to_uuid(conversation_id),
            run_id,
            session_id,
            tool_name,
            json.dumps(tool_args),
            tool_call_id,
            channel,
            short_token,
        )
    return _row_to_dict(row)


async def get_by_short_token(short_token: str, user_id: str) -> dict | None:
    """Look up a pending approval by its short_token (Telegram callbacks).

    Scoped by user_id so a callback from one user can't resolve another
    user's approval even if short_tokens collided by accident.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT * FROM pending_approvals
               WHERE short_token = $1 AND user_id = $2 AND status = 'pending'""",
            short_token,
            user_id,
        )
    return _row_to_dict(row) if row else None


async def get_latest_pending_for_user(user_id: str, channel: str) -> dict | None:
    """Find the most recent pending approval for a user on a given channel.

    Used by the SMS YES/NO reply flow — the inbound webhook needs to know
    which approval the user is responding to.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT * FROM pending_approvals
               WHERE user_id = $1
                 AND channel = $2
                 AND status = 'pending'
                 AND created_at > NOW() - INTERVAL '15 minutes'
               ORDER BY created_at DESC LIMIT 1""",
            user_id,
            channel,
        )
    return _row_to_dict(row) if row else None


async def get_pending(approval_id: str, user_id: str) -> dict | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """SELECT * FROM pending_approvals
               WHERE id = $1 AND user_id = $2 AND status = 'pending'""",
            _to_uuid(approval_id),
            user_id,
        )
    return _row_to_dict(row) if row else None


async def resolve(approval_id: str, status: str) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE pending_approvals
               SET status = $1, resolved_at = NOW()
               WHERE id = $2""",
            status,
            _to_uuid(approval_id),
        )
