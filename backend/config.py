from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

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

    # Encryption
    encryption_key: str = ""

    # Frontend
    frontend_url: str = "http://localhost:3000"

    # Twilio (SMS)
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""
    # Validate Twilio's webhook signature on inbound. Set false locally if
    # using a tunneling tool that strips/modifies headers.
    twilio_webhook_validate: bool = True


settings = Settings()
