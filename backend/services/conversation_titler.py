import json
import re

from agno.agent import Agent
from agno.models.anthropic import Claude

from repositories import conversations as conv_repo

_titler = Agent(
    name="Titler",
    model=Claude(id="claude-haiku-4-5-20251001"),
    instructions=[
        "Generate a concise 3-5 word title for a conversation.",
        "Capture the topic naturally — like a chat label, not a headline.",
        "Return ONLY the title. No quotes, no punctuation at the end, "
        "no 'Re:' or 'about'.",
    ],
    markdown=False,
)


_ERROR_PREFIX_RE = re.compile(
    r"^(error\b|exception\b|traceback\b|httperror\b|\{'type': 'error'|error code:)",
    re.IGNORECASE,
)


def _looks_like_error_only(text: str) -> bool:
    """Return True if `text` is an error stringification rather than a real
    assistant response. Auto-titling these produces noisy sidebar entries
    like 'Error code 429 Type' — drop them and leave the title NULL.
    """
    stripped = (text or "").strip()
    if not stripped:
        return True
    if _ERROR_PREFIX_RE.match(stripped):
        return True
    # Common JSON error envelope shapes — both our own and Anthropic's.
    try:
        payload = json.loads(stripped)
        if isinstance(payload, dict) and (
            payload.get("type") == "error"
            or "error" in payload
            and "code" in payload
        ):
            return True
    except (json.JSONDecodeError, TypeError):
        pass
    return False


async def generate_conversation_title(
    conversation_id: str,
    user_message: str,
    assistant_response: str,
) -> str | None:
    """Auto-generate a title for a conversation after the first exchange.

    Returns the new title, or None if the run produced only an error and
    we deliberately skipped titling.
    """
    if _looks_like_error_only(assistant_response):
        return None

    prompt = f"User: {user_message[:200]}\nAssistant: {assistant_response[:200]}"

    response = await _titler.arun(prompt)
    title = (response.content or "New conversation").strip().strip('"')

    await conv_repo.update_title(conversation_id, title)

    return title
