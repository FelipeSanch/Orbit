import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from api.deps import get_current_user, validate_session_token
from repositories import activity as activity_repo
from repositories import approvals as approval_repo
from repositories import conversations as conv_repo
from repositories import messages as msg_repo
from services.agent_factory import create_team_for_user
from services.database import get_pool
from services.event_translator import translate_team_stream
from services.google_token_manager import google_token_manager
from services.token_manager import token_manager
from tools.calendar import create_calendar_tools
from tools.email import create_email_tools
from tools.google_calendar import create_google_calendar_tools
from tools.tasks import create_tasks_tools

logger = logging.getLogger(__name__)


router = APIRouter(prefix="/api/chat", tags=["approval"])


class ApprovalRequest(BaseModel):
    approval_id: str
    approved: bool


def _sse(event_type: str, data: dict) -> ServerSentEvent:
    return ServerSentEvent(data=json.dumps(data), event=event_type)


async def _build_tool_map(user_id: str) -> dict:
    """Build a tool_name → callable map for direct invocation.

    Mirrors the agent_factory routing: Google Calendar wins over Outlook
    when both are connected. Email + tasks always on Microsoft.
    """
    email_tools = create_email_tools(token_manager, user_id)
    tasks_tools = create_tasks_tools(token_manager, user_id)
    if await google_token_manager.is_connected(user_id):
        calendar_tools = create_google_calendar_tools(
            google_token_manager, user_id
        )
    else:
        calendar_tools = create_calendar_tools(token_manager, user_id)
    tool_map = {}
    for tool in [*email_tools, *calendar_tools, *tasks_tools]:
        name = getattr(tool, "name", None) or getattr(tool, "__name__", None)
        if name:
            tool_map[name] = tool
    return tool_map


