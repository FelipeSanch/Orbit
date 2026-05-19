from datetime import datetime

from services.database import get_pool


def _row_to_dict(row) -> dict:
    d = dict(row)
    for k, v in d.items():
        if hasattr(v, "isoformat"):
            d[k] = v.isoformat()
        elif hasattr(v, "hex"):  # UUID
            d[k] = str(v)
    return d


async def upsert(
    user_id: str,
    provider: str,
    encrypted_access_token: str,
    encrypted_refresh_token: str,
    token_expiry: str,
    scopes: list[str],
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            """INSERT INTO integrations
               (user_id, provider, encrypted_access_token,
                encrypted_refresh_token, token_expiry, scopes, updated_at)
               VALUES ($1, $2, $3, $4, $5, $6, NOW())
               ON CONFLICT (user_id, provider)
               DO UPDATE SET
                 encrypted_access_token = EXCLUDED.encrypted_access_token,
                 encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
                 token_expiry = EXCLUDED.token_expiry,
                 scopes = EXCLUDED.scopes,
                 updated_at = NOW()
               RETURNING *""",
            user_id,
            provider,
            encrypted_access_token,
            encrypted_refresh_token,
            datetime.fromisoformat(token_expiry) if isinstance(token_expiry, str) else token_expiry,
            scopes,
        )
    return _row_to_dict(row)


async def get(user_id: str, provider: str) -> dict | None:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT * FROM integrations WHERE user_id = $1 AND provider = $2",
            user_id,
            provider,
        )
    return _row_to_dict(row) if row else None


async def update_tokens(
    user_id: str,
    provider: str,
    encrypted_access_token: str,
    encrypted_refresh_token: str,
    token_expiry: str,
) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """UPDATE integrations SET
                 encrypted_access_token = $1,
                 encrypted_refresh_token = $2,
                 token_expiry = $3,
                 updated_at = NOW()
               WHERE user_id = $4 AND provider = $5""",
            encrypted_access_token,
            encrypted_refresh_token,
            datetime.fromisoformat(token_expiry) if isinstance(token_expiry, str) else token_expiry,
            user_id,
            provider,
        )


async def delete(user_id: str, provider: str) -> None:
    pool = get_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            "DELETE FROM integrations WHERE user_id = $1 AND provider = $2",
            user_id,
            provider,
        )


async def exists(user_id: str, provider: str) -> bool:
    pool = get_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT 1 FROM integrations WHERE user_id = $1 AND provider = $2",
            user_id,
            provider,
        )
    return row is not None
