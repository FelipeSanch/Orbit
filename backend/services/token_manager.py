from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import TYPE_CHECKING

import msal

from config import settings
from services.encryption import decrypt_token, encrypt_token
from services.supabase import get_supabase_client

if TYPE_CHECKING:
    from O365 import Account

MICROSOFT_SCOPES = [
    "Mail.ReadWrite",
    "Mail.Send",
    "Calendars.ReadWrite",
    "Tasks.ReadWrite",
    "User.Read",
    "offline_access",
]


class TokenManager:
    """Manages Microsoft OAuth tokens via MSAL."""

    def __init__(self) -> None:
        self._client = None
        self._msal_app: msal.ConfidentialClientApplication | None = None

    def _get_client(self):
        if self._client is None:
            self._client = get_supabase_client()
        return self._client

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

        data = {
            "user_id": user_id,
            "provider": "microsoft",
            "encrypted_access_token": encrypt_token(result["access_token"]),
            "encrypted_refresh_token": encrypt_token(result.get("refresh_token", "")),
            "token_expiry": expiry_dt.isoformat(),
            "scopes": scopes,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }

        self._get_client().table("integrations").upsert(
            data, on_conflict="user_id,provider"
        ).execute()

    async def get_account(self, user_id: str) -> Account:
        """Get an authenticated O365 Account, refreshing the token if needed."""
        from O365 import Account as O365Account
        from O365.utils import BaseTokenBackend

        row = (
            self._get_client()
            .table("integrations")
            .select("*")
            .eq("user_id", user_id)
            .eq("provider", "microsoft")
            .single()
            .execute()
        ).data

        if not row:
            raise ValueError("Microsoft account not connected")

        access_token = decrypt_token(row["encrypted_access_token"])
        refresh_token = decrypt_token(row["encrypted_refresh_token"])
        expiry = datetime.fromisoformat(row["token_expiry"])
        scopes = row.get("scopes", MICROSOFT_SCOPES)

        # Refresh if token expires within 5 minutes
        if expiry.timestamp() - time.time() < 300 and refresh_token:
            result = self._get_msal_app().acquire_token_by_refresh_token(
                refresh_token, scopes=scopes
            )
            if "error" not in result:
                access_token = result["access_token"]
                refresh_token = result.get("refresh_token", refresh_token)
                new_exp = time.time() + result.get("expires_in", 3600)
                expiry = datetime.fromtimestamp(new_exp, tz=timezone.utc)

                self._get_client().table("integrations").update(
                    {
                        "encrypted_access_token": encrypt_token(access_token),
                        "encrypted_refresh_token": encrypt_token(refresh_token),
                        "token_expiry": expiry.isoformat(),
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }
                ).eq("user_id", user_id).eq("provider", "microsoft").execute()

        # Build O365-compatible token dict
        token = {
            "token_type": "Bearer",
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": expiry.timestamp(),
        }

        class _StaticTokenBackend(BaseTokenBackend):
            """Token backend holding a pre-loaded token."""

            def __init__(self, token_data: dict) -> None:
                super().__init__()
                self.token = token_data

            def load_token(self) -> bool:
                return bool(self.token)

            def save_token(self) -> bool:
                return True  # We manage refresh ourselves

            def check_token(self) -> bool:
                return bool(self.token and self.token.get("access_token"))

            def delete_token(self) -> bool:
                self.token = {}
                return True

        backend = _StaticTokenBackend(token)
        credentials = (settings.microsoft_client_id, settings.microsoft_client_secret)

        return O365Account(
            credentials,
            token_backend=backend,
            tenant_id=settings.microsoft_tenant_id,
        )

    async def revoke_tokens(self, user_id: str) -> None:
        """Delete Microsoft tokens from database."""
        self._get_client().table("integrations").delete().eq("user_id", user_id).eq(
            "provider", "microsoft"
        ).execute()

    async def is_connected(self, user_id: str) -> bool:
        """Check if user has a Microsoft integration."""
        result = (
            self._get_client()
            .table("integrations")
            .select("id")
            .eq("user_id", user_id)
            .eq("provider", "microsoft")
            .maybe_single()
            .execute()
        )
        return result.data is not None


token_manager = TokenManager()
