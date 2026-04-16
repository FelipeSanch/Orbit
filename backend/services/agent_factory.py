from agno.team import Team

from agents.calendar_agent import create_calendar_agent
from agents.email_agent import create_email_agent
from agents.orchestrator import create_orchestrator_team
from agents.tasks_agent import create_tasks_agent
from config import settings
from services.token_manager import token_manager
from tools.calendar import create_calendar_tools
from tools.email import create_email_tools
from tools.tasks import create_tasks_tools


async def create_team_for_user(user_id: str, session_id: str) -> Team:
    """Create a fully wired Orbit team for a specific user and session."""
    email_tools = create_email_tools(token_manager, user_id)
    calendar_tools = create_calendar_tools(token_manager, user_id)
    tasks_tools = create_tasks_tools(token_manager, user_id)

    email_agent = create_email_agent(email_tools)
    calendar_agent = create_calendar_agent(calendar_tools)
    tasks_agent = create_tasks_agent(tasks_tools)

    team = create_orchestrator_team(
        email_agent=email_agent,
        calendar_agent=calendar_agent,
        tasks_agent=tasks_agent,
        db_url=settings.supabase_db_url,
        user_id=user_id,
        session_id=session_id,
    )

    return team
