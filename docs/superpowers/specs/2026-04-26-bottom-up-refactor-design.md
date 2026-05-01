# Bottom-Up Refactor + Twilio SMS Completion

**Date:** 2026-04-26
**Status:** Design — pending review

## Context

Orbit's backend grew fast through Phase 1–3. Working code, but accumulated bloat:
duplication between web and SMS approval paths, copy-pasted repository helpers,
near-identical Outlook and Google Calendar agents, dead diagnostic logging,
unused auth plugins. SMS (Twilio) is fully built on the backend but not exposed
in the UI — users can't link a phone number, so the flow is server-side only.

This pass cleans the duplication, removes the dead code, and finishes the
Twilio integration end-to-end so the user can text Orbit and get replies
(Poke-style: text-first AI assistant, proactive briefings later).

**Vision check:** SMS stays the messaging surface. iMessage paid bridges
(SendBlue, LoopMessage) aren't worth $30/mo for a personal project. The
architecture keeps `services/twilio_client.send_sms` as the swap-in seam if
that ever changes.

## Goals

1. One approval-resume code path shared by web and SMS.
2. Repository layer with shared helpers, no copy-paste.
3. Calendar agent + tools layer parameterized by provider, not duplicated.
4. OAuth start routes share their session-validation helper.
5. Frontend SSE-stream and status fetches use shared helpers.
6. Twilio: user can connect a phone number from the Hub and text Orbit.
7. Dead code removed: `_diag` logging, unused JWT plugin.

## Non-goals

- Schema migrations beyond what's needed for SMS verification (none expected —
  `channels` table already supports unverified rows).
- Frontend redesign. Existing UI stays; new modal matches existing Hub style.
- Phase 6 proactive agents (cron, daily briefings). Separate future spec.
- Switching off Twilio. iMessage bridges deferred indefinitely.
- Backend test suite. Manual verification only for this pass.

## Architecture changes

### Approval-resume path collapse

**Today:** `api/routes/approve.py` and `services/run_resume.py` each carry
their own `_build_tool_map`, `_run_tool_directly`, and fallback success-text
dict. They've already started drifting (slightly different copy). Bug-prone.

**Constraint:** The web approve route streams Agno events live through
`translate_team_stream` so users see the response typing in. SMS just needs
the final content string. We can't "collapse to one function" without
losing the web streaming UX.

**Change:** Split the duplicated logic into shared helpers, keep the two
top-level orchestrators that fit each transport.

`services/run_resume.py` becomes the single owner of the shared bits:
- `build_tool_map(user_id)` — public, used by both paths.
- `run_tool_directly(user_id, tool_name, tool_args) -> (ok, message)` —
  public, used by both paths.
- `FALLBACK_SUCCESS` dict — public constant, used by both paths.
- `resume_approval_blocking(...) -> str` — current `resume_approval`,
  renamed for clarity. SMS uses this. Returns final content string.

`api/routes/approve.py` deletes its `_build_tool_map`, `_run_tool_directly`,
`_SUCCESS_TEXTS`. Keeps its existing streaming generator but calls the
shared helpers from `run_resume`. The fallback branch (Agno session missing)
becomes a 3-line call to `run_tool_directly` instead of duplicating it.

Net result: one definition of `build_tool_map`, one fallback dict, one
`run_tool_directly`. Two orchestrators (one streaming, one blocking)
because the transports genuinely differ.

### Repository helpers

**Today:** `_to_uuid` and `_row_to_dict` defined in 6 repository files.

**Change:** New `backend/repositories/_helpers.py`:
```python
def to_uuid(val: str) -> uuid.UUID: ...
def row_to_dict(row) -> dict: ...
```
Each repository imports from `_helpers`. ~40 lines of duplication gone.

### Calendar agent factory

**Today:** `agents/calendar_agent.py` and `agents/google_calendar_agent.py`
are 95% identical (same name, model, instructions modulo "Outlook" vs "Google").

**Change:** Single `agents/calendar_agent.py` exposes
`create_calendar_agent(tools, provider="outlook")`. The provider name flows
into one line of the instructions ("Outlook calendar" / "Google Calendar").
`agent_factory.py` picks `provider="google"` when google is connected.
Delete `agents/google_calendar_agent.py`.

Tools layer (`tools/calendar.py` and `tools/google_calendar.py`) stays
separate — they wrap genuinely different APIs. Just keep the JSON output
shape consistent so the agent doesn't need provider-specific logic.

### OAuth start helper

