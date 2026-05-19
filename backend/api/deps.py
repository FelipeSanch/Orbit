from fastapi import Header, HTTPException

from services.database import get_pool


async def get_current_user(authorization: str = Header(...)) -> dict:
    """Validate a Better Auth session token. Returns user dict with id and email."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Invalid authorization header")

    token = authorization.removeprefix("Bearer ")
    pool = get_pool()

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
        raise HTTPException(status_code=401, detail="Invalid or expired session")

    return {"id": str(row["id"]), "email": row["email"]}
