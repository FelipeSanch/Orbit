from agno.agent import Agent
from agno.models.anthropic import Claude


def create_calendar_agent(tools: list) -> Agent:
    """Create the calendar specialist agent."""
    return Agent(
        name="Calendar Agent",
        model=Claude(id="claude-sonnet-4-5-20250929"),
        tools=tools,
        instructions=[
            "You are a calendar specialist for the Orbit assistant.",
            "You handle all Outlook Calendar operations: viewing, creating, updating, "
            "and deleting events.",
            "When listing events, show time, title, location, and attendees clearly.",
            "Parse natural language time references (e.g. 'tomorrow at 3pm', 'next Tuesday').",
            "When creating events, default to 1-hour duration if no end time is specified.",
            "Warn about scheduling conflicts if you notice overlapping events.",
            "Format times in 12-hour format with timezone context.",
        ],
        show_tool_calls=True,
        markdown=True,
    )
