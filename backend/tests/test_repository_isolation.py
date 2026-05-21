"""Exhaustive cross-user isolation tests for every public repository method.

WHY THIS EXISTS
---------------
Orbit's data isolation lives in the repository layer, not the database.
Every query carries an explicit `WHERE user_id = $1` instead of relying
on Postgres RLS. That's a fast, debuggable, code-review-friendly trade-
off — but only if a test proves the discipline holds. A recruiter who
asks "how do you prove no query leaks user data?" should hear "we have
one test per repository method that creates two users, exercises the
method as user A, and asserts user B's data is invisible." Without this
file that answer is "code review," which doesn't survive scrutiny.

COVERAGE
--------
Every public function in backend/repositories/ has a test below. Where
a function is intentionally unscoped (callers are responsible for
ownership checks before invoking — `resolve`, `update_title`,
`update_timestamp`, `list_by_conversation`, `fallback_context`,
`get_user_for_address`), the test documents that contract explicitly
and verifies the function behaves consistently with it. This makes the
trust boundary auditable.

RUN
---
    cd backend && pytest tests/test_repository_isolation.py -v

Requires DATABASE_URL pointing at a real Neon instance (the same one
the dev server uses is fine — tests clean up after themselves via
CASCADE on the throwaway users).
"""

from __future__ import annotations

import uuid

from repositories import activity as activity_repo
from repositories import approvals as approval_repo
from repositories import channels as channels_repo
from repositories import conversations as conv_repo
from repositories import integrations as integ_repo
from repositories import messages as msg_repo

# ─────────────────────────────────────────────────────────────────────
# activity_repo (2 methods)
# ─────────────────────────────────────────────────────────────────────


async def test_activity_create_isolates_writes(two_users):
    """A's activity creation never lands in B's user_id."""
    a, b = two_users
    row = await activity_repo.create(
        user_id=a["id"],
        conversation_id=None,
        event_type="tool_call",
        event_data={"marker": "from-a"},
    )
    assert row["user_id"] == a["id"]


async def test_activity_list_for_user_excludes_other_users(two_users):
    """A's activity is invisible to B's list_for_user."""
    a, b = two_users
    await activity_repo.create(
        user_id=a["id"],
        conversation_id=None,
        event_type="tool_call",
        event_data={"marker": "secret-a"},
    )
    b_list = await activity_repo.list_for_user(b["id"], limit=100)
    assert all(item["user_id"] == b["id"] for item in b_list)
    assert not any(
        (item.get("event_data") or {}).get("marker") == "secret-a"
        for item in b_list
    )


# ─────────────────────────────────────────────────────────────────────
# channels_repo (4 methods)
# ─────────────────────────────────────────────────────────────────────


async def test_channels_get_user_for_address_returns_correct_user(two_users):
    """get_user_for_address is intentionally unscoped (it's a reverse
    lookup: external address → Orbit user). The contract is that it
    returns the EXACT owner, never a different user. Verify A's address
    resolves to A and B's address resolves to B."""
    a, b = two_users
    addr_a = f"+1555{uuid.uuid4().int % 10_000_000:07d}"
    addr_b = f"+1555{uuid.uuid4().int % 10_000_000:07d}"
    await channels_repo.upsert_verified(a["id"], "sms", addr_a)
    await channels_repo.upsert_verified(b["id"], "sms", addr_b)

    found_a = await channels_repo.get_user_for_address("sms", addr_a)
    found_b = await channels_repo.get_user_for_address("sms", addr_b)
    assert found_a is not None and found_a["user_id"] == a["id"]
    assert found_b is not None and found_b["user_id"] == b["id"]


async def test_channels_upsert_verified_isolates_writes(two_users):
    a, b = two_users
    addr = f"+1555{uuid.uuid4().int % 10_000_000:07d}"
    row = await channels_repo.upsert_verified(a["id"], "sms", addr)
    assert row["user_id"] == a["id"]
    b_channels = await channels_repo.list_for_user(b["id"])
    assert all(c["address"] != addr for c in b_channels)


async def test_channels_list_for_user_excludes_other_users(two_users):
    a, b = two_users
    addr_a = f"+1555{uuid.uuid4().int % 10_000_000:07d}"
    await channels_repo.upsert_verified(a["id"], "sms", addr_a)
    b_list = await channels_repo.list_for_user(b["id"])
    assert all(c["user_id"] == b["id"] for c in b_list)


