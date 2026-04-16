from agno.agent import Agent
from agno.models.anthropic import Claude


def create_email_agent(tools: list) -> Agent:
    """Create the email specialist agent."""
    return Agent(
        name="Email Agent",
        model=Claude(id="claude-sonnet-4-5-20250929"),
        tools=tools,
        instructions=[
            "You are an email specialist for the Orbit assistant.",
            "You handle all Outlook Mail operations: reading, searching, "
            "sending, replying, and organizing.",
            "When listing emails, include subject, sender, date, and a snippet for each.",
            "For send/reply operations, summarize what you will send before executing.",
            "Format dates in a human-readable way.",
            "Return structured, scannable responses with bullet points for email lists.",
            "If a search returns no results, suggest alternative search queries.",
        ],
        show_tool_calls=True,
        markdown=True,
    )
