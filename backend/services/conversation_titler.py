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


async def generate_conversation_title(
    conversation_id: str,
    user_message: str,
    assistant_response: str,
) -> str:
    """Auto-generate a title for a conversation after the first exchange."""
    prompt = f"User: {user_message[:200]}\nAssistant: {assistant_response[:200]}"

    response = await _titler.arun(prompt)
    title = (response.content or "New conversation").strip().strip('"')

    await conv_repo.update_title(conversation_id, title)

    return title
