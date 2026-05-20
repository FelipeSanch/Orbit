"""Tests for the tool_progress SSE timer in event_translator.

These cover the side-channel mechanism, not real Agno calls: a fake
event stream emits a ToolCallStartedEvent, holds for longer than the
configured threshold, then emits ToolCallCompletedEvent. We expect the
translator to interleave a tool_progress SSE event between them.
"""

from __future__ import annotations

import asyncio
import json
from types import SimpleNamespace

import pytest

import services.graph_safety as gs
from services.event_translator import translate_team_stream


# Class names must match the strings event_translator checks against
# (type(event).__name__), so don't rename these.
class ToolExecution:
    def __init__(self, name: str, args: dict, call_id: str):
        self.tool_name = name
        self.tool_args = args
        self.tool_call_id = call_id


class RunStartedEvent:
    def __init__(self, run_id: str):
        self.run_id = run_id


class ToolCallStartedEvent:
    def __init__(self, run_id: str, tool: ToolExecution):
        self.run_id = run_id
        self.tool = tool


class ToolCallCompletedEvent:
    def __init__(self, run_id: str, tool: ToolExecution, content: str):
        self.run_id = run_id
        self.tool = tool
        self.content = content


class RunCompletedEvent:
    def __init__(self, run_id: str):
        self.run_id = run_id
        self.metrics = SimpleNamespace(
            input_tokens=10, output_tokens=10, total_tokens=20
        )


async def _fake_stream(*, hang_s: float, tool_call_id: str):
    yield RunStartedEvent("run-1")
    te = ToolExecution("list_emails", {}, tool_call_id)
    yield ToolCallStartedEvent("run-1", te)
    await asyncio.sleep(hang_s)
    yield ToolCallCompletedEvent("run-1", te, '{"ok": true}')
    yield RunCompletedEvent("run-1")


@pytest.fixture(autouse=True)
def _stub_activity_repo(monkeypatch):
    """No DB pool in these tests — replace activity_repo.create with a noop."""
    from repositories import activity as activity_repo

    async def _noop(**kwargs):
        return None

    monkeypatch.setattr(activity_repo, "create", _noop)


@pytest.mark.asyncio
async def test_tool_progress_fires_when_tool_exceeds_threshold(monkeypatch):
    monkeypatch.setattr(gs, "TOOL_PROGRESS_THRESHOLD_S", 0.1)
    # event_translator reads from gs at import-time; patch the alias too.
    import services.event_translator as et
    monkeypatch.setattr(et, "TOOL_PROGRESS_THRESHOLD_S", 0.1)

    events = []
    async for sse in translate_team_stream(
        _fake_stream(hang_s=0.3, tool_call_id="tc-slow"),
        user_id="u",
        conversation_id="c",
        session_id="s",
        revalidate_session=None,
    ):
        events.append((sse.event, json.loads(sse.data)))

    types = [t for (t, _) in events]
    assert "tool_progress" in types, types
    progress_payload = next(d for (t, d) in events if t == "tool_progress")
    assert progress_payload["tool_call_id"] == "tc-slow"
    assert progress_payload["tool_name"] == "list_emails"
    # ordering: tool_call → tool_progress → tool_result
    order = [t for t in types if t in ("tool_call", "tool_progress", "tool_result")]
    assert order == ["tool_call", "tool_progress", "tool_result"], order


@pytest.mark.asyncio
async def test_tool_progress_does_not_fire_for_fast_tool(monkeypatch):
    monkeypatch.setattr(gs, "TOOL_PROGRESS_THRESHOLD_S", 0.5)
    import services.event_translator as et
    monkeypatch.setattr(et, "TOOL_PROGRESS_THRESHOLD_S", 0.5)

    types = []
    async for sse in translate_team_stream(
        _fake_stream(hang_s=0.05, tool_call_id="tc-fast"),
        user_id="u",
        conversation_id="c",
        session_id="s",
        revalidate_session=None,
    ):
        types.append(sse.event)

    assert "tool_progress" not in types, types


@pytest.mark.asyncio
async def test_tool_call_writes_an_activity_row(monkeypatch):
    """tool_call events trigger an activity_log row even in the fast path."""
    from repositories import activity as activity_repo

    captured = []

    async def fake_create(**kwargs):
        captured.append(kwargs.get("event_type"))

    monkeypatch.setattr(activity_repo, "create", fake_create)

    async for _ in translate_team_stream(
        _fake_stream(hang_s=0.05, tool_call_id="tc-acty"),
        user_id="u",
        conversation_id="c",
        session_id="s",
        revalidate_session=None,
    ):
        pass

    assert "tool_call" in captured
