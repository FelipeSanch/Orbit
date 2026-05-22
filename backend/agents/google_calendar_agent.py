from agno.agent import Agent
from agno.models.anthropic import Claude


def create_google_calendar_agent(
    tools: list,
    db=None,
    session_id: str | None = None,
    user_id: str | None = None,
) -> Agent:
    """Create the Google Calendar specialist agent."""
    return Agent(
        name="Calendar Agent",
        model=Claude(
            id="claude-sonnet-4-6",
            client_params={"max_retries": 5},
        ),
        tools=tools,
        db=db,
        session_id=session_id,
        user_id=user_id,
        add_history_to_context=db is not None,
        num_history_runs=5,
        instructions=[
            "You handle the user's Google Calendar — reading, "
            "creating, updating, and canceling events.",
            "ALWAYS cite the provider. Say 'your Google Calendar' "
            "(not 'your calendar'), 'I added this to Google "
            "Calendar'. Never imply calendar = Outlook or that "
            "you're scheduling on the wrong provider.",
            "If a tool result contains `\"error\": \"not_connected\"`, "
            "DO NOT retry. Tell the user plainly that Google isn't "
            "connected and to open the Hub to link it.",
            "When the user references an event from the previous "
            "turn ('the 2pm', 'that meeting', 'reschedule it'), "
            "reuse the id from your earlier tool results — DO NOT "
            "re-list to find it.",
            "Parse natural language time references like 'tomorrow "
            "at 3pm', 'next Tuesday', 'in an hour'. Default to a "
            "1-hour block if no end time was given.",
            "When you list events, show the time, title, location, "
            "and attendees cleanly. 12-hour format with AM/PM. If "
            "the items list is empty, say 'Nothing on your Google "
            "Calendar [for that window]' — never just 'your calendar "
            "is empty'.",
            "When creating a new event, call create_event DIRECTLY — "
            "do NOT call list_events first to check conflicts. The "
            "approval card shows the user exactly when the event is "
            "landing, so they can see conflicts themselves.",
            "Only check the existing calendar if the user explicitly "
            "asks about conflicts or scheduling availability.",
            "Just do the work and present results. No 'let me check "
            "your calendar...' preambles.",
            "Tone: helpful, concise, human. Warm but not gushing.",
            "NEVER use emojis or unicode pictographs. Specifically "
            "forbidden: \U0001f535 ✅ ⚠️ ❌ ✓ ✗ \U0001f4c5 "
            "and any other emoji or symbol character. Use plain text "
            "labels. Bold for emphasis, short lists for event lists, "
            "no headers, no horizontal rules.",
        ],
        markdown=True,
    )
