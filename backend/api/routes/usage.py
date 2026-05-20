from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from api.deps import get_current_user
from config import settings
from repositories import messages as msg_repo
from services.pricing import usd_cost

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("/today")
async def usage_today(user: dict = Depends(get_current_user)) -> dict:
    """Return token usage, estimated cost, and daily cap for the current UTC day."""
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    stats = await msg_repo.usage_since(user["id"], start_of_day.isoformat())
    return {
        **stats,
        "estimated_cost_usd": round(usd_cost(stats["input_tokens"], stats["output_tokens"]), 4),
        "daily_cap_usd": float(settings.daily_spend_cap_usd or 0.0),
    }
