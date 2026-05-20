"""Pytest fixtures for the verification suite.

These fixtures hit the real Neon database pointed at by DATABASE_URL.
Each test creates two ephemeral users with UUID-suffixed emails, exercises
the relevant repository method, then deletes both users on teardown —
CASCADE wipes the dependent rows (conversations, messages, activity,
approvals, channels, integrations). Running this against a non-production
DB is fine; against production it leaves no residue but should be reserved
for CI in real life.
"""

from __future__ import annotations

import os
import uuid
from collections.abc import AsyncGenerator

import asyncpg
import pytest_asyncio
from dotenv import load_dotenv

# Load backend/.env so DATABASE_URL is populated when pytest is invoked
# from the backend directory.
load_dotenv()


@pytest_asyncio.fixture(scope="session")
async def pool() -> AsyncGenerator[asyncpg.Pool, None]:
    """Session-wide asyncpg pool. The same pool services every test."""
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL not set — copy backend/.env.example to .env "
            "and fill in a real Neon connection string."
        )
    # Mirror services/database.init_pool sizing so test-time behaviour
    # matches the running server.
    p = await asyncpg.create_pool(database_url, min_size=1, max_size=4)
    # Tests share the same pool the app would use — wire it into the
    # backend's get_pool() singleton so repository modules see it.
    from services import database as db_service

    db_service._pool = p  # noqa: SLF001 — intentional test-time wiring
    try:
        yield p
    finally:
        await p.close()
        db_service._pool = None  # noqa: SLF001


async def _create_user(pool: asyncpg.Pool, tag: str) -> dict:
    """Insert a throwaway user row. Caller is responsible for cleanup.

    NOTE: users.id is `text` in the Drizzle schema (Better Auth uses
    string IDs, not UUIDs). All FK references to it are text columns.
    Pass strings, not UUID objects, into asyncpg here and everywhere
    repository code already does the same.
    """
    user_id = str(uuid.uuid4())
    email = f"isolation-{tag}-{user_id[:8]}@orbit-tests.local"
    async with pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
            VALUES ($1, $2, $3, false, NOW(), NOW())
            """,
            user_id,
            f"Isolation {tag}",
            email,
        )
    return {"id": user_id, "email": email}


async def _cleanup_user(pool: asyncpg.Pool, user_id: str) -> None:
    async with pool.acquire() as conn:
        # CASCADE handles conversations → messages, activity_log,
        # pending_approvals, integrations, channels.
        await conn.execute("DELETE FROM users WHERE id = $1", user_id)


@pytest_asyncio.fixture
async def two_users(pool: asyncpg.Pool) -> AsyncGenerator[tuple[dict, dict], None]:
    """Yield (user_a, user_b). Both removed (CASCADE) on teardown."""
    a = await _create_user(pool, "a")
    b = await _create_user(pool, "b")
    try:
        yield a, b
    finally:
        await _cleanup_user(pool, a["id"])
        await _cleanup_user(pool, b["id"])
