from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import msal

from config import settings
from repositories import integrations as integ_repo
from services.encryption import decrypt_token, encrypt_token

if TYPE_CHECKING:
    from O365 import Account

MICROSOFT_SCOPES = [
    "Mail.ReadWrite",
    "Mail.Send",
    "Calendars.ReadWrite",
    "Tasks.ReadWrite",
    "User.Read",
]

# MSAL rejects these reserved scopes in token requests
_RESERVED_SCOPES = {"openid", "offline_access", "profile"}

# Refresh when the access token has fewer than this many seconds left.
_REFRESH_BUFFER_SECONDS = 300

# In-process cache of O365 Account objects. Rebuild them for free from the
# access token, but skip the DB + MSAL round-trips when we already have a
# live one for this user.
_ACCOUNT_CACHE: dict[str, tuple[float, "Account"]] = {}


class TokenManager:
    """Manages Microsoft OAuth tokens via MSAL."""

    def __init__(self) -> None:
        self._msal_app: msal.ConfidentialClientApplication | None = None

    def _get_msal_app(self) -> msal.ConfidentialClientApplication:
        if self._msal_app is None:
            self._msal_app = msal.ConfidentialClientApplication(
                settings.microsoft_client_id,
                authority=(f"https://login.microsoftonline.com/{settings.microsoft_tenant_id}"),
                client_credential=settings.microsoft_client_secret,
            )
        return self._msal_app

    def get_auth_url(self, state: str) -> str:
        """Generate the Microsoft OAuth authorization URL."""
        return self._get_msal_app().get_authorization_request_url(
            scopes=MICROSOFT_SCOPES,
            state=state,
            redirect_uri=settings.microsoft_redirect_uri,
            response_mode="query",
        )

    async def exchange_code_and_store(self, user_id: str, code: str) -> None:
        """Exchange authorization code for tokens and store them encrypted."""
        result = self._get_msal_app().acquire_token_by_authorization_code(
            code,
            scopes=MICROSOFT_SCOPES,
            redirect_uri=settings.microsoft_redirect_uri,
        )
        if "error" in result:
            msg = result.get("error_description", result["error"])
            raise ValueError(f"Token exchange failed: {msg}")

        expires_at = time.time() + result.get("expires_in", 3600)
        expiry_dt = datetime.fromtimestamp(expires_at, tz=timezone.utc)

        scope_val = result.get("scope", "")
        scopes = scope_val.split() if isinstance(scope_val, str) else MICROSOFT_SCOPES

        await integ_repo.upsert(
            user_id=user_id,
            provider="microsoft",
            encrypted_access_token=encrypt_token(result["access_token"]),
            encrypted_refresh_token=encrypt_token(result.get("refresh_token", "")),
            token_expiry=expiry_dt.isoformat(),
            scopes=scopes,
        )

        # Invalidate cached Account so the next call picks up the new token.
        _ACCOUNT_CACHE.pop(user_id, None)

    def _build_account(self, access_token: str) -> "Account":
        """Construct an O365 Account pre-authed with the given access token."""
        from O365 import Account as O365Account

        credentials = (settings.microsoft_client_id, settings.microsoft_client_secret)
        account = O365Account(
            credentials,
            tenant_id=settings.microsoft_tenant_id,
        )
        session = account.con.get_session(load_token=False)
        session.headers.update({"Authorization": f"Bearer {access_token}"})
        account.con.session = session
        return account

    async def get_account(self, user_id: str) -> Account:
        """Return an authenticated O365 Account for the user.

        Fast path: if we have a cached Account whose token is still fresh,
        hand it back. Medium path: decrypt the stored access token if the DB
        expiry is beyond the refresh buffer. Slow path: use MSAL to refresh.
        """
        now = time.time()

        # Fast path — in-process cache, valid for a few minutes.
        cached = _ACCOUNT_CACHE.get(user_id)
        if cached and cached[0] > now:
            return cached[1]

        row = await integ_repo.get(user_id, "microsoft")
        if not row:
            raise ValueError("Microsoft account not connected")

        token_expiry_raw = row.get("token_expiry")
        if isinstance(token_expiry_raw, str):
            expiry_dt = datetime.fromisoformat(token_expiry_raw)
        elif isinstance(token_expiry_raw, datetime):
            expiry_dt = token_expiry_raw
        else:
            expiry_dt = datetime.fromtimestamp(0, tz=timezone.utc)

        seconds_left = expiry_dt.timestamp() - now

        # Medium path — stored token still has comfortable life.
        if seconds_left > _REFRESH_BUFFER_SECONDS:
            access_token = decrypt_token(row["encrypted_access_token"])
            if access_token:
                account = self._build_account(access_token)
                # Cache until refresh buffer would kick in.
                cache_until = now + max(30, seconds_left - _REFRESH_BUFFER_SECONDS)
                _ACCOUNT_CACHE[user_id] = (cache_until, account)
                return account

        # Slow path — refresh via MSAL.
        refresh_token = decrypt_token(row["encrypted_refresh_token"])
        if not refresh_token:
            raise ValueError("No refresh token available — please reconnect Microsoft")

        stored_scopes = row.get("scopes", MICROSOFT_SCOPES)
        scopes = [s for s in stored_scopes if s.lower() not in _RESERVED_SCOPES]

        result = self._get_msal_app().acquire_token_by_refresh_token(
            refresh_token, scopes=scopes
        )
        if "error" in result:
            msg = result.get("error_description", result["error"])
            raise ValueError(f"Token refresh failed: {msg}")

        access_token = result["access_token"]
        new_refresh = result.get("refresh_token", refresh_token)
        new_exp = now + result.get("expires_in", 3600)
        expiry = datetime.fromtimestamp(new_exp, tz=timezone.utc)

        await integ_repo.update_tokens(
            user_id=user_id,
            provider="microsoft",
            encrypted_access_token=encrypt_token(access_token),
            encrypted_refresh_token=encrypt_token(new_refresh),
            token_expiry=expiry.isoformat(),
        )

        account = self._build_account(access_token)
        cache_until = now + max(30, (new_exp - now) - _REFRESH_BUFFER_SECONDS)
        _ACCOUNT_CACHE[user_id] = (cache_until, account)
        return account

    async def revoke_tokens(self, user_id: str) -> None:
        """Delete Microsoft tokens from database."""
        _ACCOUNT_CACHE.pop(user_id, None)
        await integ_repo.delete(user_id, "microsoft")

    async def is_connected(self, user_id: str) -> bool:
        """Check if user has a Microsoft integration."""
        return await integ_repo.exists(user_id, "microsoft")


token_manager = TokenManager()