_SUCCESS_TEXTS = {
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


async def _run_tool_directly(
    user_id: str, tool_name: str, tool_args: dict
) -> tuple[bool, str]:
    """Invoke the approved tool directly. Returns (ok, message_for_user)."""
    tool_map = await _build_tool_map(user_id)
    tool = tool_map.get(tool_name)
    if tool is None:
        return False, f"I don't know how to run {tool_name} directly."

    try:
        # Agno @tool objects expose `entrypoint` as the underlying async fn
        fn = getattr(tool, "entrypoint", None) or tool
        result = await fn(**tool_args)
        logger.info("Direct tool %s succeeded: %s", tool_name, str(result)[:200])
        return True, _SUCCESS_TEXTS.get(
            tool_name, f"Done. {tool_name.replace('_', ' ').capitalize()} completed."
        )
    except Exception as e:
        logger.exception("Direct tool %s failed: %s", tool_name, e)
        return False, f"Couldn't complete {tool_name.replace('_', ' ')}: {e}"


@router.post("/approve")
async def approve_action(
    request: ApprovalRequest,
    user: dict = Depends(get_current_user),
    authorization: str = Header(...),
):
    """Approve or reject a pending write action and resume the paused run.

    Streams continuation events as SSE. If Agno can't resume the paused run
    (e.g. process restarted, session drifted), falls back to executing the
    tool directly so the user's action still completes.
    """
    approval = await approval_repo.get_pending(request.approval_id, user["id"])
    if not approval:
        raise HTTPException(
            status_code=404, detail="Approval not found or already resolved"
        )

    new_status = "approved" if request.approved else "rejected"
    await approval_repo.resolve(request.approval_id, new_status)

    await activity_repo.create(
        user_id=user["id"],
        conversation_id=approval["conversation_id"],
        event_type=f"approval_{new_status}",
        event_data={
            "approval_id": request.approval_id,
            "tool_name": approval["tool_name"],
            "run_id": approval["run_id"],
        },
    )

    run_id = approval["run_id"]
    session_id = approval["session_id"]
    conversation_id = approval["conversation_id"]
    tool_call_id = approval["tool_call_id"]
    tool_name = approval["tool_name"]
    tool_args_raw = approval["tool_args"]
    tool_args = (
        json.loads(tool_args_raw) if isinstance(tool_args_raw, str) else tool_args_raw
    ) or {}

    # Capture the session token for mid-stream re-validation in the
    # continuation. Same fail-closed contract as /api/chat.
    session_token = authorization.removeprefix("Bearer ")

    async def revalidate() -> bool:
        return await validate_session_token(get_pool(), session_token) is not None

    async def event_generator():
        try:
            yield _sse(
                "stream_start",
                {"run_id": run_id, "conversation_id": conversation_id},
            )

            team = await create_team_for_user(user["id"], session_id)

            agno_session = None
            paused_run = None
            try:
                agno_session = await team.aget_session(
                    session_id=session_id, user_id=user["id"]
                )
                runs_count = (
                    len(agno_session.runs or []) if agno_session else 0
                )
                run_ids = (
                    [r.run_id for r in (agno_session.runs or [])]
                    if agno_session
                    else []
                )
                logger.debug(
                    "approve: session=%s user=%s target_run=%s agno_session=%s runs=%d run_ids=%s",
                    session_id,
                    user["id"],
                    run_id,
                    "present" if agno_session else "missing",
                    runs_count,
                    run_ids,
                )
                if agno_session is not None:
                    paused_run = next(
                        (
                            r
                            for r in (agno_session.runs or [])
                            if r.run_id == run_id
                        ),
                        None,
                    )
                    logger.debug("approve: paused_run_found=%s", paused_run is not None)
            except Exception as e:
                logger.warning("Could not load Agno session %s: %s", session_id, e)

            # ── Happy path: resume the paused Agno run ────────────
            if paused_run is not None:
                requirements = paused_run.requirements or []
                for req in requirements:
                    te = getattr(req, "tool_execution", None)
                    if te is None:
                        continue
                    if getattr(te, "tool_call_id", None) != tool_call_id:
                        continue
                    if request.approved and req.needs_confirmation:
                        req.confirm()
                    elif not request.approved and req.needs_confirmation:
                        req.reject()

                event_stream = team.acontinue_run(
                    run_id=run_id,
                    session_id=session_id,
                    user_id=user["id"],
                    requirements=requirements,
                    stream=True,
                    stream_events=True,
                )

                full_content = ""
                run_metrics: dict = {}
                async for sse_event in translate_team_stream(
                    event_stream,
                    user["id"],
                    conversation_id,
                    session_id,
                    revalidate_session=revalidate,
                ):
                    if sse_event.event == "content_done" and sse_event.data:
                        try:
                            parsed = json.loads(sse_event.data)
                            full_content = parsed.get("full_content", "")
                        except (json.JSONDecodeError, TypeError):
                            pass
                    elif sse_event.event == "stream_end" and sse_event.data:
                        try:
                            parsed = json.loads(sse_event.data)
                            run_metrics = parsed.get("metrics", {}) or {}
                        except (json.JSONDecodeError, TypeError):
                            pass
                    yield sse_event

                if full_content:
                    await msg_repo.create(
                        conversation_id,
                        user["id"],
                        "assistant",
                        full_content,
                        {
                            "run_id": run_id,
                            "session_id": session_id,
                            "metrics": run_metrics,
                            "continuation": True,
                        },
                    )
                    await conv_repo.update_timestamp(conversation_id)
                return

            # ── Fallback: resume failed, execute the tool directly ─
            logger.warning(
                "Agno resume miss — session=%s run=%s agno_session=%s. "
                "Falling back to direct tool execution.",
                session_id,
                run_id,
                "present" if agno_session else "missing",
            )

            if not request.approved:
                # Rejected with no resume path — just ack to the user.
                summary = "Got it, not doing that."
                yield _sse("content_delta", {"delta": summary})
                yield _sse("content_done", {"full_content": summary})
                await msg_repo.create(
                    conversation_id,
                    user["id"],
                    "assistant",
                    summary,
                    {"run_id": run_id, "session_id": session_id, "fallback": True},
                )
                yield _sse("stream_end", {"run_id": run_id, "metrics": {}})
                return

            ok, message = await _run_tool_directly(
                user["id"], tool_name, tool_args
            )

            yield _sse("content_delta", {"delta": message})
            yield _sse("content_done", {"full_content": message})
            await msg_repo.create(
                conversation_id,
                user["id"],
                "assistant",
                message,
                {
                    "run_id": run_id,
                    "session_id": session_id,
                    "fallback": True,
                    "tool_executed": tool_name,
                    "tool_ok": ok,
                },
            )
            await conv_repo.update_timestamp(conversation_id)
            yield _sse("stream_end", {"run_id": run_id, "metrics": {}})
        except Exception as e:
            logger.exception("Error continuing approved run: %s", e)
            yield _sse("error", {"message": str(e)})

    return EventSourceResponse(event_generator())
