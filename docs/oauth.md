# Microsoft OAuth Flow

## Overview

Orbit uses Azure AD OAuth2 authorization code flow via MSAL to access Microsoft Graph API. A single app registration in Azure Portal covers Outlook Mail, Calendar, and To Do. Tokens are encrypted at rest using Fernet symmetric encryption and stored in the `integrations` table on Neon via asyncpg.

## Scopes

- `Mail.ReadWrite` — Read and modify emails
- `Mail.Send` — Send emails
- `Calendars.ReadWrite` — Read and write calendar events
- `Tasks.ReadWrite` — Read and write To Do tasks
- `User.Read` — Read user profile
- `offline_access` — Get a refresh token for long-lived access

## Flow

```
User        Frontend           Backend              Azure AD         database
 │             │                  │                    │                │
 │  Click      │                  │                    │                │
 │  "Connect"  │                  │                    │                │
 │────────────>│                  │                    │                │
 │             │  GET /api/auth/  │                    │                │
 │             │  microsoft       │                    │                │
 │             │─────────────────>│                    │                │
 │             │                  │  Store state in    │                │
 │             │                  │  Redis (TTL=600s)  │                │
 │             │                  │                    │                │
 │             │                  │  MSAL generates    │                │
 │             │  Redirect to     │  auth URL          │                │
 │             │  Azure consent   │                    │                │
 │<────────────│<─────────────────│                    │                │
 │                                                     │                │
 │  Consent + authorize                                │                │
 │────────────────────────────────────────────────────>│                │
 │                                                     │                │
 │             │  GET /callback   │                    │                │
 │             │  ?code=X&state=Y │                    │                │
 │<────────────│─────────────────>│                    │                │
 │             │                  │  Validate state    │                │
 │             │                  │  from Redis        │                │
 │             │                  │                    │                │
 │             │                  │  MSAL exchanges    │                │
 │             │                  │  code for tokens   │                │
 │             │                  │───────────────────>│                │
 │             │                  │<───────────────────│                │
 │             │                  │                    │                │
 │             │                  │  Encrypt & store   │                │
 │             │                  │  tokens            │                │
 │             │                  │───────────────────────────────────>│
 │             │                  │                    │                │
 │             │  Redirect to     │                    │                │
 │             │  /settings?      │                    │                │
 │<────────────│  microsoft=      │                    │                │
 │             │  connected       │                    │                │
```

## Azure App Registration

1. Go to Azure Portal → App registrations → New registration
2. Name: "Orbit"
3. Supported account types: "Accounts in any organizational directory and personal Microsoft accounts"
4. Redirect URI: Web → `http://localhost:8000/api/auth/microsoft/callback`
5. Under Certificates & secrets → New client secret
6. Under API permissions → Add: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Tasks.ReadWrite`, `User.Read`, `offline_access`

## Token Storage

Tokens are stored in the `integrations` table with Fernet encryption:

- `encrypted_access_token` — Short-lived (~1 hour), refreshed automatically
- `encrypted_refresh_token` — Long-lived, used to get new access tokens
- `token_expiry` — When the current access token expires
- `provider` — Set to `'microsoft'`

The encryption key is a Fernet key stored as the `ENCRYPTION_KEY` environment variable. Generate with:

```python
from cryptography.fernet import Fernet
print(Fernet.generate_key().decode())
```

## Token Refresh

`TokenManager.get_account()` handles refresh automatically:

1. Load encrypted tokens from `integrations` table
2. Decrypt access and refresh tokens
3. Check if access token expires within 5 minutes
4. If expiring, use MSAL `acquire_token_by_refresh_token` to get new tokens
5. Re-encrypt and store the new tokens
6. Build O365-compatible token dict and return authenticated Account

## O365 Integration

The O365 library provides Pythonic access to Microsoft Graph. After token refresh, we construct an `O365.Account` with a custom `BaseTokenBackend` that holds the fresh token. O365 then uses this token for all API calls (Mailbox, Schedule, ToDo).

## Security

- `integrations` table only accessed by backend via repository layer
- Frontend never sees raw tokens
- Tokens encrypted at rest with Fernet
- OAuth state parameter stored in Redis with 600s TTL to prevent CSRF
- `offline_access` scope ensures we always get a refresh token

## Revocation

`DELETE /api/auth/microsoft` deletes the token row from the `integrations` table. Microsoft does not have a simple token revocation endpoint — removing the stored tokens effectively disconnects the integration.

## Rotating the Fernet encryption key

`encryption.py` uses `MultiFernet` so a key rotation can run with both the new and the previous key live at the same time — no downtime, no forced re-OAuth.

1. **Generate a new key.**

   ```bash
   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
   ```

2. **Add it as the new primary, keeping the old key as fallback.** Edit the deployment's `.env` (or your platform's secret manager) and set:

   ```env
   ENCRYPTION_KEYS=<new>,<old>
   ```

   `ENCRYPTION_KEYS` (CSV, primary first) overrides `ENCRYPTION_KEY` (single). Restart the backend so it loads the new chain. From this point, all new writes use `<new>`; reads of old rows still succeed via the fallback.

3. **Re-encrypt every row onto the new primary.**

   ```bash
   cd backend
   python -m scripts.rotate_fernet_key --dry-run        # validate first
   python -m scripts.rotate_fernet_key                  # do it
   ```

   The script walks the `integrations` table, decrypts each token through the chain, and rewrites it encrypted with the new primary. Idempotent — re-running on an already-rotated row is harmless.

   For a scoped run (e.g. validating against one user before a full sweep):

   ```bash
   python -m scripts.rotate_fernet_key --user-id <uuid>
   ```

4. **Drop the old key once `failed=0`.** Edit `.env` again:

   ```env
   ENCRYPTION_KEYS=<new>
   ```

   Or revert to the single-key form: `ENCRYPTION_KEY=<new>`. Restart the backend. The old key is no longer needed and should be removed from any secret manager that stored it.

If the script reports any failed rows, it lists them and exits non-zero without writing partial updates for those users. Common causes: a row encrypted under a key that's no longer in the chain (someone rotated in the past and dropped the key too early), or fixture rows from test runs that were never written with a real key. Investigate before re-running.
