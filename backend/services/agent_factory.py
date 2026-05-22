from agno.team import Team

from agents.calendar_agent import create_calendar_agent
from agents.email_agent import create_email_agent
from agents.google_calendar_agent import create_google_calendar_agent
from agents.orchestrator import create_orchestrator_team
from agents.tasks_agent import create_tasks_agent
from config import settings
from services.agno_db import get_agno_db
from services.google_token_manager import google_token_manager
from services.token_manager import token_manager
from tools.calendar import create_calendar_tools
from tools.email import create_email_tools
from tools.google_calendar import create_google_calendar_tools
from tools.tasks import create_tasks_tools


async def create_team_for_user(user_id: str, session_id: str) -> Team:
    """Create a fully wired Orbit team for a specific user and session.

    Calendar backend is chosen per-user: if Google is connected, the
    Calendar Agent uses Google Calendar. Otherwise it falls back to Outlook.
    Email and tasks always use Microsoft. Connection state is passed to
    the orchestrator so it can refuse politely when a provider is
    missing instead of letting a tool fail mid-stream.

    Each specialist gets its own session_id scoped under the conversation
    so they accumulate per-domain history (lets 'open the third one'
    reuse the previous list's ids instead of re-searching). Sharing the
    orchestrator's session_id directly would have all three specialists
    write to the same Agno session and overwrite each other.
    """
    email_tools = create_email_tools(token_manager, user_id)
    tasks_tools = create_tasks_tools(token_manager, user_id)

    microsoft_connected = await token_manager.is_connected(user_id)
    google_connected = await google_token_manager.is_connected(user_id)

    db = get_agno_db()

    if google_connected:
        calendar_tools = create_google_calendar_tools(
            google_token_manager, user_id
        )
        calendar_agent = create_google_calendar_agent(
            calendar_tools,
            db=db,
            session_id=f"{session_id}:gcal",
            user_id=user_id,
        )
        calendar_provider = "google"
    else:
        calendar_tools = create_calendar_tools(token_manager, user_id)
        calendar_agent = create_calendar_agent(
            calendar_tools,
            db=db,
            session_id=f"{session_id}:calendar",
            user_id=user_id,
        )
        calendar_provider = "outlook"

    email_agent = create_email_agent(
        email_tools,
        db=db,
        session_id=f"{session_id}:email",
        user_id=user_id,
    )
    tasks_agent = create_tasks_agent(
        tasks_tools,
        db=db,
        session_id=f"{session_id}:tasks",
        user_id=user_id,
    )

    team = create_orchestrator_team(
        email_agent=email_agent,
        calendar_agent=calendar_agent,
        tasks_agent=tasks_agent,
        db_url=settings.database_url,
        user_id=user_id,
        session_id=session_id,
        microsoft_connected=microsoft_connected,
        google_connected=google_connected,
        calendar_provider=calendar_provider,
    )

    return team
