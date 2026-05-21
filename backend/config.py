from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        # Ignore unknown env vars rather than crashing — lets local .env
        # keep leftovers from removed features without blocking boot.
        extra="ignore",
    )

    # Deployment environment ("development" or "production"). Production
    # boots fail-fast if required values are missing or still point at
    # localhost — see _validate_production_required below.
    environment: str = "development"

    # Anthropic
    anthropic_api_key: str = ""

    # Database (Neon)
    database_url: str = ""

    # Better Auth
    better_auth_secret: str = ""
    better_auth_url: str = "http://localhost:3000"

    # Upstash Redis
    upstash_redis_url: str = ""
    upstash_redis_token: str = ""

    # Microsoft (Azure AD)
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_tenant_id: str = "common"
    microsoft_redirect_uri: str = "http://localhost:8000/api/auth/microsoft/callback"

    # Google (Cloud OAuth 2.0)
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:8000/api/auth/google/callback"

    # Encryption. ENCRYPTION_KEY is the single-key path used by every install;
    # during a rotation, set ENCRYPTION_KEYS to a comma-separated list with
    # the NEW primary key first, then the previous key(s). encrypt uses the
    # first key; decrypt tries each in order. Run scripts/rotate_fernet_key.py
    # to re-encrypt every integrations row onto the new primary, then drop
    # the old key from the env. See docs/oauth.md for the full procedure.
    encryption_key: str = ""
    encryption_keys: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Per-user daily spend cap (USD). Checked at /api/chat entry; set to
    # 0 to disable. Default is intentionally low for a portfolio project.
    daily_spend_cap_usd: float = 1.0

    # Sentry (optional). If set, initialized in main.py lifespan.
    sentry_dsn: str = ""

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def fernet_key_list(self) -> list[str]:
        """Ordered list of Fernet keys. First is the primary (used for
        encryption); all are tried for decryption. ENCRYPTION_KEYS (csv)
        wins over ENCRYPTION_KEY when set, so a rotation can specify
        both new and old without overwriting the single-key field.
        """
        if self.encryption_keys:
            return [k.strip() for k in self.encryption_keys.split(",") if k.strip()]
        if self.encryption_key:
            return [self.encryption_key]
        return []

    @model_validator(mode="after")
    def _validate_production_required(self) -> "Settings":
        """Fail boot in production if required settings are missing or still
        point at localhost. Catches the classic "deployed with dev defaults"
        class of bug at startup rather than at first request.
        """
        if not self.is_production:
            return self

        missing: list[str] = []
        if not self.database_url or "localhost" in self.database_url:
            missing.append(
                "DATABASE_URL (e.g. postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require)"
            )
        if not self.frontend_url or "localhost" in self.frontend_url:
            missing.append("FRONTEND_URL (e.g. https://orbit.vercel.app)")
        if not self.upstash_redis_url or not self.upstash_redis_token:
            missing.append(
                "UPSTASH_REDIS_URL + UPSTASH_REDIS_TOKEN (e.g. https://xxxxx.upstash.io / AX...)"
            )
        if not self.fernet_key_list:
            missing.append(
                'ENCRYPTION_KEY (generate: python -c "from cryptography.fernet '
                'import Fernet; print(Fernet.generate_key().decode())"). '
                "Or ENCRYPTION_KEYS=<csv> for multi-key rotation."
            )
        if not self.better_auth_secret:
            missing.append("BETTER_AUTH_SECRET (generate: openssl rand -base64 32)")
        if not self.anthropic_api_key:
            missing.append("ANTHROPIC_API_KEY (sk-ant-...)")
        if "localhost" in self.microsoft_redirect_uri:
            missing.append(
                f"MICROSOFT_REDIRECT_URI (currently {self.microsoft_redirect_uri!r}; "
                "expected e.g. https://your-backend.up.railway.app/api/auth/microsoft/callback)"
            )
        if "localhost" in self.google_redirect_uri:
            missing.append(
                f"GOOGLE_REDIRECT_URI (currently {self.google_redirect_uri!r}; "
                "expected e.g. https://your-backend.up.railway.app/api/auth/google/callback)"
            )

        if missing:
            raise ValueError("Production environment requires:\n  - " + "\n  - ".join(missing))
        return self


settings = Settings()
