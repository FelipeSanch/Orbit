from agno.agent import Agent
from agno.models.anthropic import Claude

from services.supabase import get_supabase_client

_titler = Agent(
    name="Titler",
    model=Claude(id="claude-sonnet-4-5-20250929"),
    instructions=[
        "Generate a concise 4-6 word title for a conversation.",
        "Based on the user message and assistant response, capture the topic.",
        "Return ONLY the title, no quotes, no explanation.",
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

    get_supabase_client().table("conversations").update({"title": title}).eq(
        "id", conversation_id
    ).execute()

    return title
