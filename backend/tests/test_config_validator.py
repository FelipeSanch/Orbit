"""Unit tests for the production-mode config validator.

The validator is load-bearing for prod safety — if it ever silently
passes with localhost defaults, a deploy could ship with the wrong
OAuth redirect URI and the failure mode is "OAuth callbacks 404 with
no useful signal." These tests codify the smoke check that prod
misconfiguration is loud at boot.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from config import Settings


def _valid_prod_kwargs(**overrides) -> dict:
    """Baseline of valid production settings. Override individual fields
    in tests to assert the validator catches the violation."""
    base = {
        "environment": "production",
        "anthropic_api_key": "sk-ant-test",
        "database_url": "postgresql://u:p@ep-x.neon.tech/db?sslmode=require",
        "better_auth_secret": "x" * 32,
        "better_auth_url": "https://orbit.example.com",
        "encryption_key": "x" * 44,
        "upstash_redis_url": "https://redis.example.upstash.io",
        "upstash_redis_token": "AX-test",
        "microsoft_redirect_uri": (
            "https://backend.example.com/api/auth/microsoft/callback"
        ),
        "google_redirect_uri": (
            "https://backend.example.com/api/auth/google/callback"
        ),
        "frontend_url": "https://orbit.example.com",
    }
    base.update(overrides)
    return base


def test_validator_passes_with_valid_prod_config():
    """Sanity: production with real values boots cleanly."""
    settings = Settings(**_valid_prod_kwargs())
    assert settings.is_production is True
    assert settings.environment == "production"


def test_validator_blocks_localhost_in_microsoft_redirect():
    """The classic 'deployed with dev defaults' bug."""
    with pytest.raises(ValidationError) as exc:
        Settings(
            **_valid_prod_kwargs(
                microsoft_redirect_uri="http://localhost:8000/api/auth/microsoft/callback"
            )
        )
    msg = str(exc.value)
    assert "MICROSOFT_REDIRECT_URI" in msg
    # Error must show the offending current value so the operator knows
    # exactly what to fix, not just that something's broken.
    assert "localhost" in msg


def test_validator_blocks_localhost_in_google_redirect():
    with pytest.raises(ValidationError) as exc:
        Settings(
            **_valid_prod_kwargs(
                google_redirect_uri="http://localhost:8000/api/auth/google/callback"
            )
        )
    assert "GOOGLE_REDIRECT_URI" in str(exc.value)


def test_validator_blocks_missing_redis():
    """In-memory OAuth state fallback is dev-only — production must have
    real Redis or pod restarts drop in-flight OAuth dances on the floor."""
    with pytest.raises(ValidationError) as exc:
        Settings(**_valid_prod_kwargs(upstash_redis_url="", upstash_redis_token=""))
    assert "UPSTASH_REDIS_URL" in str(exc.value)


def test_validator_blocks_localhost_in_frontend_url():
    with pytest.raises(ValidationError) as exc:
        Settings(**_valid_prod_kwargs(frontend_url="http://localhost:3000"))
    assert "FRONTEND_URL" in str(exc.value)


def test_validator_blocks_missing_encryption_key():
    with pytest.raises(ValidationError) as exc:
        Settings(**_valid_prod_kwargs(encryption_key=""))
    assert "ENCRYPTION_KEY" in str(exc.value)


def test_validator_blocks_missing_better_auth_secret():
    with pytest.raises(ValidationError) as exc:
        Settings(**_valid_prod_kwargs(better_auth_secret=""))
    assert "BETTER_AUTH_SECRET" in str(exc.value)


def test_validator_blocks_missing_anthropic_key():
    with pytest.raises(ValidationError) as exc:
        Settings(**_valid_prod_kwargs(anthropic_api_key=""))
    assert "ANTHROPIC_API_KEY" in str(exc.value)


def test_validator_collects_all_missing_at_once():
    """Multiple problems should be reported together so the operator
    fixes everything in one pass, not whack-a-mole across boots."""
    with pytest.raises(ValidationError) as exc:
        Settings(
            **_valid_prod_kwargs(
                frontend_url="http://localhost:3000",
                upstash_redis_url="",
                upstash_redis_token="",
                microsoft_redirect_uri="http://localhost:8000/cb",
            )
        )
    msg = str(exc.value)
    assert "FRONTEND_URL" in msg
    assert "UPSTASH_REDIS_URL" in msg
    assert "MICROSOFT_REDIRECT_URI" in msg


def test_validator_dormant_in_development():
    """Development mode skips the validator entirely so dev loops aren't
    blocked by the absence of prod-only settings."""
    settings = Settings(environment="development", anthropic_api_key="")
    assert settings.is_production is False