async def test_channels_delete_refuses_foreign_owner(two_users):
    """A cannot delete B's channel via the scoped delete."""
    a, b = two_users
    addr_b = f"+1555{uuid.uuid4().int % 10_000_000:07d}"
    row = await channels_repo.upsert_verified(b["id"], "sms", addr_b)
    channel_id = row["id"]

    # A attempts to delete B's channel — must be a silent no-op (no error,
    # no rows affected — the WHERE clause excludes A).
    await channels_repo.delete(channel_id, a["id"])
    b_list = await channels_repo.list_for_user(b["id"])
    assert any(c["id"] == channel_id for c in b_list), (
        "A should NOT be able to delete B's channel"
    )


# ─────────────────────────────────────────────────────────────────────
# approval_repo (5 methods)
# ─────────────────────────────────────────────────────────────────────


async def _make_approval_for(user_dict: dict, conversation_id: str) -> dict:
    return await approval_repo.create(
        approval_id=str(uuid.uuid4()),
        user_id=user_dict["id"],
        conversation_id=conversation_id,
        run_id=f"run-{uuid.uuid4().hex[:8]}",
        session_id=conversation_id,
        tool_name="send_email",
        tool_args={"to": "x@example.com"},
        tool_call_id=f"tc-{uuid.uuid4().hex[:8]}",
        channel="web",
    )


async def test_approvals_create_isolates_writes(two_users):
    a, _ = two_users
    conv_a = await conv_repo.create(a["id"])
    approval = await _make_approval_for(a, conv_a["id"])
    assert approval["user_id"] == a["id"]


async def test_approvals_get_latest_pending_for_user_scoped(two_users):
    """A's latest pending approval is invisible to B's lookup."""
    a, b = two_users
    conv_a = await conv_repo.create(a["id"])
    await _make_approval_for(a, conv_a["id"])
    b_latest = await approval_repo.get_latest_pending_for_user(b["id"], "web")
    assert b_latest is None


async def test_approvals_get_pending_refuses_foreign_owner(two_users):
    """Even with the approval_id, B cannot fetch A's pending approval."""
    a, b = two_users
    conv_a = await conv_repo.create(a["id"])
    approval = await _make_approval_for(a, conv_a["id"])
    leaked = await approval_repo.get_pending(approval["id"], b["id"])
    assert leaked is None


async def test_approvals_resolve_is_unscoped_callers_must_check_first(two_users):
    """`resolve` is intentionally unscoped — it takes only approval_id
    and a status. Routes MUST call get_pending(approval_id, user_id)
    first to verify ownership, then call resolve. This test documents
    that contract by verifying resolve works on any approval_id (it has
    to — otherwise the route layer couldn't drive the state machine).
    The actual cross-user defense lives in routes/approve.py."""
    a, _ = two_users
    conv_a = await conv_repo.create(a["id"])
    approval = await _make_approval_for(a, conv_a["id"])
    # resolve takes no user_id — by design.
    await approval_repo.resolve(approval["id"], "approved")
    # After resolve, get_pending should not return it (status filter).
    re_fetch = await approval_repo.get_pending(approval["id"], a["id"])
    assert re_fetch is None


async def test_approvals_get_by_short_token_refuses_foreign_owner(two_users):
    """Telegram callback lookups must be scoped by user_id. Even if B
    somehow learned A's short_token (or a token collision happened
    across users), get_by_short_token(token, B) must return None."""
    a, b = two_users
    conv_a = await conv_repo.create(a["id"])
    short = f"st-{uuid.uuid4().hex[:6]}"
    await approval_repo.create(
        approval_id=str(uuid.uuid4()),
        user_id=a["id"],
        conversation_id=conv_a["id"],
        run_id=f"run-{uuid.uuid4().hex[:8]}",
        session_id=conv_a["id"],
        tool_name="send_email",
        tool_args={"to": "x@example.com"},
        tool_call_id=f"tc-{uuid.uuid4().hex[:8]}",
        channel="telegram",
        short_token=short,
    )
    # A can fetch it.
    own = await approval_repo.get_by_short_token(short, a["id"])
    assert own is not None
    # B cannot.
    leaked = await approval_repo.get_by_short_token(short, b["id"])
    assert leaked is None


# ─────────────────────────────────────────────────────────────────────
# conv_repo (7 methods)
# ─────────────────────────────────────────────────────────────────────


async def test_conversations_create_isolates_writes(two_users):
    a, _ = two_users
    conv = await conv_repo.create(a["id"])
    assert conv["user_id"] == a["id"]


async def test_conversations_get_refuses_foreign_owner(two_users):
    """A's conversation cannot be fetched by B even with the conversation_id."""
    a, b = two_users
    conv_a = await conv_repo.create(a["id"])
    leaked = await conv_repo.get(conv_a["id"], b["id"])
    assert leaked is None


