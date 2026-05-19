import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator

from sse_starlette.sse import ServerSentEvent

from repositories import activity as activity_repo
from repositories import approvals as approval_repo

# Agno yields these strings as stream content when a member pauses for
# HITL — they're framework scaffolding, not something the user should see.
_PAUSE_KINDS = (
    "human input|user input|user confirmation|user feedback|external execution"
)
_AGNO_PAUSE_NOISE = re.compile(
    rf"Member '[^']+' requires (?:{_PAUSE_KINDS}).*?(?:\n|$)"
    r"|Task \[[^\]]+\] paused\.",
    re.IGNORECASE,
)


def _strip_pause_noise(text: str) -> str:
    """Remove Agno's pause scaffolding. Never strips the outer whitespace —
    deltas arrive with leading/trailing spaces that matter for word spacing.
    """
    if not text:
        return text
    return _AGNO_PAUSE_NOISE.sub("", text)


def _tidy_final(text: str) -> str:
    """Final-pass tidy: collapse excessive blank lines + strip outer space."""
    if not text:
        return text
    return re.sub(r"\n{3,}", "\n\n", text).strip()


logger = logging.getLogger(__name__)


def _sse(event_type: str, data: dict) -> ServerSentEvent:
    """Create a ServerSentEvent with the given event type and data."""
    return ServerSentEvent(data=json.dumps(data), event=event_type)


def _extract_tool_info(event) -> tuple[str, dict, str]:
    """Extract tool_name, tool_args, tool_call_id from an Agno event.

    Agno stores tool info in event.tool (a ToolExecution object).
    """
    tool = getattr(event, "tool", None)
    if tool is not None:
        name = getattr(tool, "tool_name", None) or "unknown"
        args = getattr(tool, "tool_args", None) or {}
        call_id = getattr(tool, "tool_call_id", None) or str(uuid.uuid4())
        return name, args if isinstance(args, dict) else {}, call_id

    # Fallback: try direct attributes (older Agno versions)
    return (
        getattr(event, "tool_name", "unknown"),
        getattr(event, "tool_args", {}),
        getattr(event, "tool_call_id", str(uuid.uuid4())),
    )


