import json
import logging

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse, ServerSentEvent

from api.deps import get_current_user, validate_session_token
from repositories import conversations as conv_repo
from repositories import messages as msg_repo
from services.agent_factory import create_team_for_user
from services.database import get_pool
from services.event_translator import translate_team_stream
from services.redis import check_rate_limit
from services.spend_cap import check_daily_spend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None


@router.post("")
async def chat(
    request: ChatRequest,
    user: dict = Depends(get_current_user),
    authorization: str = Header(...),
):
    """Send a chat message and receive streaming SSE response."""
    rate_result = check_rate_limit(user["id"])
    if not rate_result.allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    spend = await check_daily_spend(user["id"])
    if not spend.allowed:
        raise HTTPException(
            status_code=429,
            detail={
                "code": "daily_cap_reached",
                "message": (
                    f"Daily cap reached (${spend.current_usd:.2f} of "
                    f"${spend.cap_usd:.2f}). Resets at 00:00 UTC."
                ),
                "current_usd": spend.current_usd,
                "cap_usd": spend.cap_usd,
            },
        )

    # Capture the session token now so the SSE translator can re-validate
    # at tool-call boundaries. The stream can run for minutes; if the user
    # signs out or the session expires mid-stream, we fail closed.
    session_token = authorization.removeprefix("Bearer ")

    async def revalidate() -> bool:
        return await validate_session_token(get_pool(), session_token) is not None

    is_new_conversation = request.conversation_id is None
    conversation_id = request.conversation_id
    if not conversation_id:
        conv = await conv_repo.create(user["id"])
        conversation_id = conv["id"]

    await msg_repo.create(conversation_id, user["id"], "user", request.message)

    # Agno session is scoped 1:1 with our conversation — keeps paused runs,
    # memory, and history isolated between different Orbit conversations.
    session_id = conversation_id

    # If earlier turns completed via the direct-execution fallback, Agno's
    # session history never saw them. Prepend a short note so the agent
    # doesn't try to repeat already-done actions.
    fallback_note = await msg_repo.fallback_context(conversation_id)
    input_message = f"{fallback_note}\n\n{request.message}" if fallback_note else request.message

    async def event_generator():
        try:
            team = await create_team_for_user(user["id"], session_id)

            event_stream = team.arun(
                input_message,
                stream=True,
                stream_events=True,
            )

            full_content = ""
            run_metrics: dict = {}
            run_id_seen = ""
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
                        run_id_seen = parsed.get("run_id", "") or run_id_seen
                    except (json.JSONDecodeError, TypeError):
                        pass
                elif sse_event.event == "stream_start" and sse_event.data:
                    try:
                        parsed = json.loads(sse_event.data)
                        run_id_seen = parsed.get("run_id", "") or run_id_seen
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
                        "run_id": run_id_seen,
                        "session_id": session_id,
                        "metrics": run_metrics,
                    },
                )
                await conv_repo.update_timestamp(conversation_id)

                if is_new_conversation:
                    from services.conversation_titler import generate_conversation_title

                    try:
                        await generate_conversation_title(
                            conversation_id, request.message, full_content
                        )
                    except Exception:
                        pass
        except Exception as e:
            logger.exception("Error in event_generator: %s", e)
            yield ServerSentEvent(
                data=json.dumps(
                    {
                        "code": "run_error",
                        "user_message": "Something went wrong on our side. Please try again.",
                    }
                ),
                event="error",
            )

    return EventSourceResponse(event_generator())
