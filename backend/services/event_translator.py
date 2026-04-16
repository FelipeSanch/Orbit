import json
import uuid
from collections.abc import AsyncGenerator

from services.supabase import get_supabase_client


def _sse_event(event_type: str, data: dict) -> str:
    """Format an SSE event string."""
    return f"event: {event_type}\ndata: {json.dumps(data)}\n\n"


async def translate_team_stream(
    event_stream,
    user_id: str,
    conversation_id: str,
    run_id: str,
) -> AsyncGenerator[str, None]:
    """Translate Agno team stream events into our SSE protocol.

    Yields SSE-formatted strings for each event.
    """
    supabase = get_supabase_client()
    full_content = ""

    yield _sse_event("stream_start", {"run_id": run_id, "conversation_id": conversation_id})

    async for event in event_stream:
        event_type = type(event).__name__

        if hasattr(event, "content") and event.content:
            delta = event.content
            full_content += delta
            yield _sse_event("content_delta", {"delta": delta})

        elif event_type == "RunResponseStartedEvent":
            pass  # Already sent stream_start

        elif event_type == "RunResponseCompletedEvent":
            if hasattr(event, "content") and event.content:
                full_content = event.content

        elif event_type == "ToolCallStartedEvent" or (
            hasattr(event, "tool_call") and hasattr(event, "tool_args")
        ):
            tool_name = getattr(event, "tool_name", "unknown")
            tool_args = getattr(event, "tool_args", {})
            tool_call_id = getattr(event, "tool_call_id", str(uuid.uuid4()))

            yield _sse_event(
                "tool_call",
                {
                    "tool_name": tool_name,
                    "tool_args": tool_args if isinstance(tool_args, dict) else {},
                    "tool_call_id": tool_call_id,
                },
            )

            # Log to activity
            supabase.table("activity_log").insert(
                {
                    "user_id": user_id,
                    "conversation_id": conversation_id,
                    "event_type": "tool_call",
                    "event_data": {
                        "tool_name": tool_name,
                        "tool_args": tool_args if isinstance(tool_args, dict) else {},
                        "run_id": run_id,
                    },
                }
            ).execute()

        elif event_type == "ToolCallCompletedEvent":
            tool_call_id = getattr(event, "tool_call_id", "")
            result = getattr(event, "content", "")
            yield _sse_event(
                "tool_result",
                {"tool_call_id": tool_call_id, "result": str(result)[:1000]},
            )

        elif event_type == "RunPausedEvent":
            # Write tool needs confirmation
            tools_to_confirm = getattr(event, "tools", [])
            for tool_exec in tools_to_confirm:
                tool_name = getattr(tool_exec, "tool_name", "unknown")
                tool_args = getattr(tool_exec, "tool_args", {})
                tool_call_id = getattr(tool_exec, "tool_call_id", str(uuid.uuid4()))

                approval_id = str(uuid.uuid4())

                supabase.table("pending_approvals").insert(
                    {
                        "id": approval_id,
                        "user_id": user_id,
                        "conversation_id": conversation_id,
                        "run_id": run_id,
                        "tool_name": tool_name,
                        "tool_args": tool_args if isinstance(tool_args, dict) else {},
                        "tool_call_id": tool_call_id,
                        "status": "pending",
                    }
                ).execute()

                yield _sse_event(
                    "approval_required",
                    {
                        "approval_id": approval_id,
                        "tool_name": tool_name,
                        "tool_args": tool_args if isinstance(tool_args, dict) else {},
                        "tool_call_id": tool_call_id,
                        "run_id": run_id,
                    },
                )

                supabase.table("activity_log").insert(
                    {
                        "user_id": user_id,
                        "conversation_id": conversation_id,
                        "event_type": "approval_required",
                        "event_data": {
                            "tool_name": tool_name,
                            "approval_id": approval_id,
                            "run_id": run_id,
                        },
                    }
                ).execute()

        elif hasattr(event, "member_name"):
            # Agent delegation event
            yield _sse_event(
                "agent_delegation",
                {
                    "to_agent": getattr(event, "member_name", ""),
                    "task": getattr(event, "content", ""),
                },
            )

    if full_content:
        yield _sse_event("content_done", {"full_content": full_content})

    yield _sse_event("stream_end", {"run_id": run_id})
