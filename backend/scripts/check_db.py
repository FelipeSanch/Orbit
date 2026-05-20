"""Diagnostic: connect to Neon, dump schema state, surface drift.

Reads DATABASE_URL from backend/.env and reports:
  - Reachable? (latency)
  - Tables in public + agno schemas
  - Indexes per table (so we catch missing ones the Drizzle schema declared)
  - Row counts on the user-data tables
  - Drizzle expected-vs-actual diff (driven by frontend/src/db/schema.ts)

Run: `python -m scripts.check_db` from backend/. Read-only — never
writes, never alters, safe against prod.
"""

from __future__ import annotations

import asyncio
import os
import time

import asyncpg
from dotenv import load_dotenv

# Tables Drizzle expects in `public`. Source: frontend/src/db/schema.ts.
EXPECTED_PUBLIC_TABLES = {
    # Better Auth
    "users",
    "sessions",
    "accounts",
    "verifications",
    "jwks",
    # App
    "user_preferences",
    "integrations",
    "conversations",
    "messages",
    "activity_log",
    "pending_approvals",
    "channels",
}


async def _query(conn: asyncpg.Connection, sql: str, *args):
    return await conn.fetch(sql, *args)


async def main() -> None:
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise SystemExit("DATABASE_URL not set in backend/.env")

    print(f"Connecting to {database_url.split('@')[1] if '@' in database_url else '...'}")
    t0 = time.perf_counter()
    conn = await asyncpg.connect(database_url)
    t_connect_ms = (time.perf_counter() - t0) * 1000
    print(f"Connected in {t_connect_ms:.0f} ms")

    try:
        # ── Schemas ──────────────────────────────────────────────────
        schemas = await _query(
            conn,
            "SELECT schema_name FROM information_schema.schemata "
            "WHERE schema_name IN ('public','agno') ORDER BY schema_name",
        )
        print(f"\nSchemas present: {[r['schema_name'] for r in schemas]}")

        # ── Tables in public ─────────────────────────────────────────
        public_tables = {
            r["table_name"]
            for r in await _query(
                conn,
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'public' ORDER BY table_name",
            )
        }
        print(f"\nTables in public ({len(public_tables)}):")
        for t in sorted(public_tables):
            print(f"  - {t}")

        missing = EXPECTED_PUBLIC_TABLES - public_tables
        extra = public_tables - EXPECTED_PUBLIC_TABLES
        if missing:
            print(f"\n[DRIFT] Drizzle expects but DB is missing: {sorted(missing)}")
        if extra:
            print(
                f"\n[INFO] DB has tables not in Drizzle schema "
                f"(possibly fine — Agno-managed): {sorted(extra)}"
            )
        if not missing and not extra:
            print("\n[OK] No table-level drift.")

        # ── Tables in agno (managed by Agno automatically) ───────────
        agno_tables = [
            r["table_name"]
            for r in await _query(
                conn,
                "SELECT table_name FROM information_schema.tables "
                "WHERE table_schema = 'agno' ORDER BY table_name",
            )
        ]
        print(f"\nTables in agno schema ({len(agno_tables)}):")
        for t in agno_tables:
            print(f"  - {t}")

        # ── Indexes per public table ─────────────────────────────────
        print("\nIndexes per public table:")
        for t in sorted(public_tables):
            indexes = await _query(
                conn,
                "SELECT indexname, indexdef FROM pg_indexes "
                "WHERE schemaname = 'public' AND tablename = $1 "
                "ORDER BY indexname",
                t,
            )
            print(f"  {t}:")
            for idx in indexes:
                print(f"    {idx['indexname']}")

        # ── Row counts on data tables ────────────────────────────────
        print("\nRow counts:")
        for t in sorted(public_tables):
            count = await conn.fetchval(f"SELECT COUNT(*) FROM public.{t}")
            print(f"  {t}: {count}")

    finally:
        await conn.close()
        print("\nDone.")


if __name__ == "__main__":
    asyncio.run(main())