async def test_conversations_list_for_user_excludes_other_users(two_users):
    a, b = two_users
    await conv_repo.create(a["id"])
    b_list = await conv_repo.list_for_user(b["id"])
    assert all(c["user_id"] == b["id"] for c in b_list)


async def test_conversations_update_title_is_unscoped_callers_must_check(
    two_users,
):
    """update_title(conversation_id, title) is unscoped at the repo —
    routes/conversations.py calls conv_repo.get(id, user_id) first to
    verify ownership before calling update_title. This test documents
    the contract: at the repo level, ANY caller with the id can update
    the title; defense lives at the route boundary."""
    a, _ = two_users
    conv_a = await conv_repo.create(a["id"])
    new_title = f"updated-{uuid.uuid4().hex[:8]}"
    updated = await conv_repo.update_title(conv_a["id"], new_title)
    assert updated is not None
    assert updated["title"] == new_title


async def test_conversations_find_by_title_scoped(two_users):
    """A's titled conversation is invisible to B's find_by_title."""
    a, b = two_users
    conv_a = await conv_repo.create(a["id"])
    title = f"isolation-target-{uuid.uuid4().hex[:8]}"
    await conv_repo.update_title(conv_a["id"], title)
    leaked = await conv_repo.find_by_title(b["id"], title)
    assert leaked is None


async def test_conversations_update_timestamp_is_unscoped_internal_only(
    two_users,
):
    """update_timestamp(conversation_id) is internal — only called from
    /api/chat after the route already authenticated the user. No
    user_id parameter exists because the caller has already proven
    ownership. Test: it operates on any id (correct behaviour for an
    internal helper)."""
    a, _ = two_users
    conv_a = await conv_repo.create(a["id"])
    # No assertion target other than "doesn't raise" — the contract is
    # "internal helper, callers responsible."
    await conv_repo.update_timestamp(conv_a["id"])


async def test_conversations_delete_refuses_foreign_owner(two_users):
    """B's delete attempt on A's conversation must be a no-op."""
    a, b = two_users
    conv_a = await conv_repo.create(a["id"])
    await conv_repo.delete(conv_a["id"], b["id"])
    still_there = await conv_repo.get(conv_a["id"], a["id"])
    assert still_there is not None, "B should NOT be able to delete A's conversation"


# ─────────────────────────────────────────────────────────────────────
# integ_repo (5 methods)
# ─────────────────────────────────────────────────────────────────────


async def test_integrations_upsert_isolates_writes(two_users):
    a, b = two_users
    await integ_repo.upsert(
        user_id=a["id"],
        provider="microsoft",
        encrypted_access_token="A-access",
        encrypted_refresh_token="A-refresh",
        token_expiry="2099-01-01T00:00:00+00:00",
        scopes=["Mail.ReadWrite"],
    )
    b_row = await integ_repo.get(b["id"], "microsoft")
    assert b_row is None


async def test_integrations_get_refuses_foreign_owner(two_users):
    a, b = two_users
    await integ_repo.upsert(
        user_id=a["id"],
        provider="microsoft",
        encrypted_access_token="A-access",
        encrypted_refresh_token="A-refresh",
        token_expiry="2099-01-01T00:00:00+00:00",
        scopes=["Mail.ReadWrite"],
    )
    leaked = await integ_repo.get(b["id"], "microsoft")
    assert leaked is None


async def test_integrations_update_tokens_refuses_foreign_owner(two_users):
    """B's update_tokens call on A's provider row affects nothing —
    the WHERE clause includes both user_id AND provider."""
    a, b = two_users
    await integ_repo.upsert(
        user_id=a["id"],
        provider="microsoft",
        encrypted_access_token="A-access",
        encrypted_refresh_token="A-refresh",
        token_expiry="2099-01-01T00:00:00+00:00",
        scopes=["Mail.ReadWrite"],
    )
    await integ_repo.update_tokens(
        user_id=b["id"],
        provider="microsoft",
        encrypted_access_token="HIJACKED",
        encrypted_refresh_token="HIJACKED",
        token_expiry="2099-01-01T00:00:00+00:00",
    )
    a_row = await integ_repo.get(a["id"], "microsoft")
    assert a_row is not None
    assert a_row["encrypted_access_token"] == "A-access"


async def test_integrations_delete_refuses_foreign_owner(two_users):
    a, b = two_users
    await integ_repo.upsert(
        user_id=a["id"],
        provider="microsoft",
        encrypted_access_token="A-access",
        encrypted_refresh_token="A-refresh",
        token_expiry="2099-01-01T00:00:00+00:00",
        scopes=["Mail.ReadWrite"],
    )
    await integ_repo.delete(b["id"], "microsoft")
    a_row = await integ_repo.get(a["id"], "microsoft")
    assert a_row is not None, "B should NOT be able to delete A's integration"


