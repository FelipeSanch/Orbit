from agno.models.anthropic import Claude
from agno.team import Team


def create_orchestrator_team(
    email_agent,
    calendar_agent,
    tasks_agent,
    db_url: str,
    user_id: str,
    session_id: str,
) -> Team:
    """Create the orchestrator team that routes to specialist agents."""
    team = Team(
        name="Orbit",
        mode="route",
        model=Claude(id="claude-sonnet-4-5-20250929"),
        members=[email_agent, calendar_agent, tasks_agent],
        instructions=[
            "You are Orbit, a personal AI assistant that manages email, calendar, and tasks.",
            "Route email questions to Email Agent, calendar questions to Calendar Agent, "
            "task questions to Tasks Agent.",
            "For cross-domain queries, delegate to each relevant agent and synthesize results.",
            "Be concise and actionable in your responses.",
            "If a request is ambiguous, ask for clarification before acting.",
            "Never fabricate information — only report what the tools return.",
            "When greeting the user, be warm but brief.",
        ],
        show_members_responses=True,
        markdown=True,
        add_datetime_to_context=True,
    )

    team.session_id = session_id
    team.user_id = user_id

    return team
