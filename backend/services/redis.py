from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from typing import TYPE_CHECKING

from config import settings

if TYPE_CHECKING:
    from upstash_ratelimit.limiter import Response as RatelimitResponse


def _redis_configured() -> bool:
    return bool(settings.upstash_redis_url and settings.upstash_redis_token)


@lru_cache(maxsize=1)
def get_redis_client():
    """Upstash Redis HTTP client (singleton). Returns None if not configured."""
    if not _redis_configured():
        return None
    from upstash_redis import Redis

    return Redis(url=settings.upstash_redis_url, token=settings.upstash_redis_token)


_ratelimiter = None


def get_ratelimiter():
    """Rate limiter: 30 requests per 60-second window."""
    global _ratelimiter
    if _ratelimiter is None:
        from upstash_ratelimit import FixedWindow

        _ratelimiter = FixedWindow(max_requests=30, window=60)
    return _ratelimiter


@dataclass
class _AllowedResponse:
    """Stub response when Redis is not configured — always allows requests."""

    allowed: bool = True
    limit: int = 0
    remaining: int = 0
    reset: int = 0


def check_rate_limit(user_id: str) -> RatelimitResponse | _AllowedResponse:
    """Check if a user is within their rate limit. Bypasses when Redis is not configured."""
    if not _redis_configured():
        return _AllowedResponse()
    return get_ratelimiter().limit(redis=get_redis_client(), identifier=user_id)


# ---------- In-memory OAuth state store (fallback when Redis is not configured) ----------

_oauth_states: dict[str, str] = {}


def set_oauth_state(state: str, user_id: str, ex: int = 600) -> None:
    """Store OAuth state → user_id mapping. Uses Redis when available, else in-memory."""
    client = get_redis_client()
    if client is not None:
        client.set(f"oauth_state:{state}", user_id, ex=ex)
    else:
        _oauth_states[state] = user_id


def get_oauth_state(state: str) -> str | None:
    """Retrieve user_id for an OAuth state token."""
    client = get_redis_client()
    if client is not None:
        val = client.get(f"oauth_state:{state}")
        return str(val) if val else None
    return _oauth_states.get(state)


def delete_oauth_state(state: str) -> None:
    """Remove an OAuth state token."""
    client = get_redis_client()
    if client is not None:
        client.delete(f"oauth_state:{state}")
    else:
        _oauth_states.pop(state, None)


# ---------- PKCE code_verifier store (Google OAuth needs this across requests) ----------

_oauth_pkce: dict[str, str] = {}


def set_oauth_pkce(state: str, verifier: str, ex: int = 600) -> None:
    client = get_redis_client()
    if client is not None:
        client.set(f"oauth_pkce:{state}", verifier, ex=ex)
    else:
        _oauth_pkce[state] = verifier


def get_oauth_pkce(state: str) -> str | None:
    client = get_redis_client()
    if client is not None:
        val = client.get(f"oauth_pkce:{state}")
        return str(val) if val else None
    return _oauth_pkce.get(state)


def delete_oauth_pkce(state: str) -> None:
    client = get_redis_client()
    if client is not None:
        client.delete(f"oauth_pkce:{state}")
    else:
        _oauth_pkce.pop(state, None)


# ---------- Telegram pairing codes ----------
# Same fallback pattern as oauth_state: Upstash when configured, in-memory
# dict otherwise. Codes are single-use — callers consume via
# pop_pairing_code, not get + delete.

_telegram_pair: dict[str, str] = {}


def set_pairing_code(channel: str, code: str, user_id: str, ex: int = 600) -> None:
    client = get_redis_client()
    if client is not None:
        client.set(f"{channel}:pair:{code}", user_id, ex=ex)
    else:
        _telegram_pair[code] = user_id


def pop_pairing_code(channel: str, code: str) -> str | None:
    """Atomically consume a pairing code: return the bound user_id and
    delete the entry, or return None if missing.

    Single-use semantics: two concurrent callers see at most one success.
    """
    client = get_redis_client()
    if client is not None:
        key = f"{channel}:pair:{code}"
        val = client.get(key)
        if val is None:
            return None
        client.delete(key)
        return str(val)
    return _telegram_pair.pop(code, None)