async def test_integrations_exists_returns_false_for_foreign_owner(two_users):
    a, b = two_users
    await integ_repo.upsert(
        user_id=a["id"],
        provider="microsoft",
        encrypted_access_token="A-access",
        encrypted_refresh_token="A-refresh",
        token_expiry="2099-01-01T00:00:00+00:00",
        scopes=["Mail.ReadWrite"],
    )
    assert await integ_repo.exists(a["id"], "microsoft") is True
    assert await integ_repo.exists(b["id"], "microsoft") is False


# ─────────────────────────────────────────────────────────────────────
# msg_repo (4 methods)
# ─────────────────────────────────────────────────────────────────────


async def test_messages_create_writes_with_user_id(two_users):
    a, _ = two_users
    conv_a = await conv_repo.create(a["id"])
    row = await msg_repo.create(conv_a["id"], a["id"], "user", "hello")
    assert row["user_id"] == a["id"]


async def test_messages_list_by_conversation_is_unscoped_callers_must_check(
    two_users,
):
    """list_by_conversation(conversation_id) is unscoped at the repo —
    routes/conversations.py calls conv_repo.get(id, user_id) first to
    verify the caller owns the conversation, then calls
    list_by_conversation. At the repo layer, the messages of any
    conversation are visible by id (correct for a low-level helper)."""
    a, _ = two_users
    conv_a = await conv_repo.create(a["id"])
    await msg_repo.create(conv_a["id"], a["id"], "user", "secret-a")
    rows = await msg_repo.list_by_conversation(conv_a["id"])
    assert len(rows) == 1
    assert rows[0]["content"] == "secret-a"


async def test_messages_fallback_context_is_unscoped_callers_must_check(
    two_users,
):
    """fallback_context(conversation_id) is the same trust pattern as
    list_by_conversation — callers must verify conversation ownership."""
    a, _ = two_users
    conv_a = await conv_repo.create(a["id"])
    ctx = await msg_repo.fallback_context(conv_a["id"])
    # No fallback-executed tools in a fresh conversation → empty string.
    assert ctx == ""


async def test_messages_usage_since_excludes_other_users(two_users):
    """A's token usage never appears in B's usage_since."""
    a, b = two_users
    conv_a = await conv_repo.create(a["id"])
    await msg_repo.create(
        conv_a["id"],
        a["id"],
        "assistant",
        "A's reply",
        {"metrics": {"input_tokens": 100, "output_tokens": 50, "total_tokens": 150}},
    )
    b_usage = await msg_repo.usage_since(b["id"], "1970-01-01T00:00:00+00:00")
    assert b_usage["total_tokens"] == 0
    assert b_usage["messages"] == 0


# ─────────────────────────────────────────────────────────────────────
# Coverage assertion: pin the public surface so adding a new repo
# method without a paired isolation test fails this file.
# ─────────────────────────────────────────────────────────────────────


# noinspection PyTypeChecker
def test_repository_surface_has_one_test_per_public_method():
    """Pin the public surface of every repository to the tests in this
    file. If someone adds a new public method without writing a paired
    isolation test, this fails — preventing the test suite from
    silently slipping out of date with the code."""
    import inspect

    repos = [
        ("activity", activity_repo),
        ("approvals", approval_repo),
        ("channels", channels_repo),
        ("conversations", conv_repo),
        ("integrations", integ_repo),
        ("messages", msg_repo),
    ]
    expected_total = 0
    for _name, mod in repos:
        for sym, obj in inspect.getmembers(mod):
            if sym.startswith("_"):
                continue
            if not inspect.iscoroutinefunction(obj):
                continue
            # Only count functions defined in the repo file itself, not imports.
            if getattr(obj, "__module__", "") != mod.__name__:
                continue
            expected_total += 1

    # Count tests in this module that start with test_<repo>_
    import sys

    this_mod = sys.modules[__name__]
    test_count = sum(
        1
        for name, obj in inspect.getmembers(this_mod)
        if name.startswith("test_")
        and any(
            name.startswith(f"test_{prefix}_")
            for prefix in (
                "activity",
                "approvals",
                "channels",
                "conversations",
                "integrations",
                "messages",
            )
        )
        and callable(obj)
    )
    assert test_count >= expected_total, (
        f"Repository surface has {expected_total} public methods but "
        f"only {test_count} isolation tests are paired. Add one test "
        f"per new method to keep this suite exhaustive."
    )