async def translate_team_stream(
    event_stream,
    user_id: str,
    conversation_id: str,
    session_id: str,
) -> AsyncGenerator[ServerSentEvent, None]:
    """Translate Agno team stream events into our SSE protocol.

    The Agno run_id is discovered from the first event that carries one
    (RunStartedEvent / TeamRunStartedEvent typically). We use Agno's run_id
    for everything we store — pending_approvals, activity_log, message
    metadata — so a later approve-click can find the paused run.
    """
    full_content = ""
    approved_tool_call_ids: set[str] = set()
    run_metrics: dict = {}
    # Use Agno's own run_id (discovered from events) — not a synthetic one.
    run_id: str = ""

    def _ensure_run_id(event) -> None:
        nonlocal run_id
        if not run_id:
            ev_run_id = getattr(event, "run_id", None)
            if ev_run_id:
                run_id = ev_run_id

    stream_start_emitted = False

    async for event in event_stream:
        event_type = type(event).__name__
        logger.debug("Agno event: %s", event_type)
        _ensure_run_id(event)

        # Emit stream_start the moment we know Agno's run_id.
        if run_id and not stream_start_emitted:
            stream_start_emitted = True
            yield _sse(
                "stream_start",
                {"run_id": run_id, "conversation_id": conversation_id},
            )

        # ── Content events ─────────────────────────────────────
        # In route mode with show_members_responses=True, member
        # agent content comes through as RunContentEvent.
        # TeamRunContentEvent may also fire. Stream both.
        if event_type in ("TeamRunContentEvent", "RunContentEvent"):
            content = getattr(event, "content", None)
            if content:
                cleaned = _strip_pause_noise(content)
                if cleaned:
                    full_content += cleaned
                    yield _sse("content_delta", {"delta": cleaned})
            continue

        if "IntermediateRunContentEvent" in event_type:
            # Skip intermediate planning text
            continue

        if event_type in (
            "TeamRunContentCompletedEvent",
            "RunContentCompletedEvent",
        ):
            content = getattr(event, "content", None)
            if content:
                full_content = _tidy_final(_strip_pause_noise(content))
            continue

        if event_type in (
            "RunStartedEvent",
            "TeamRunStartedEvent",
        ):
            continue

        if event_type in ("RunCompletedEvent", "TeamRunCompletedEvent"):
            metrics = getattr(event, "metrics", None)
            if metrics is not None:
                run_metrics = {
                    "input_tokens": getattr(metrics, "input_tokens", None),
                    "output_tokens": getattr(metrics, "output_tokens", None),
                    "total_tokens": getattr(metrics, "total_tokens", None),
                }
            continue

        # ── Tool events ────────────────────────────────────────
        if event_type in ("ToolCallStartedEvent", "TeamToolCallStartedEvent"):
            tool_name, tool_args, tool_call_id = _extract_tool_info(event)

            # Emit delegation event for the internal routing tool, but skip
            # logging it as a generic tool_call (it's noise in the feed).
            if tool_name == "delegate_task_to_member":
                member_id = tool_args.get("member_id", "unknown")
                task = tool_args.get("task", "")
                yield _sse(
                    "agent_delegation",
                    {"to_agent": member_id, "task": task},
                )
                await activity_repo.create(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    event_type="agent_delegation",
                    event_data={
                        "to_agent": member_id,
                        "task": task,
                        "run_id": run_id,
                    },
                )
                continue

            yield _sse(
                "tool_call",
                {
                    "tool_name": tool_name,
                    "tool_args": tool_args,
                    "tool_call_id": tool_call_id,
                },
            )

            await activity_repo.create(
                user_id=user_id,
                conversation_id=conversation_id,
                event_type="tool_call",
                event_data={
                    "tool_name": tool_name,
                    "tool_args": tool_args,
                    "run_id": run_id,
                },
            )
            continue

        if event_type in (
            "ToolCallCompletedEvent",
            "TeamToolCallCompletedEvent",
        ):
            tool_name, _, tool_call_id = _extract_tool_info(event)
            if tool_name == "delegate_task_to_member":
                continue
            result = getattr(event, "content", "")
            yield _sse(
                "tool_result",
                {
                    "tool_name": tool_name,
                    "tool_call_id": tool_call_id,
                    "result": str(result)[:1000],
                },
            )
            continue

        if event_type in (
            "ToolCallErrorEvent",
            "TeamToolCallErrorEvent",
        ):
            tool_name, _, tool_call_id = _extract_tool_info(event)
            error = getattr(event, "error", "Unknown tool error")
            logger.error("Tool error in %s: %s", tool_name, error)
            yield _sse(
                "tool_result",
                {
                    "tool_name": tool_name,
                    "tool_call_id": tool_call_id,
                    "result": f"Error: {error}",
                },
            )
            continue

        # ── Approval events ────────────────────────────────────
        if event_type in ("RunPausedEvent", "TeamRunPausedEvent"):
            tools = getattr(event, "tools", []) or []
            requirements = getattr(event, "requirements", []) or []

            # Collect all ToolExecution objects and dedupe by tool_call_id —
            # the same pause often fires on both RunPausedEvent and
            # TeamRunPausedEvent, and appears in both requirements and tools.
            seen_in_this_event: set[str] = set()
            tool_execs = []
            for req in requirements:
                te = getattr(req, "tool_execution", None)
                if te is None:
                    continue
                call_id = getattr(te, "tool_call_id", None)
                if call_id and call_id in seen_in_this_event:
                    continue
                if call_id:
                    seen_in_this_event.add(call_id)
                tool_execs.append(te)
            for te in tools:
                call_id = getattr(te, "tool_call_id", None)
                if call_id and call_id in seen_in_this_event:
                    continue
                if call_id:
                    seen_in_this_event.add(call_id)
                tool_execs.append(te)

            for tool_exec in tool_execs:
                tool_name = getattr(tool_exec, "tool_name", "unknown")
                tool_args = getattr(tool_exec, "tool_args", {})
                tool_call_id = getattr(
                    tool_exec, "tool_call_id", str(uuid.uuid4())
                )
                if not isinstance(tool_args, dict):
                    tool_args = {}

                # Skip Agno's internal team-routing tool — it's not a
                # user-facing action and should never require confirmation.
                if tool_name == "delegate_task_to_member":
                    continue

                # Only surface an approval card for tools that actually
                # require confirmation. Paused events can include read-only
                # tools that are just queued behind a confirmed tool; those
                # resume automatically when the user approves the gated one.
                requires_confirmation = (
                    getattr(tool_exec, "requires_confirmation", False) or False
                )
                already_confirmed = getattr(tool_exec, "confirmed", None) is not None
                if not requires_confirmation or already_confirmed:
                    continue

                # Skip if we've already emitted an approval for this
                # tool_call_id earlier in the stream (prevents duplicates
                # across Run / Team event pairs).
                if tool_call_id in approved_tool_call_ids:
                    continue
                approved_tool_call_ids.add(tool_call_id)

                approval_id = str(uuid.uuid4())

                await approval_repo.create(
                    approval_id=approval_id,
                    user_id=user_id,
                    conversation_id=conversation_id,
                    run_id=run_id,
                    session_id=session_id,
                    tool_name=tool_name,
                    tool_args=tool_args,
                    tool_call_id=tool_call_id,
                )

                yield _sse(
                    "approval_required",
                    {
                        "approval_id": approval_id,
                        "tool_name": tool_name,
                        "tool_args": tool_args,
                        "tool_call_id": tool_call_id,
                        "run_id": run_id,
                    },
                )

                await activity_repo.create(
                    user_id=user_id,
                    conversation_id=conversation_id,
                    event_type="approval_required",
                    event_data={
                        "tool_name": tool_name,
                        "approval_id": approval_id,
                        "run_id": run_id,
                    },
                )
            continue

        # ── Error events ───────────────────────────────────────
        if event_type in ("RunErrorEvent", "TeamRunErrorEvent"):
            error_msg = getattr(event, "content", "Unknown error")
            logger.error("Run error: %s", error_msg)
            yield _sse("error", {"message": str(error_msg), "code": "run_error"})
            continue

    # Safety: emit stream_start at the very end if we never saw a run_id
    # (extremely rare — would mean every event came without one).
    if not stream_start_emitted:
        if not run_id:
            run_id = str(uuid.uuid4())
        yield _sse(
            "stream_start",
            {"run_id": run_id, "conversation_id": conversation_id},
        )

    if full_content:
        yield _sse("content_done", {"full_content": _tidy_final(full_content)})

    yield _sse("stream_end", {"run_id": run_id, "metrics": run_metrics})
