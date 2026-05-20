"""Single source of truth for LLM pricing.

Orbit runs exclusively on Claude Sonnet 4.6 today, so the constants here
are the Anthropic published rate. The usage endpoint and the daily-spend
cap both call `usd_cost()` so the two stay in lockstep — a price change
is a one-line edit.
"""

# Anthropic Sonnet 4.6 (per 1M tokens, USD).
INPUT_COST_PER_MTOK = 3.0
OUTPUT_COST_PER_MTOK = 15.0


def usd_cost(input_tokens: int, output_tokens: int) -> float:
    """Estimated USD cost for a token bundle. Cheap; safe to call per-request."""
    return (
        input_tokens * INPUT_COST_PER_MTOK / 1_000_000
        + output_tokens * OUTPUT_COST_PER_MTOK / 1_000_000
    )
