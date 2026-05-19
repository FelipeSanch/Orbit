from datetime import datetime, timezone

from fastapi import APIRouter, Depends

from api.deps import get_current_user
from repositories import messages as msg_repo

router = APIRouter(prefix="/api/usage", tags=["usage"])


# Pricing (Claude Sonnet 4.6 via Anthropic, per 1M tokens, USD)
_INPUT_COST_PER_MTOK = 3.0
_OUTPUT_COST_PER_MTOK = 15.0


def _estimate_cost(input_tokens: int, output_tokens: int) -> float:
    return (
        input_tokens * _INPUT_COST_PER_MTOK / 1_000_000
        + output_tokens * _OUTPUT_COST_PER_MTOK / 1_000_000
    )


@router.get("/today")
async def usage_today(user: dict = Depends(get_current_user)) -> dict:
    """Return token usage and estimated cost for the current UTC day."""
    now = datetime.now(timezone.utc)
    start_of_day = now.replace(hour=0, minute=0, second=0, microsecond=0)
    stats = await msg_repo.usage_since(user["id"], start_of_day.isoformat())
    return {
        **stats,
        "estimated_cost_usd": round(
            _estimate_cost(stats["input_tokens"], stats["output_tokens"]), 4
        ),
    }
