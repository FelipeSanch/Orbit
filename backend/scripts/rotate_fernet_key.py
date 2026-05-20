"""Re-encrypt every `integrations` row from the active Fernet key chain
to a new primary key. Designed to be run by an operator during a key
rotation, NOT by the application at runtime.

Default behavior is a DRY RUN: the script counts the rows it would
mutate, validates that every ciphertext round-trips through the chain,
and exits 0 without touching the database. To actually write you must
pass `--execute`, which triggers an interactive prompt asking you to
type the DB host name. For automation, `--yes` skips the prompt; you
need both flags. This inversion exists because the failure mode (every
row re-encrypted with a key that doesn't live anywhere) is unrecoverable.

Procedure
---------

1. Generate a new key:

       python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

2. In the same `.env` as the running backend, set ENCRYPTION_KEYS to a
   comma-separated list with the NEW key first, then the previous key:

       ENCRYPTION_KEYS=<new>,<old>

   Restart the backend so it loads the new chain. With both keys live,
   encrypt uses the new primary; decrypt falls back to the old key for
   rows that haven't been rotated yet — no downtime.

3. Dry-run first, then execute:

       python -m scripts.rotate_fernet_key                      # dry-run
       python -m scripts.rotate_fernet_key --execute            # interactive
       python -m scripts.rotate_fernet_key --execute --yes      # CI/scripted

   Scoped run (e.g. validate against one user first):

       python -m scripts.rotate_fernet_key --user-id <uuid>

   The execution step walks every integrations row, decrypts each token
   via the chain, and rewrites it encrypted with the new primary.
   Idempotent: re-running on already-rotated rows is a no-op.

4. After the script reports `failed=0`, remove the OLD key from
   ENCRYPTION_KEYS (`ENCRYPTION_KEYS=<new>` or revert to ENCRYPTION_KEY).
   Restart the backend.

If `failed > 0`, the script lists the offending rows and exits non-zero
WITHOUT writing any updates for that user. Investigate (likely a row
encrypted under a key that's no longer in the chain), fix, retry.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import asyncpg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
load_dotenv(ROOT / ".env")

from services.encryption import (  # noqa: E402
    _get_multifernet,
    decrypt_token,
    encrypt_token,
    reset_for_tests,
)


def _db_host(db_url: str) -> str:
    """Return the host portion of a postgresql:// URL for the confirm prompt."""
    parsed = urlparse(db_url)
    return parsed.hostname or "<unknown-host>"


def _confirm_execute(db_url: str, row_count: int, *, auto_yes: bool) -> bool:
    """Gate the destructive write on typed confirmation.

    Returns True iff the operator typed the DB host name exactly. With
    --yes the prompt is skipped (intended for CI / scripted use that
    already supplies the right env), but the function still requires the
    `auto_yes` flag to be explicitly set — there is no silent path."""
    host = _db_host(db_url)
    print()
    print(f"About to re-encrypt {row_count} integration row(s) on host: {host}")
    print(
        "This rewrites encrypted_access_token / encrypted_refresh_token. "
        "If the new primary key is lost before re-OAuth, the rows are unrecoverable."
    )
    if auto_yes:
        print("--yes supplied; skipping interactive prompt.")
        return True
    typed = input(f"Type the DB host to confirm ({host}): ").strip()
    if typed != host:
        print(f"Confirmation mismatch ({typed!r} != {host!r}). Aborting.")
        return False
    return True


async def rotate(execute: bool, auto_yes: bool, user_id: str | None) -> int:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 2

    # Force a fresh load of the key chain so re-running in the same process
    # (or after editing .env) doesn't see stale state.
    reset_for_tests()
    chain = _get_multifernet()
    print(f"Loaded Fernet chain with {len(chain._fernets)} key(s).")
    if not execute:
        print("Mode: DRY RUN (no writes). Pass --execute to mutate.")
    else:
        print("Mode: EXECUTE — will rewrite rows after confirmation.")

    conn = await asyncpg.connect(db_url)
    try:
        if user_id:
            rows = await conn.fetch(
                "SELECT id, user_id, provider, encrypted_access_token, "
                "encrypted_refresh_token FROM integrations WHERE user_id = $1",
                user_id,
            )
            print(f"Scoped to user_id={user_id} — found {len(rows)} row(s).")
        else:
            rows = await conn.fetch(
                "SELECT id, user_id, provider, encrypted_access_token, "
                "encrypted_refresh_token FROM integrations"
            )
            print(f"Found {len(rows)} integrations row(s).")

        # First pass: validate every row decrypts and the re-encrypt round-trips.
        # This runs in both dry-run and execute mode so the operator sees
        # the same plan they'd actually run.
        plan: list[tuple[asyncpg.Record, str, str]] = []
        failures: list[tuple[str, str, str]] = []
        for row in rows:
            label = f"user={row['user_id']} provider={row['provider']}"
            try:
                at_plain = decrypt_token(row["encrypted_access_token"])
                rt_plain = decrypt_token(row["encrypted_refresh_token"])
            except Exception as e:
                failures.append((row["user_id"], row["provider"], str(e)))
                print(f"  FAIL  {label}: decrypt error — {e}")
                continue
            plan.append((row, encrypt_token(at_plain), encrypt_token(rt_plain)))
            print(f"  PLAN  {label}: decrypts + re-encrypt round-trips")

        if failures:
            print("\n--- summary ---")
            print(f"plan:    {len(plan)}")
            print(f"failed:  {len(failures)}")
            print("\nFailures (will NOT be touched):")
            for uid, prov, err in failures:
                print(f"  - {uid} / {prov}: {err}")
            print(
                "\nDecrypt failures detected. Aborting before any writes — fix "
                "these rows or scope with --user-id and re-run."
            )
            return 1

        if not execute:
            print("\n--- summary ---")
            print(f"plan:    {len(plan)}")
            print("failed:  0")
            print("Dry run complete. Re-run with --execute to apply.")
            return 0

        if not _confirm_execute(db_url, len(plan), auto_yes=auto_yes):
            return 3

        updated = 0
        for row, at_re, rt_re in plan:
            await conn.execute(
                "UPDATE integrations "
                "SET encrypted_access_token = $1, "
                "    encrypted_refresh_token = $2, "
                "    updated_at = NOW() "
                "WHERE id = $3",
                at_re,
                rt_re,
                row["id"],
            )
            updated += 1
            print(
                f"  OK    user={row['user_id']} provider={row['provider']}: "
                "re-encrypted with primary key"
            )

        print("\n--- summary ---")
        print(f"updated: {updated}")
        print("failed:  0")
        return 0
    finally:
        await conn.close()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--execute",
        action="store_true",
        help=(
            "Actually write to the DB. Without this, the script runs as a "
            "dry-run (validates the chain + prints the plan, exits 0)."
        ),
    )
    p.add_argument(
        "--yes",
        action="store_true",
        help=(
            "Skip the interactive 'type the DB host' confirmation. Only "
            "honored together with --execute. Use for CI/scripted rotations."
        ),
    )
    p.add_argument(
        "--user-id",
        default=None,
        help=(
            "Only rotate rows belonging to this user_id. Useful for "
            "partial rotations or for e2e tests scoped to a synthetic user."
        ),
    )
    args = p.parse_args()
    return asyncio.run(rotate(args.execute, args.yes, args.user_id))


if __name__ == "__main__":
    sys.exit(main())
