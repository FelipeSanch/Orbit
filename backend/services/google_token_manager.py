from __future__ import annotations

import os

# Google expands `openid` into additional scopes in its token response, so
# the exact scope set we requested rarely matches what's returned. This
# env var tells oauthlib not to raise on that mismatch. MUST be set before
# importing google_auth_oauthlib / oauthlib.
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")
os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")  # localhost dev only

import logging  # noqa: E402
import time  # noqa: E402
from datetime import datetime, timezone  # noqa: E402
from typing import TYPE_CHECKING  # noqa: E402

from google.auth.transport.requests import Request as GoogleRequest  # noqa: E402
from google.oauth2.credentials import Credentials  # noqa: E402
from google_auth_oauthlib.flow import Flow  # noqa: E402

from config import settings  # noqa: E402
from repositories import integrations as integ_repo  # noqa: E402
from services.encryption import decrypt_token, encrypt_token  # noqa: E402

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    pass

GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]
_TOKEN_URI = "https://oauth2.googleapis.com/token"
_AUTH_URI = "https://accounts.google.com/o/oauth2/auth"

_REFRESH_BUFFER_SECONDS = 300

_CREDENTIALS_CACHE: dict[str, tuple[float, Credentials]] = {}


def _client_config() -> dict:
    return {
        "web": {
            "client_id": settings.google_client_id,
            "client_secret": settings.google_client_secret,
            "auth_uri": _AUTH_URI,
            "token_uri": _TOKEN_URI,
            "redirect_uris": [settings.google_redirect_uri],
        }
    }


class GoogleTokenManager:
    """Manages Google OAuth tokens for Google Calendar access."""

    def get_auth_url(self, state: str) -> tuple[str, str]:
        """Generate the Google OAuth URL. Returns (url, pkce_code_verifier).

        The verifier must be persisted until the callback so we can pass it
        back to fetch_token() — otherwise Google rejects with invalid_grant.
        """
        flow = Flow.from_client_config(
            _client_config(),
            scopes=GOOGLE_SCOPES,
            redirect_uri=settings.google_redirect_uri,
            autogenerate_code_verifier=True,
        )
        auth_url, _ = flow.authorization_url(
            access_type="offline",
            include_granted_scopes="true",
            prompt="consent",
            state=state,
        )
        return auth_url, flow.code_verifier

    async def exchange_code_and_store(
        self, user_id: str, code: str, code_verifier: str | None = None
    ) -> None:
        """Exchange authorization code for tokens and store encrypted.

        `code_verifier` must match the one produced in `get_auth_url()` —
        stash it server-side between the two requests.
        """
        try:
            flow = Flow.from_client_config(
                _client_config(),
                scopes=GOOGLE_SCOPES,
                redirect_uri=settings.google_redirect_uri,
            )
            if code_verifier:
                flow.code_verifier = code_verifier
            flow.fetch_token(code=code)
        except Exception as e:
            logger.exception(
                "Google token exchange failed for user %s: %s", user_id, e
            )
            raise ValueError(f"Google OAuth failed: {e}") from e

        creds = flow.credentials
        logger.info(
            "Google token exchange OK for %s — scopes=%s has_refresh=%s",
            user_id,
            list(creds.scopes or []),
            bool(creds.refresh_token),
        )

        if not creds.refresh_token:
            raise ValueError(
                "Google returned no refresh token. Visit "
                "https://myaccount.google.com/permissions, revoke Orbit's "
                "access, and reconnect — that forces a fresh consent."
            )

        expiry_dt = creds.expiry or datetime.now(timezone.utc)
        if expiry_dt.tzinfo is None:
            expiry_dt = expiry_dt.replace(tzinfo=timezone.utc)

        await integ_repo.upsert(
            user_id=user_id,
            provider="google",
            encrypted_access_token=encrypt_token(creds.token),
            encrypted_refresh_token=encrypt_token(creds.refresh_token),
            token_expiry=expiry_dt.isoformat(),
            scopes=list(creds.scopes or GOOGLE_SCOPES),
        )
        _CREDENTIALS_CACHE.pop(user_id, None)
        logger.info("Google tokens stored for user %s", user_id)

    async def get_credentials(self, user_id: str) -> Credentials:
        """Return valid Google Credentials, refreshing only when needed."""
        now = time.time()

        cached = _CREDENTIALS_CACHE.get(user_id)
        if cached and cached[0] > now:
            return cached[1]

        row = await integ_repo.get(user_id, "google")
        if not row:
            raise ValueError("Google account not connected")

        access_token = decrypt_token(row["encrypted_access_token"])
        refresh_token = decrypt_token(row["encrypted_refresh_token"])
        scopes = row.get("scopes", GOOGLE_SCOPES)

        expiry_raw = row.get("token_expiry")
        if isinstance(expiry_raw, str):
            expiry_dt = datetime.fromisoformat(expiry_raw)
        elif isinstance(expiry_raw, datetime):
            expiry_dt = expiry_raw
        else:
            expiry_dt = datetime.fromtimestamp(0, tz=timezone.utc)

        # Google's library compares naive datetimes in UTC. Strip the tz.
        if expiry_dt.tzinfo is not None:
            expiry_dt = expiry_dt.astimezone(timezone.utc).replace(tzinfo=None)

        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri=_TOKEN_URI,
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            scopes=scopes,
            expiry=expiry_dt,
        )

        seconds_left = (
            expiry_dt.replace(tzinfo=timezone.utc).timestamp() - now
        )

        if seconds_left < _REFRESH_BUFFER_SECONDS:
            creds.refresh(GoogleRequest())
            new_expiry = creds.expiry or datetime.utcnow()
            if new_expiry.tzinfo is None:
                new_expiry = new_expiry.replace(tzinfo=timezone.utc)
            await integ_repo.update_tokens(
                user_id=user_id,
                provider="google",
                encrypted_access_token=encrypt_token(creds.token),
                encrypted_refresh_token=encrypt_token(creds.refresh_token or refresh_token),
                token_expiry=new_expiry.isoformat(),
            )
            seconds_left = new_expiry.timestamp() - now

        cache_until = now + max(30, seconds_left - _REFRESH_BUFFER_SECONDS)
        _CREDENTIALS_CACHE[user_id] = (cache_until, creds)
        return creds

    async def revoke_tokens(self, user_id: str) -> None:
        """Delete Google tokens from database."""
        _CREDENTIALS_CACHE.pop(user_id, None)
        await integ_repo.delete(user_id, "google")

    async def is_connected(self, user_id: str) -> bool:
        return await integ_repo.exists(user_id, "google")


google_token_manager = GoogleTokenManager()
