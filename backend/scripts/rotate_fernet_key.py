"""Re-encrypt every `integrations` row from the active Fernet key chain
to a new primary key. Designed to be run by an operator during a key
rotation, NOT by the application at runtime.

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

3. Run this script:

       python -m scripts.rotate_fernet_key                # do it
       python -m scripts.rotate_fernet_key --dry-run      # validate only

   It walks every integrations row, decrypts each token via the chain,
   and rewrites it encrypted with the new primary. Idempotent: re-running
   on already-rotated rows is a no-op.

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


async def rotate(dry_run: bool, user_id: str | None) -> int:
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        return 2

    # Force a fresh load of the key chain so re-running in the same process
    # (or after editing .env) doesn't see stale state.
    reset_for_tests()
    chain = _get_multifernet()
    print(f"Loaded Fernet chain with {len(chain._fernets)} key(s).")

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

        updated = 0
        skipped = 0
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

            at_re = encrypt_token(at_plain)
            rt_re = encrypt_token(rt_plain)

            if dry_run:
                print(f"  DRY   {label}: decrypt+re-encrypt round-tripped OK")
                skipped += 1
                continue

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
            print(f"  OK    {label}: re-encrypted with primary key")

        print("\n--- summary ---")
        print(f"updated:  {updated}")
        print(f"dry-run:  {skipped}")
        print(f"failed:   {len(failures)}")
        if failures:
            print("\nFailures (rows NOT rewritten):")
            for uid, prov, err in failures:
                print(f"  - {uid} / {prov}: {err}")
            return 1
        return 0
    finally:
        await conn.close()


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Decrypt + re-encrypt in memory, don't write to the DB.",
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
    return asyncio.run(rotate(args.dry_run, args.user_id))


if __name__ == "__main__":
    sys.exit(main())
