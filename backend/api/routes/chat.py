import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from api.deps import get_current_user
from services.agent_factory import create_team_for_user
from services.event_translator import translate_team_stream
from services.redis import check_rate_limit
from services.supabase import get_supabase_client

router = APIRouter(prefix="/api/chat", tags=["chat"])


class ChatRequest(BaseModel):
    message: str
    conversation_id: str | None = None
    session_id: str | None = None


@router.post("")
async def chat(request: ChatRequest, user: dict = Depends(get_current_user)):
    """Send a chat message and receive streaming SSE response."""
    # Rate limit check
    rate_result = check_rate_limit(user["id"])
    if not rate_result.allowed:
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    supabase = get_supabase_client()

    # Create or load conversation
    is_new_conversation = request.conversation_id is None
    conversation_id = request.conversation_id
    if not conversation_id:
        result = supabase.table("conversations").insert({"user_id": user["id"]}).execute()
        conversation_id = result.data[0]["id"]

    # Store user message
    supabase.table("messages").insert(
        {
            "conversation_id": conversation_id,
            "user_id": user["id"],
            "role": "user",
            "content": request.message,
        }
    ).execute()

    # Set up session
    session_id = request.session_id or str(uuid.uuid4())
    run_id = str(uuid.uuid4())

    async def event_generator():
        team = await create_team_for_user(user["id"], session_id)

        event_stream = await team.arun(
            request.message,
            stream=True,
            stream_events=True,
        )

        full_content = ""
        async for sse_event in translate_team_stream(
            event_stream, user["id"], conversation_id, run_id
        ):
            # Capture content for message storage
            if '"content_done"' in sse_event:
                import json

                try:
                    data_line = sse_event.split("data: ", 1)[1].split("\n")[0]
                    parsed = json.loads(data_line)
                    full_content = parsed.get("full_content", "")
                except (IndexError, json.JSONDecodeError):
                    pass

            yield sse_event

        # Store assistant message
        if full_content:
            supabase.table("messages").insert(
                {
                    "conversation_id": conversation_id,
                    "user_id": user["id"],
                    "role": "assistant",
                    "content": full_content,
                    "metadata": {"run_id": run_id, "session_id": session_id},
                }
            ).execute()

            # Update conversation timestamp
            supabase.table("conversations").update({"updated_at": "now()"}).eq(
                "id", conversation_id
            ).execute()

            # Auto-title new conversations
            if is_new_conversation:
                from services.conversation_titler import generate_conversation_title

                try:
                    await generate_conversation_title(
                        conversation_id, request.message, full_content
                    )
                except Exception:
                    pass  # Best-effort titling

    return EventSourceResponse(event_generator())
