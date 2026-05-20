"""Audit test: every O365 write tool must raise when the underlying
python-o365 method returns False.

O365 wraps Microsoft Graph with methods that sometimes return a bool
instead of raising on a soft-rejection (no recipients, permission
denied with a 200 envelope, etc.). The tools used to ignore that
return value and report success regardless — a silent lie. We now route
every write through services.graph_safety.ensure_ok; this file asserts
each tool actually does so.

Approach: build a fake mailbox/calendar/todo with MagicMock,
monkeypatch token_manager.get_account to return it, and call the
tool's underlying coroutine. The mock's relevant write method
returns False — the tool must raise RuntimeError.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from services import token_manager as tm_module
from tools.calendar import create_calendar_tools
from tools.email import create_email_tools
from tools.tasks import create_tasks_tools

USER_ID = "user-under-test"


def _stub_account(monkeypatch, *, mailbox=None, schedule=None, tasks=None):
    """Build a fake O365.Account exposing mailbox()/schedule()/tasks()."""
    account = MagicMock()
    if mailbox is not None:
        account.mailbox.return_value = mailbox
    if schedule is not None:
        account.schedule.return_value = schedule
    if tasks is not None:
        account.tasks.return_value = tasks

    async def fake_get_account(user_id: str):
        return account

    monkeypatch.setattr(tm_module.token_manager, "get_account", fake_get_account)


def _tool_by_name(tools: list, name: str) -> Any:
    for t in tools:
        if getattr(t, "name", None) == name or getattr(t, "__name__", None) == name:
            return t
    raise KeyError(f"tool {name!r} not in {[getattr(t, 'name', '?') for t in tools]}")


async def _call(tool, **kwargs):
    """Invoke an Agno @tool — entrypoint is the underlying async function."""
    fn = getattr(tool, "entrypoint", None) or tool
    return await fn(**kwargs)


# ── email tools ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_send_email_raises_when_msg_send_returns_false(monkeypatch):
    mailbox = MagicMock()
    msg = MagicMock()
    msg.send.return_value = False
    mailbox.new_message.return_value = msg
    _stub_account(monkeypatch, mailbox=mailbox)

    tools = create_email_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(
            _tool_by_name(tools, "send_email"),
            to="a@b.com",
            subject="x",
            body="y",
        )


@pytest.mark.asyncio
async def test_reply_to_email_raises_when_reply_send_returns_false(monkeypatch):
    mailbox = MagicMock()
    original = MagicMock()
    reply = MagicMock()
    reply.send.return_value = False
    original.reply.return_value = reply
    mailbox.get_message.return_value = original
    _stub_account(monkeypatch, mailbox=mailbox)

    tools = create_email_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(
            _tool_by_name(tools, "reply_to_email"),
            email_id="msg-1",
            body="hi",
        )


@pytest.mark.asyncio
async def test_trash_email_raises_when_delete_returns_false(monkeypatch):
    mailbox = MagicMock()
    msg = MagicMock()
    msg.delete.return_value = False
    mailbox.get_message.return_value = msg
    _stub_account(monkeypatch, mailbox=mailbox)

    tools = create_email_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(_tool_by_name(tools, "trash_email"), email_id="msg-1")


@pytest.mark.asyncio
async def test_move_email_raises_when_move_returns_false(monkeypatch):
    mailbox = MagicMock()
    msg = MagicMock()
    msg.move.return_value = False
    mailbox.get_message.return_value = msg
    _stub_account(monkeypatch, mailbox=mailbox)

    tools = create_email_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(
            _tool_by_name(tools, "move_email"),
            email_id="msg-1",
            destination_folder="archive",
        )


# ── calendar tools ──────────────────────────────────────────────────


def _calendar_schedule_with(event: MagicMock | None = None):
    """Build a schedule whose default calendar yields the given event."""
    calendar = MagicMock()
    if event is not None:
        calendar.new_event.return_value = event
        calendar.get_event.return_value = event
    schedule = MagicMock()
    schedule.get_default_calendar.return_value = calendar
    return schedule


@pytest.mark.asyncio
async def test_create_event_raises_when_save_returns_false(monkeypatch):
    event = MagicMock()
    event.save.return_value = False
    event.attendees = MagicMock()
    _stub_account(monkeypatch, schedule=_calendar_schedule_with(event=event))

    tools = create_calendar_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(
            _tool_by_name(tools, "create_event"),
            summary="meeting",
            start_time="2026-06-01T10:00:00-04:00",
            end_time="2026-06-01T11:00:00-04:00",
        )


@pytest.mark.asyncio
async def test_update_event_raises_when_save_returns_false(monkeypatch):
    event = MagicMock()
    event.save.return_value = False
    event.attendees = MagicMock()
    _stub_account(monkeypatch, schedule=_calendar_schedule_with(event=event))

    tools = create_calendar_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(
            _tool_by_name(tools, "update_event"),
            event_id="evt-1",
            summary="new title",
        )


@pytest.mark.asyncio
async def test_delete_event_raises_when_delete_returns_false(monkeypatch):
    event = MagicMock()
    event.delete.return_value = False
    _stub_account(monkeypatch, schedule=_calendar_schedule_with(event=event))

    tools = create_calendar_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(_tool_by_name(tools, "delete_event"), event_id="evt-1")


# ── tasks tools ─────────────────────────────────────────────────────


def _todo_with(task: MagicMock | None = None):
    """Build a To Do object whose default folder yields the given task."""
    folder = MagicMock()
    if task is not None:
        folder.new_task.return_value = task
        folder.get_task.return_value = task
    todo = MagicMock()
    todo.get_default_folder.return_value = folder
    return todo


@pytest.mark.asyncio
async def test_create_task_raises_when_save_returns_false(monkeypatch):
    task = MagicMock()
    task.save.return_value = False
    _stub_account(monkeypatch, tasks=_todo_with(task=task))

    tools = create_tasks_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(_tool_by_name(tools, "create_task"), title="buy milk")


@pytest.mark.asyncio
async def test_update_task_raises_when_save_returns_false(monkeypatch):
    task = MagicMock()
    task.save.return_value = False
    _stub_account(monkeypatch, tasks=_todo_with(task=task))

    tools = create_tasks_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(
            _tool_by_name(tools, "update_task"),
            task_id="t-1",
            title="renamed",
        )


@pytest.mark.asyncio
async def test_complete_task_raises_when_save_returns_false(monkeypatch):
    task = MagicMock()
    task.save.return_value = False
    _stub_account(monkeypatch, tasks=_todo_with(task=task))

    tools = create_tasks_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(_tool_by_name(tools, "complete_task"), task_id="t-1")


@pytest.mark.asyncio
async def test_delete_task_raises_when_delete_returns_false(monkeypatch):
    task = MagicMock()
    task.delete.return_value = False
    _stub_account(monkeypatch, tasks=_todo_with(task=task))

    tools = create_tasks_tools(tm_module.token_manager, USER_ID)
    with pytest.raises(RuntimeError, match="Microsoft Graph rejected"):
        await _call(_tool_by_name(tools, "delete_task"), task_id="t-1")


# ── happy paths (sanity: True returns don't raise) ──────────────────


@pytest.mark.asyncio
async def test_send_email_happy_path_returns_status_sent(monkeypatch):
    mailbox = MagicMock()
    msg = MagicMock()
    msg.send.return_value = True
    mailbox.new_message.return_value = msg
    _stub_account(monkeypatch, mailbox=mailbox)

    tools = create_email_tools(tm_module.token_manager, USER_ID)
    result = await _call(
        _tool_by_name(tools, "send_email"),
        to="a@b.com",
        subject="x",
        body="y",
    )
    assert '"status": "sent"' in result