**Today:** Microsoft and Google `_auth_start` routes both inline a raw SQL
session lookup against the `sessions` table because they accept the bearer
token via query param (browser redirect can't set headers).

**Change:** New helper in `api/deps.py`:
```python
async def get_user_from_query_token(authorization: str) -> dict
```
Same return shape as `get_current_user`. Both OAuth routes call it.

### Frontend SSE wrapper

**Today:** `lib/api.ts` has two near-identical functions (`sendChatMessage`,
`approveAction`) that each wrap `fetch` → `ReadableStream` with the same
30 lines of error handling and AbortController plumbing.

**Change:** Internal `streamFromFetch(url, body, token, signal?)` helper.
Both public functions become 5-line wrappers around it.

### Settings page status fetches

**Today:** Settings page does inline `fetch` for `/api/auth/microsoft/status`
and `/api/auth/google/status`.

**Change:** Add `fetchMicrosoftStatus(token)` and `fetchGoogleStatus(token)`
to `lib/api.ts`, using existing `safeFetch`. Settings imports them.

### Dead code removal

- `_diag()` and `/tmp/orbit-approve-diag.log` writes in `approve.py` —
  the bug they diagnosed is fixed (Architecture log 2026-04-25).
- `jwt()` plugin in `frontend/src/lib/auth.ts` — backend validates sessions
  via DB lookup, never reads JWT. The `jwks` table can stay (zero cost,
  keeps Drizzle schema stable) but the plugin import goes.

## Twilio SMS completion

### New backend endpoints

**`POST /api/channels/sms/start`**
- Authenticated via `get_current_user`.
- Body: `{phone: string}` (E.164 format).
- Generates a 6-digit code, stores in Redis with TTL=600s under
  `sms_verify:{user_id}:{phone}` (falls back to in-memory dict like the
  existing OAuth state store).
- Sends SMS via `twilio_client.send_sms(phone, "Your Orbit code: {code}")`.
- Returns `{status: "sent"}`.

**`POST /api/channels/sms/verify`**
- Authenticated.
- Body: `{phone: string, code: string}`.
- Checks Redis for matching code, deletes on success.
- Calls `channels_repo.upsert_verified(user_id, "sms", phone)`.
- Returns `{status: "verified"}`.

**`DELETE /api/channels/sms`**
- Authenticated.
- Body: `{phone: string}`.
- Calls `channels_repo.delete_by_address(user_id, "sms", phone)`.
- Returns `{status: "removed"}`.

`channels_repo` needs a small addition: `delete_by_address(user_id, type, address)`.

**`GET /api/channels`**
- Authenticated.
- Returns `[{id, type, address, verified, verified_at}]` for the user.
- Used by Hub to show whether SMS is already linked.

### Frontend additions

**`lib/api.ts`** — new:
- `startSmsVerification(phone, token)`
- `verifySmsCode(phone, code, token)`
- `removeSmsChannel(phone, token)`
- `fetchChannels(token)`

**Hub page (`app/(dashboard)/hub/page.tsx`):**
- Remove `"twilio"` from `COMING_SOON` set.
- Twilio card status: `connected` if user has a verified SMS channel,
  else `available`.
- Click opens new SMS connect flow modal (variant of `ConnectModal`).

**`components/hub/sms-connect-modal.tsx`** — new component:
- Two-step: phone entry → code entry.
- Validation: E.164 format on phone, 6-digit numeric on code.
- Error states: invalid phone, code mismatch, code expired.
- Disconnect button on connected state.

**`stores/auth-store.ts`:**
- New field `smsChannel: {phone: string} | null`.
- `setSmsChannel(channel)` setter.
- `auth-provider.tsx` fetches `/api/channels` on session load, sets the SMS
  channel if present.

## Build sequence

1. **Repository helpers** — extract `_helpers.py`, update 6 imports. Run
   `python -m compileall backend/` to confirm imports resolve. Hit a
   couple of routes manually (`GET /api/conversations`) to confirm shape
   unchanged.
2. **Approval-resume collapse** — extend `run_resume.resume_approval` with
   optional streaming, rewrite `approve.py` to call it, delete the duplicates.
   Test: web approval still streams, fallback path still fires when Agno
   session missing.
3. **Calendar agent factory** — merge two agent files into one, update
   `agent_factory.py` import. Test: existing calendar query in chat still
   routes correctly (Google when connected, Outlook fallback).
4. **OAuth start helper** — extract `get_user_from_query_token`, update
   both OAuth routes. Test: connect/disconnect Microsoft from Hub still works.
5. **Dead code removal** — delete `_diag` from `approve.py`, remove `jwt()`
   plugin import from `auth.ts`.
6. **Frontend SSE wrapper** — extract helper, rewrite the two public
   functions. Test: chat streams, approval streams.
7. **Settings status helpers** — add to `api.ts`, swap settings page.
   Test: integration dots still update on session load.
8. **Twilio backend endpoints** — implement the four new routes + repo
   addition. Manual test with curl: start → verify → channel exists.
9. **Twilio frontend** — new modal + Hub wiring + auth store field. Manual
   test: enter phone, receive SMS, type code, see "connected" state.
10. **End-to-end test** — text the connected phone with "what's on my
    calendar today" and confirm a reply lands. (Blocked on Twilio toll-free
    verification per existing STATUS notes — code path is the only thing
    we can verify until that clears.)

## Risk + rollback

- Each step is isolated; one bad step leaves the rest of the system working.
- No schema migrations needed. The `channels` table already supports the new
  flow, and `pending_approvals` already has the `channel` column.
- Approval-resume collapse is the highest-risk change. Mitigation: keep the
  fallback path in `run_resume.py` exactly as written — it's the safety net.
  Rollback is a single-file revert of `approve.py` if anything breaks.

## Verification checklist

After all steps:
- [ ] Chat works (existing flow, no regressions).
- [ ] Approval card on a write tool resolves through web — happy path.
- [ ] Approval fallback still fires if Agno session is missing (kill backend
      mid-pause to simulate).
- [ ] Calendar query routes to Google when connected, Outlook otherwise.
- [ ] Microsoft + Google connect/disconnect from Hub.
- [ ] SMS connect from Hub: phone → code → verified.
- [ ] Inbound SMS from a verified phone runs the agent and replies (gated by
      Twilio TFV approval — code path verified by simulating webhook locally).
- [ ] No new files in `/tmp` after running the backend.
- [ ] No `jwt()` import in frontend; auth still works.
