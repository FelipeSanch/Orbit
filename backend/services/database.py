from __future__ import annotations

import asyncpg

_pool: asyncpg.Pool | None = None


async def init_pool(database_url: str) -> None:
    """Create the asyncpg connection pool."""
    global _pool
    _pool = await asyncpg.create_pool(database_url, min_size=2, max_size=10)


async def close_pool() -> None:
    """Close the asyncpg connection pool."""
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def get_pool() -> asyncpg.Pool:
    """Return the active connection pool. Raises if not initialized."""
    if _pool is None:
        raise RuntimeError("Database pool not initialized — call init_pool() first")
    return _pool
