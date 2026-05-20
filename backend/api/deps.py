from asyncpg.pool import Pool
from fastapi import Header, HTTPException

from services.database import get_pool


async def validate_session_token(pool: Pool, token: str) -> dict | None:
    """Look up a Better Auth session token in the sessions table.

    Returns {"id": user_id, "email": email} if the token is valid and not
    expired, else None. Used by get_current_user at request entry AND by
    the SSE translator for mid-stream re-validation at tool-call boundaries
    (the stream can outlive the initial request — fail closed if the
    session is killed mid-conversation).
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT u.id, u.email
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.token = $1 AND s.expires_at > NOW()
            """,
            token,
        )
    if not row:
        return None
    return {"id": str(row["id"]), "email": row["email"]}


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Validate a Better Auth session token. Returns user dict with id and email."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.removeprefix("Bearer ")
    user = await validate_session_token(get_pool(), token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    return user
