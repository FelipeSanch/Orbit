import asyncio
import logging

from agno.team import Team

from agents.calendar_agent import create_calendar_agent
from agents.email_agent import create_email_agent
from agents.google_calendar_agent import create_google_calendar_agent
from agents.orchestrator import create_orchestrator_team
from agents.tasks_agent import create_tasks_agent
from config import settings
from repositories import activity as activity_repo
from services.agno_db import get_agno_db
from services.google_token_manager import google_token_manager
from services.token_manager import token_manager
from tools.calendar import create_calendar_tools
from tools.email import create_email_tools
from tools.google_calendar import create_google_calendar_tools
from tools.tasks import create_tasks_tools

logger = logging.getLogger(__name__)


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

    # session_id is the conversation_id (see chat.py:71) — safe to use
    # for activity_log scoping.
    conversation_id = session_id

    async def _record_fallback(
        primary: str, fallback: str, reason: str
    ) -> None:
        """Background write — must never raise into the event loop.

        Bare asyncio.create_task() leaves any exception as a stray
        'Task exception was never retrieved' warning. Catch + log
        explicitly so an activity_log failure can't pollute logs or
        crash a user-facing request.
        """
        try:
            await activity_repo.create(
                user_id=user_id,
                conversation_id=conversation_id,
                event_type="model_fallback",
                event_data={
                    "primary": primary,
                    "fallback": fallback,
                    "reason": reason[:500],
                },
            )
        except Exception:
            logger.exception(
                "model_fallback activity_log write failed user=%s conv=%s",
                user_id,
                conversation_id,
            )

    def on_fallback(primary: str, fallback: str, reason: str) -> None:
        """Specialist model fell back from primary to fallback.

        Fires synchronously from inside the agent's async invoke path,
        so we schedule the DB write as a background task to avoid
        blocking the model call.
        """
        logger.warning(
            "specialist_model_fallback user=%s conv=%s %s -> %s",
            user_id,
            conversation_id,
            primary,
            fallback,
        )
        try:
            asyncio.create_task(_record_fallback(primary, fallback, reason))
        except RuntimeError:
            # No running loop (shouldn't happen in practice — agent
            # calls are inside the FastAPI loop) — swallow silently.
            logger.exception("model_fallback activity write skipped — no event loop")

    if google_connected:
        calendar_tools = create_google_calendar_tools(
            google_token_manager, user_id
        )
        calendar_agent = create_google_calendar_agent(
            calendar_tools,
            db=db,
            session_id=f"{session_id}:gcal",
            user_id=user_id,
            on_fallback=on_fallback,
        )
        calendar_provider = "google"
    else:
        calendar_tools = create_calendar_tools(token_manager, user_id)
        calendar_agent = create_calendar_agent(
            calendar_tools,
            db=db,
            session_id=f"{session_id}:calendar",
            user_id=user_id,
            on_fallback=on_fallback,
        )
        calendar_provider = "outlook"

    email_agent = create_email_agent(
        email_tools,
        db=db,
        session_id=f"{session_id}:email",
        user_id=user_id,
        on_fallback=on_fallback,
    )
    tasks_agent = create_tasks_agent(
        tasks_tools,
        db=db,
        session_id=f"{session_id}:tasks",
        user_id=user_id,
        on_fallback=on_fallback,
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
