"""Reusable "resume a paused Agno run after approval" helper.

Both the web approve endpoint and the SMS reply handler need to load a
paused run, apply confirm/reject to its requirement, and continue. This
isolates that logic so they don't drift apart.

Returns the final assistant content + metrics. Falls back to direct tool
invocation if Agno can't find the paused run (server restart, etc.).
"""

from __future__ import annotations

import logging

from services.agent_factory import create_team_for_user
from services.google_token_manager import google_token_manager
from services.token_manager import token_manager
from tools.calendar import create_calendar_tools
from tools.email import create_email_tools
from tools.google_calendar import create_google_calendar_tools
from tools.tasks import create_tasks_tools

logger = logging.getLogger(__name__)


_FALLBACK_SUCCESS = {
    "send_email": "Sent the email.",
    "reply_to_email": "Reply sent.",
    "trash_email": "Moved to trash.",
    "move_email": "Email moved.",
    "create_event": "Event created on your calendar.",
    "update_event": "Event updated.",
    "delete_event": "Event deleted from your calendar.",
    "create_task": "Task added to your list.",
    "update_task": "Task updated.",
    "complete_task": "Task marked complete.",
    "delete_task": "Task deleted.",
}


async def _build_tool_map(user_id: str) -> dict:
    email_tools = create_email_tools(token_manager, user_id)
    tasks_tools = create_tasks_tools(token_manager, user_id)
    if await google_token_manager.is_connected(user_id):
        calendar_tools = create_google_calendar_tools(
            google_token_manager, user_id
        )
    else:
        calendar_tools = create_calendar_tools(token_manager, user_id)
    out = {}
    for tool in [*email_tools, *calendar_tools, *tasks_tools]:
        name = getattr(tool, "name", None) or getattr(tool, "__name__", None)
        if name:
            out[name] = tool
    return out


async def _run_tool_directly(
    user_id: str, tool_name: str, tool_args: dict
) -> tuple[bool, str]:
    tool_map = await _build_tool_map(user_id)
    tool = tool_map.get(tool_name)
    if tool is None:
        return False, f"I don't know how to run {tool_name} directly."
    try:
        fn = getattr(tool, "entrypoint", None) or tool
        await fn(**tool_args)
        return True, _FALLBACK_SUCCESS.get(
            tool_name, f"Done — {tool_name.replace('_', ' ')}."
        )
    except Exception as e:
        logger.exception("Direct tool %s failed: %s", tool_name, e)
        return False, f"Couldn't complete {tool_name.replace('_', ' ')}: {e}"


async def resume_approval(
    user_id: str,
    session_id: str,
    run_id: str,
    tool_call_id: str,
    tool_name: str,
    tool_args: dict,
    approved: bool,
) -> str:
    """Resume a paused run after the user has approved or rejected.

    Returns the final assistant content (string). If the happy-path
    Agno resume fails, falls back to direct tool execution and returns
    a brief confirmation; if rejected, returns a short ack.
    """
    if not approved:
        # Try to cleanly mark the Agno requirement rejected; if the run
        # is gone, just send the ack.
        try:
            team = await create_team_for_user(user_id, session_id)
            agno_session = await team.aget_session(
                session_id=session_id, user_id=user_id
            )
            paused_run = (
                next(
                    (
                        r
                        for r in (agno_session.runs or [])
                        if r.run_id == run_id
                    ),
                    None,
                )
                if agno_session
                else None
            )
            if paused_run is not None:
                requirements = paused_run.requirements or []
                for req in requirements:
                    te = getattr(req, "tool_execution", None)
                    if (
                        te is not None
                        and getattr(te, "tool_call_id", None) == tool_call_id
                        and req.needs_confirmation
                    ):
                        req.reject()
                # Drain the continuation so memory is consistent.
                async for _ in team.acontinue_run(  # type: ignore[union-attr]
                    run_id=run_id,
                    session_id=session_id,
                    user_id=user_id,
                    requirements=requirements,
                    stream=True,
                    stream_events=False,
                ):
                    pass
        except Exception as e:
            logger.warning("Reject path could not contact Agno: %s", e)
        return "Got it, not doing that."

    # Approved path
    try:
        team = await create_team_for_user(user_id, session_id)
        agno_session = await team.aget_session(
            session_id=session_id, user_id=user_id
        )
        paused_run = (
            next(
                (
                    r
                    for r in (agno_session.runs or [])
                    if r.run_id == run_id
                ),
                None,
            )
            if agno_session
            else None
        )
        if paused_run is not None:
            requirements = paused_run.requirements or []
            for req in requirements:
                te = getattr(req, "tool_execution", None)
                if (
                    te is not None
                    and getattr(te, "tool_call_id", None) == tool_call_id
                    and req.needs_confirmation
                ):
                    req.confirm()

            final_content = ""
            async for ev in team.acontinue_run(  # type: ignore[union-attr]
                run_id=run_id,
                session_id=session_id,
                user_id=user_id,
                requirements=requirements,
                stream=True,
                stream_events=True,
            ):
                ev_type = type(ev).__name__
                if ev_type in (
                    "TeamRunContentCompletedEvent",
                    "RunContentCompletedEvent",
                ):
                    content = getattr(ev, "content", None)
                    if content:
                        final_content = content
            if final_content:
                return final_content.strip()
    except Exception as e:
        logger.warning("Agno resume failed, will fall back: %s", e)

    # Fallback: invoke the tool directly
    ok, msg = await _run_tool_directly(user_id, tool_name, tool_args)
    return msg if ok else f"Couldn't complete that: {msg}"
