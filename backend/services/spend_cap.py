"""Daily per-user spend cap.

A safety net, not a billing system. The check runs at request entry by
summing `messages.metadata.metrics` since midnight UTC and rejecting
when the user is already at or over the cap.

This is intentionally **post-hoc with respect to the current request**:
a request submitted while the user is one cent under the cap will still
complete, even if that run pushes them several cents over. At a $1/day
default that's an acceptable overshoot for the simplicity of a single
DB read per request. If finer granularity is ever needed, the right
move is a Redis-backed running counter — not a tighter pre-check.

Returns the current spend and the cap so callers can build informative
429 messages without re-querying.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from config import settings
from repositories import messages as msg_repo
from services.pricing import usd_cost


@dataclass(frozen=True)
class SpendCheck:
    allowed: bool
    current_usd: float
    cap_usd: float


async def check_daily_spend(user_id: str) -> SpendCheck:
    """Return whether `user_id` is under their daily cap.

    Reads cap from `settings.daily_spend_cap_usd`. A cap of 0 disables the
    check (intended for tests / explicit opt-out only).
    """
    cap = float(settings.daily_spend_cap_usd or 0.0)
    if cap <= 0:
        return SpendCheck(allowed=True, current_usd=0.0, cap_usd=cap)

    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    stats = await msg_repo.usage_since(user_id, start_of_day.isoformat())
    current = round(usd_cost(stats["input_tokens"], stats["output_tokens"]), 4)
    return SpendCheck(allowed=current < cap, current_usd=current, cap_usd=cap)
