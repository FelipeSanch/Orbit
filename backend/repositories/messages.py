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
    conversation_id: str,
    user_id: str,
    role: str,
    content: str,
    metadata: dict | None = None,
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO messages (conversation_id, user_id, role, content, metadata)
               VALUES ($1, $2, $3, $4, $5) RETURNING *""",
            _to_uuid(conversation_id),
            user_id,
            role,
            content,
            json.dumps(metadata or {}),
        )
    return _row_to_dict(row)


async def list_by_conversation(conversation_id: str) -> list[dict]:
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
            _to_uuid(conversation_id),
        )
    return [_row_to_dict(r) for r in rows]


async def fallback_context(conversation_id: str) -> str:
    """Build a short context string describing any fallback-executed tools
    in this conversation, so the agent doesn't repeat them.

    Returns "" if no fallback actions have happened.
    """
    pool = get_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """SELECT metadata->>'tool_executed' AS tool, content
               FROM messages
               WHERE conversation_id = $1
                 AND role = 'assistant'
                 AND (metadata->>'fallback')::bool = true
                 AND (metadata->>'tool_ok')::bool = true
               ORDER BY created_at DESC
               LIMIT 5""",
            _to_uuid(conversation_id),
        )
    if not rows:
        return ""
    lines = []
    for r in rows:
        tool = r["tool"] or "unknown"
        content = (r["content"] or "").strip()
        lines.append(f"- {tool.replace('_', ' ')}: {content}")
    return (
        "[System note — these actions were already completed earlier in "
        "this conversation. Do not repeat them unless the user explicitly "
        "asks for another one:\n" + "\n".join(lines) + "]"
    )


async def usage_since(user_id: str, since_iso: str) -> dict:
    """Sum token metrics across all assistant messages since a given time."""
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT
                COUNT(*) AS messages,
                COALESCE(SUM((metadata->'metrics'->>'input_tokens')::int), 0) AS input_tokens,
                COALESCE(SUM((metadata->'metrics'->>'output_tokens')::int), 0) AS output_tokens,
                COALESCE(SUM((metadata->'metrics'->>'total_tokens')::int), 0) AS total_tokens
            FROM messages
            WHERE user_id = $1
              AND role = 'assistant'
              AND created_at >= $2::timestamptz
            """,
            user_id,
            since_iso,
        )
    return {
        "messages": int(row["messages"] or 0),
        "input_tokens": int(row["input_tokens"] or 0),
        "output_tokens": int(row["output_tokens"] or 0),
        "total_tokens": int(row["total_tokens"] or 0),
    }
