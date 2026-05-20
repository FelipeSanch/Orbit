import asyncio
import json
import logging
import re
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable

from sse_starlette.sse import ServerSentEvent

from repositories import activity as activity_repo
from repositories import approvals as approval_repo
from services.graph_safety import TOOL_PROGRESS_THRESHOLD_S, format_graph_error

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


def _err_envelope(code: str, user_message: str) -> ServerSentEvent:
    """SSE error envelope. {code, user_message} — single shape the frontend
    switches on so it doesn't have to regex-match raw exception strings.
    """
    return _sse("error", {"code": code, "user_message": user_message})


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


_QUEUE_SENTINEL = object()


async def translate_team_stream(
    event_stream,
    user_id: str,
    conversation_id: str,
    session_id: str,
    revalidate_session: Callable[[], Awaitable[bool]] | None = None,
) -> AsyncGenerator[ServerSentEvent, None]:
    """Translate Agno team stream events into our SSE protocol.

    Two coroutines cooperate via an asyncio.Queue:

      • _producer drives Agno's event stream and pushes SSE events.
      • Per-tool progress timers also push tool_progress events when a
        tool call hasn't completed within TOOL_PROGRESS_THRESHOLD_S.
      • This generator drains the queue and yields to the client.

    The queue is the only way background timers can interleave with the
    main agno iteration — async generators can't yield from a callback,
    and a synchronous tool call inside Agno may block the awaiter loop.

    The Agno run_id is discovered from the first event that carries one
    (RunStartedEvent / TeamRunStartedEvent typically). We use Agno's
    run_id for everything we store — pending_approvals, activity_log,
    message metadata — so a later approve-click can find the paused run.

    `revalidate_session` is called at every tool-call boundary. If it
    returns False (the user signed out or session expired mid-stream),
    we emit a `session_expired` error event and exit the loop — fail
    closed, never silently keep streaming under an invalid session.
    """
    out_queue: asyncio.Queue = asyncio.Queue()
    progress_timers: dict[str, asyncio.Task] = {}

    async def _emit_progress(tool_name: str, tool_call_id: str) -> None:
        try:
            await asyncio.sleep(TOOL_PROGRESS_THRESHOLD_S)
            await out_queue.put(
                _sse(
                    "tool_progress",
                    {
                        "tool_name": tool_name,
                        "tool_call_id": tool_call_id,
                        "elapsed_s": TOOL_PROGRESS_THRESHOLD_S,
                    },
                )
            )
        except asyncio.CancelledError:
            pass

    def _start_timer(tool_name: str, tool_call_id: str) -> None:
        if tool_call_id in progress_timers:
            return
        progress_timers[tool_call_id] = asyncio.create_task(
            _emit_progress(tool_name, tool_call_id)
        )

    def _stop_timer(tool_call_id: str) -> None:
        t = progress_timers.pop(tool_call_id, None)
        if t is not None and not t.done():
            t.cancel()

    async def _producer() -> None:
        full_content = ""
        approved_tool_call_ids: set[str] = set()
        run_metrics: dict = {}
        run_id: str = ""
        stream_start_emitted = False

        def _ensure_run_id(event) -> None:
            nonlocal run_id
            if not run_id:
                ev_run_id = getattr(event, "run_id", None)
                if ev_run_id:
                    run_id = ev_run_id

        try:
            async for event in event_stream:
                event_type = type(event).__name__
                logger.debug("Agno event: %s", event_type)
                _ensure_run_id(event)

                if run_id and not stream_start_emitted:
                    stream_start_emitted = True
                    await out_queue.put(
                        _sse(
                            "stream_start",
                            {
                                "run_id": run_id,
                                "conversation_id": conversation_id,
                            },
                        )
                    )

                # ── Content events ─────────────────────────────────
                if event_type in ("TeamRunContentEvent", "RunContentEvent"):
                    content = getattr(event, "content", None)
                    if content:
                        cleaned = _strip_pause_noise(content)
                        if cleaned:
                            full_content += cleaned
                            await out_queue.put(
                                _sse("content_delta", {"delta": cleaned})
                            )
                    continue

                if "IntermediateRunContentEvent" in event_type:
                    continue

                if event_type in (
                    "TeamRunContentCompletedEvent",
                    "RunContentCompletedEvent",
                ):
                    content = getattr(event, "content", None)
                    if content:
                        full_content = _tidy_final(_strip_pause_noise(content))
                    continue

                if event_type in ("RunStartedEvent", "TeamRunStartedEvent"):
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

                # ── Tool events ────────────────────────────────────
                if event_type in (
                    "ToolCallStartedEvent",
                    "TeamToolCallStartedEvent",
                ):
                    if (
                        revalidate_session is not None
                        and not await revalidate_session()
                    ):
                        await out_queue.put(
                            _err_envelope(
                                "session_expired",
                                "Your session expired. Please sign in again.",
                            )
                        )
                        return

                    tool_name, tool_args, tool_call_id = _extract_tool_info(event)

                    if tool_name == "delegate_task_to_member":
                        member_id = tool_args.get("member_id", "unknown")
                        task = tool_args.get("task", "")
                        await out_queue.put(
                            _sse(
                                "agent_delegation",
                                {"to_agent": member_id, "task": task},
                            )
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

                    await out_queue.put(
                        _sse(
                            "tool_call",
                            {
                                "tool_name": tool_name,
                                "tool_args": tool_args,
                                "tool_call_id": tool_call_id,
                            },
                        )
                    )
                    _start_timer(tool_name, tool_call_id)
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
                    _stop_timer(tool_call_id)
                    if tool_name == "delegate_task_to_member":
                        continue
                    result = getattr(event, "content", "")
                    await out_queue.put(
                        _sse(
                            "tool_result",
                            {
                                "tool_name": tool_name,
                                "tool_call_id": tool_call_id,
                                "result": str(result)[:1000],
                            },
                        )
                    )
                    continue

                if event_type in (
                    "ToolCallErrorEvent",
                    "TeamToolCallErrorEvent",
                ):
                    tool_name, _, tool_call_id = _extract_tool_info(event)
                    _stop_timer(tool_call_id)
                    error = getattr(event, "error", "Unknown tool error")
                    logger.error("Tool error in %s: %s", tool_name, error)
                    # Normalize the raw library error into typed JSON so
                    # the model can read it ("Microsoft Graph timed out",
                    # "rate-limited", ...) and respond to the user coherently
                    # instead of pasting a stack trace fragment.
                    result = format_graph_error(error, tool_name=tool_name)
                    await out_queue.put(
                        _sse(
                            "tool_result",
                            {
                                "tool_name": tool_name,
                                "tool_call_id": tool_call_id,
                                "result": result,
                            },
                        )
                    )
                    continue

                # ── Approval events ────────────────────────────────
                if event_type in ("RunPausedEvent", "TeamRunPausedEvent"):
                    # We persist the team leader's run_id (the first one we
                    # saw), NOT the paused member-agent's run_id. Calling
                    # acontinue_run against a member RunOutput crashes inside
                    # Agno 2.5 (`'RunOutput' object has no attribute 'team_id'`);
                    # the team-level continuation is the only one Agno can
                    # build. The downside is that the leader isn't actually
                    # paused — Agno's resume sometimes silently restarts a
                    # fresh run that never executes the confirmed tool. The
                    # silent-failure detection in /api/chat/approve covers it.
                    tools = getattr(event, "tools", []) or []
                    requirements = getattr(event, "requirements", []) or []

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

                        if tool_name == "delegate_task_to_member":
                            continue

                        requires_confirmation = (
                            getattr(tool_exec, "requires_confirmation", False)
                            or False
                        )
                        already_confirmed = (
                            getattr(tool_exec, "confirmed", None) is not None
                        )
                        if not requires_confirmation or already_confirmed:
                            continue

                        if tool_call_id in approved_tool_call_ids:
                            continue
                        approved_tool_call_ids.add(tool_call_id)

                        # A paused tool will never reach ToolCallCompleted,
                        # so cancel its progress timer here.
                        _stop_timer(tool_call_id)

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

                        await out_queue.put(
                            _sse(
                                "approval_required",
                                {
                                    "approval_id": approval_id,
                                    "tool_name": tool_name,
                                    "tool_args": tool_args,
                                    "tool_call_id": tool_call_id,
                                    "run_id": run_id,
                                },
                            )
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

                # ── Error events ───────────────────────────────────
                if event_type in ("RunErrorEvent", "TeamRunErrorEvent"):
                    error_msg = getattr(event, "content", "Unknown error")
                    logger.error("Run error: %s", error_msg)
                    await out_queue.put(
                        _err_envelope(
                            "run_error",
                            "The agent run failed. Please try again.",
                        )
                    )
                    continue

            # End of agno stream — emit trailing SSE events.
            if not stream_start_emitted:
                if not run_id:
                    run_id = str(uuid.uuid4())
                await out_queue.put(
                    _sse(
                        "stream_start",
                        {
                            "run_id": run_id,
                            "conversation_id": conversation_id,
                        },
                    )
                )

            if full_content:
                await out_queue.put(
                    _sse("content_done", {"full_content": _tidy_final(full_content)})
                )

            await out_queue.put(
                _sse("stream_end", {"run_id": run_id, "metrics": run_metrics})
            )
        finally:
            for t in progress_timers.values():
                if not t.done():
                    t.cancel()
            await out_queue.put(_QUEUE_SENTINEL)

    producer_task = asyncio.create_task(_producer())
    try:
        while True:
            item = await out_queue.get()
            if item is _QUEUE_SENTINEL:
                break
            yield item
        # Surface any exception the producer raised after we drained.
        if producer_task.done():
            exc = producer_task.exception()
            if exc is not None:
                raise exc
    finally:
        if not producer_task.done():
            producer_task.cancel()
            try:
                await producer_task
            except (asyncio.CancelledError, Exception):
                pass
