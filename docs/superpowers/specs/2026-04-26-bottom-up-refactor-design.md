# Bottom-Up Refactor + Twilio SMS Completion + Hardcoded-Constants Audit

**Date:** 2026-04-26
**Status:** Design — pending review
**Revision:** v2 (incorporates critique on fallback semantics, SMS code storage,
inbound webhook coverage, jwks decision, calendar diff, verification rigor,
iMessage path, hardcoded-constants audit)

## Context

Orbit's backend grew through Phase 1–3 with working code that has accumulated:
duplication between web and SMS approval paths, copy-pasted repository helpers,
near-identical Outlook/Google Calendar agents, dead diagnostic logging, an
unused JWT plugin, ~15 hardcoded constants scattered across files, and an
in-memory band-aid pattern that was about to be extended to a second use case.

This pass does the cleanup, finishes the Twilio integration end-to-end, and
addresses each of those structural issues honestly. **No band-aids promoted to
public APIs. No abstractions invented to paper over real boundaries. No
"working but not verified" code shipped.**

**Vision:** SMS-first AI assistant (Poke-style). Built on Twilio because it
works on every phone and is free at our scale. iMessage support documented
as a provider-swap path (`services/messaging.py` interface) for if/when we
decide to pay for SendBlue.

## Goals

1. One approval-resume code path for shared logic; two transport orchestrators
   (streaming web, blocking SMS) because the transports genuinely differ.
2. Repository layer with shared helpers, zero copy-paste.
3. Calendar agent + tools layer parameterized by provider, not duplicated.
4. OAuth start routes share their query-token session-validation helper.
5. Frontend SSE-stream and status fetches use shared helpers.
6. Twilio: user can connect a phone number from the Hub, type a code, see
   verified state. Inbound webhook verified end-to-end via Twilio trial number
   before the feature is considered done.
7. All hardcoded constants either move to `config.py` (env-overridable) or
   to `backend/constants.py` (named, documented, single-sourced).
8. Fallback acknowledgement reframed as honest mechanical ack, not pretend
   agent voice. Tech-debt entry created for root-causing the fallback path
   itself.
9. Provider-agnostic messaging interface (`services/messaging.py`) so the
   Twilio→SendBlue swap is a one-file PR if we ever decide to pay for iMessage.
10. Dead code removed: `_diag` logging, unused JWT plugin, `jwks` table.

## Non-goals

- Schema changes beyond:
  - `verifications` table reuse for SMS codes (already exists, just new identifier prefix).
  - `jwks` table dropped.
- Frontend redesign. Existing UI stays; new modal matches existing Hub style.
- Phase 6 proactive agents (cron, daily briefings). Separate future spec.
- Building SendBlue/iMessage integration. Documented as provider-swap path only.
- Fixing the underlying Agno paused-run-resume reliability (logged as tech debt;
  the fallback exists for that reason and stays in place).
- Backend test suite. Manual + curl verification only for this pass.

## Architecture changes

### 1. Hardcoded-constants audit

Inventory of values currently scattered across files, with the proposed home for each:

| Value | Current location | Move to |
|---|---|---|
| `claude-sonnet-4-6` (5 places) | `agents/*.py`, `orchestrator.py` | `constants.py: PRIMARY_MODEL` |
| `claude-haiku-4-5-20251001` | `conversation_titler.py` | `constants.py: TITLER_MODEL` |
| `num_history_runs=5` | `orchestrator.py` | `constants.py: AGNO_HISTORY_RUNS` |
| `_INPUT_COST_PER_MTOK = 3.0` / `15.0` | `routes/usage.py` | `constants.py: INPUT_COST_PER_MTOK`, `OUTPUT_COST_PER_MTOK` |
| `"America/New_York"` (2 places) | `tools/calendar.py`, `tools/google_calendar.py` | `config.py: default_timezone` (env-overridable) |
| `_REFRESH_BUFFER_SECONDS = 300` (2 places) | `token_manager.py`, `google_token_manager.py` | `constants.py: TOKEN_REFRESH_BUFFER_SECONDS` |
| `_MAX_REPLY_CHARS = 1000` | `sms_dispatch.py` | `constants.py: SMS_MAX_REPLY_CHARS` |
| `max_requests=30, window=60` | `redis.py` | `constants.py: RATE_LIMIT_REQUESTS`, `RATE_LIMIT_WINDOW_SECONDS` |
| `ex=600` (OAuth state TTL, 3 places) | `redis.py` | `constants.py: OAUTH_STATE_TTL_SECONDS` |
| `INTERVAL '15 minutes'` | `repositories/approvals.py` | `constants.py: PENDING_APPROVAL_TTL_MINUTES` (interpolated into SQL via parameter) |
| Affirmative/negative SMS vocab | `sms_dispatch.py` | Keep where used (single consumer). Document why. |
| Attachment text-truncate `8000` | `tools/email.py` | `constants.py: EMAIL_ATTACHMENT_MAX_CHARS` |
| Default folder/calendar `"primary"` | `tools/google_calendar.py` | Keep — Google API convention, not Orbit policy. |
| `claude-sonnet-4-6` pricing assumption | implicit in `usage.py` | Add `MODEL_PRICING: dict[str, tuple[float, float]]` — `(input, output)` per million tokens. Future-proofs for Haiku tracking. |

Two new files:
- `backend/constants.py` — pure-Python module. No imports from `config.py`.
  Documented constants only. Kept short.
- Existing `config.py` gets `default_timezone: str = "America/New_York"` —
  env-overridable for users in other zones.

The vocabulary lists (`_AFFIRMATIVE`, `_NEGATIVE`) stay in `sms_dispatch.py`
because they have one consumer and moving them to constants pollutes a shared
file with domain-specific data. Documented with a comment.

### 2. Fallback acknowledgement redesign

**Today:**
```python
_FALLBACK_SUCCESS = {
    "send_email": "Sent the email.",
    "create_event": "Event created on your calendar.",
    ...
}
```
The system pretends to be the agent ("Sent the email.") on a path that the
agent didn't actually traverse. Promoting this dict to a public constant
institutionalizes the lie.

**Change:**
1. Replace the per-tool dict with a single mechanical formatter:
   ```python
   def fallback_ack(tool_name: str) -> str:
       return f"Done — {tool_name.replace('_', ' ')}. (System acknowledgement.)"
   ```
2. The "(System acknowledgement.)" suffix makes the fallback honest: this
   message did not come from the agent. Mild visual cost in chat; large
   trust gain — the message no longer impersonates.
3. Rename the function: `run_tool_directly` returns `(ok, ack_message)`,
   not `(ok, success_message)`. Variable names match reality.
4. Add a tech-debt note in `services/run_resume.py` docstring linking to
   the architecture log entry where the underlying flakiness is documented.

**Counter-argument considered:** "The user shouldn't see system internals."
Response: they shouldn't see implementation details, but they should know
when the agent's voice and the system's voice differ. A 22-character suffix
is the lightest possible disclosure.

If you'd rather keep the fallback messages indistinguishable from the agent,
that's a deliberate choice but it stays a known lie. Documented either way.

### 3. SMS verification code storage

**Today (would have been):** in-memory dict `_sms_verify_codes: dict[str, str]`
plus optional Redis. Breaks on restart. Adds a second consumer of the bad
pattern from `redis.py`.

**Change:** Use Postgres via the existing `verifications` table from Better Auth.
- Identifier: `f"sms-verify:{user_id}:{phone}"`
- Value: 6-digit code (we don't need to hash for a 10-min-TTL ephemeral code,
  but we will anyway for consistency).
- ExpiresAt: `now + 10 minutes`.
- After successful verify: row deleted.
- Schema reuse, no migration needed.

New repository: `backend/repositories/verifications.py` — `create`, `get`, `delete`.
Pure SQL, ~30 lines.

The in-memory `_oauth_states` and `_oauth_pkce` fallbacks in `redis.py` are
left as-is for this pass (their consumers are pre-existing and the fallback
is documented). But they're added to the tech-debt log: a `verifications`-table
or dedicated table approach would replace them too in a future pass.

### 4. Approval-resume helpers (revised)

**Constraint:** Web approve route streams Agno events live through
`translate_team_stream` for the typing-indicator UX. SMS just needs the
final string. We don't collapse to one function — we share helpers.

**Change:** `services/run_resume.py` exposes shared building blocks:
- `build_tool_map(user_id)` — public.
- `run_tool_directly(user_id, tool_name, tool_args) -> (ok, ack_message)` — public.
- `fallback_ack(tool_name)` — public, the new honest formatter.
- `resume_approval(...) -> str` — blocking orchestrator, used by SMS.

`api/routes/approve.py` deletes its `_build_tool_map`, `_run_tool_directly`,
`_SUCCESS_TEXTS`. Keeps its streaming generator, but the fallback branch
becomes a 3-line call to `run_tool_directly` from the shared module.

Net: one definition each. Two top-level orchestrators because their
transports genuinely differ.

### 5. Repository helpers

`backend/repositories/_helpers.py` (or `__init__.py` if we want it on the
package):
```python
import uuid
def to_uuid(val): return uuid.UUID(val) if isinstance(val, str) else val
def row_to_dict(row): ...
```
Each repository imports from `_helpers`. ~40 lines of duplication gone.

### 6. Calendar agent factory

**Verified diff** (line-by-line, May 1):

The two files differ on exactly one sentence. `calendar_agent.py` includes
"Extra tool calls just slow things down." on the create-event-directly bullet;
`google_calendar_agent.py` omits it. The guidance applies regardless of
provider, so the factory will include it for both.

**Change:** Single `agents/calendar_agent.py`:
```python
def create_calendar_agent(tools: list, provider: str = "outlook") -> Agent:
    label = "Outlook calendar" if provider == "outlook" else "Google Calendar"
    return Agent(
        name="Calendar Agent",
        model=Claude(id=PRIMARY_MODEL),
        tools=tools,
        instructions=[f"You handle the user's {label} ...", ...],
        ...
    )
```
`agent_factory.py` picks `provider="google"` when google is connected.
Delete `agents/google_calendar_agent.py`.

Tools layer (`tools/calendar.py` and `tools/google_calendar.py`) stays
separate because they wrap genuinely different APIs. They will be audited to
ensure the JSON output shape is identical (same keys, same types) so the
agent doesn't need provider-specific logic. Specifically:
- Both should return `{id, summary, start, end, location, attendees, is_all_day}`
  for list-type calls.
- Both should return that plus `{description, organizer}` for get-type calls.
- Outlook's `web_link` and Google's `html_link` get unified to `web_link`.

If the audit finds shape drift, document it in this spec before merging.

### 7. OAuth start helper

**Today:** Microsoft and Google `_auth_start` routes both inline a raw SQL
session lookup against the `sessions` table because they accept the bearer
token via query param (browser redirect can't set headers).

**Change:** New helper in `api/deps.py`:
```python
async def get_user_from_query_token(authorization: str) -> dict
```
Same return shape as `get_current_user`. Both OAuth routes call it.

### 8. Provider-agnostic messaging interface

**Today:** `services/twilio_client.py` directly exposes `send_sms`, `validate_request`,
`is_configured`. Callers (`sms_dispatch`, the new SMS verification routes) import
from `twilio_client` directly. If we ever swap to SendBlue, every caller changes.

**Change:** New `services/messaging.py`:
```python
class MessagingProvider(Protocol):
    async def send(self, to: str, body: str) -> str: ...      # returns provider message id
    def validate_inbound(self, url, params, signature) -> bool: ...
    def is_configured(self) -> bool: ...

def get_provider() -> MessagingProvider:
    """Return the configured messaging provider. Today: Twilio. Tomorrow: SendBlue."""
```
Callers import `get_provider()`. Twilio implementation stays in
`services/twilio_client.py` but becomes an internal detail.

This isn't speculative abstraction — it's drawing the seam where the real
boundary is (provider replacement). Inside Twilio there's no SMS-vs-iMessage
distinction. Across providers there is.

### 9. Frontend SSE wrapper

**Today:** `lib/api.ts` has two near-identical functions (`sendChatMessage`,
`approveAction`) that each wrap `fetch` → `ReadableStream` with the same
30 lines.

**Change:** Internal `streamFromFetch(url, body, token, signal?)` helper.
Both public functions become 5-line wrappers around it.

### 10. Settings page status fetches

**Today:** Settings page does inline `fetch` for `/api/auth/microsoft/status`
and `/api/auth/google/status`.

**Change:** Add `fetchMicrosoftStatus(token)` and `fetchGoogleStatus(token)`
to `lib/api.ts`, using existing `safeFetch`. Settings imports them.

### 11. Dead code removal (decisive)

- **`_diag()` and `/tmp/orbit-approve-diag.log`** — delete. The bug it
  diagnosed (run_id mismatch) was fixed weeks ago per the architecture log.
- **`jwt()` plugin in `frontend/src/lib/auth.ts`** — delete the import +
  plugin entry.
- **`jwks` table in `frontend/src/db/schema.ts`** — delete the `pgTable`
  declaration.
- **`jwks` import in `lib/auth.ts`** — delete.
- **`drizzle-kit push`** to drop the `jwks` table from the database.

If we ever want JWT-based stateless auth back, we restore the plugin and
add the table fresh. Drizzle handles drops/adds cleanly.

## Twilio SMS completion

### Inbound webhook (already built — verification additions only)

`api/routes/sms.py` and `services/sms_dispatch.py` are already implemented.
Spec adds these verification gates before considering the feature complete:

1. Twilio signature validation works through the configured tunnel (curl with
   bad signature → 403).
2. Unknown From-number → "open Orbit web app to link this number" reply.
3. Verified From-number, fresh message → orchestrator runs, reply sent.
4. Verified From-number, write tool → SMS preview + "Reply YES/NO".
5. YES reply → tool executes, confirmation SMS.
6. NO reply → "Got it, not doing that." SMS.
7. End-to-end with Twilio trial number, not just simulated webhook.

If any gate fails, the underlying issue gets documented and either fixed in
this pass or logged as tech debt.

### New backend endpoints

**`POST /api/channels/sms/start`**
- Auth: `get_current_user`.
- Body: `{phone: string}` (E.164).
- Generates 6-digit code, writes `verifications` row (10-min TTL).
- Sends SMS via `messaging.get_provider().send(...)`.
- Returns `{status: "sent"}`.

**`POST /api/channels/sms/verify`**
- Auth.
- Body: `{phone: string, code: string}`.
- Loads verification row, compares, deletes on success.
- Calls `channels_repo.upsert_verified(user_id, "sms", phone)`.
- Returns `{status: "verified"}`.

**`DELETE /api/channels/sms`**
- Auth.
- Body: `{phone: string}`.
- Calls `channels_repo.delete_by_address(user_id, "sms", phone)`.
- Returns `{status: "removed"}`.

**`GET /api/channels`**
- Auth.
- Returns `[{id, type, address, verified, verified_at}]` for the user.
- Used by Hub + auth-provider to populate connection state.

`channels_repo` adds: `delete_by_address(user_id, type, address)`.

### Frontend additions

`lib/api.ts` — new:
- `startSmsVerification(phone, token)`
- `verifySmsCode(phone, code, token)`
- `removeSmsChannel(phone, token)`
- `fetchChannels(token)`

Hub page (`app/(dashboard)/hub/page.tsx`):
- Remove `"twilio"` from `COMING_SOON`.
- Twilio status: `connected` if `smsChannel` is non-null, else `available`.
- Click opens new SMS connect modal.

`components/hub/sms-connect-modal.tsx` — new:
- Two-step: phone entry → code entry.
- Validation: E.164 on phone, 6 digits on code.
- Error states: invalid phone, code mismatch, expired code, send failure.
- Disconnect button on connected state.

`stores/auth-store.ts`:
- New field: `smsChannel: {phone: string} | null`.
- Setter: `setSmsChannel`.
- `auth-provider.tsx` fetches `/api/channels` on session load alongside
  Microsoft/Google status; sets `smsChannel` if present.

## iMessage path (decision documented, not built)

**Decision:** Build on Twilio, keep `services/messaging.py` provider-pluggable.
Don't pay for SendBlue today.

**Why:** Twilio works for everyone, costs nothing for development volume.
SendBlue is $30–50/mo for blue bubbles only on iPhones. For a personal
project (or even an early portfolio piece), the user-perceived gap doesn't
clear that monthly bar.

**Swap path if revisited:** New `services/messaging_sendblue.py` implementing
the `MessagingProvider` protocol. Change `get_provider()` to return it.
Update inbound webhook signature validation to SendBlue's scheme. ~1 day
of work, isolated to one directory.

**Note for the user:** Poke (interaction.co) is iMessage-first and runs
their own Mac fleet for delivery. We can't replicate that on a Linux VPS.
Closest match without owning a Mac is SendBlue. If you ever want exact-Poke
UX, the architecture won't fight you.

## Build sequence

Each step ends with a verification command. If any verification fails, stop
and either fix or roll back before proceeding.

1. **Hardcoded constants → `constants.py` + `config.py`.**
   - Verify: `python -c "from constants import PRIMARY_MODEL; print(PRIMARY_MODEL)"`
   - Verify: backend boots, chat round-trip works.
2. **Repository helpers** — extract `_helpers.py`, update 6 imports.
   - Verify: `python -m compileall backend/repositories/`
   - Verify: `GET /api/conversations` returns same shape.
3. **Approval-resume helpers** — move shared bits to `run_resume.py`,
   delete duplicates from `approve.py`. Implement `fallback_ack`.
   - Verify: web approval happy path streams.
   - Verify: web approval fallback fires when Agno session missing
     (kill backend mid-pause to simulate; expect `(System acknowledgement.)`
     suffix).
4. **Calendar agent factory** — merge two agent files. Audit and unify
   tool JSON shapes.
   - Verify: calendar query routes to Google when connected, Outlook otherwise.
   - Verify: agent doesn't break on either backend.
5. **OAuth helper** — extract `get_user_from_query_token`.
   - Verify: connect/disconnect Microsoft + Google from Hub.
6. **Provider-agnostic messaging interface** — create `services/messaging.py`,
   move Twilio details behind it. Update existing inbound webhook + SMS
   dispatch to use `get_provider()`.
   - Verify: existing SMS round-trip still works (simulated webhook).
7. **Dead code removal** — `_diag` from `approve.py`, `jwt()` plugin,
   `jwks` table.
   - Verify: `git grep _diag` returns nothing.
   - Verify: `npx drizzle-kit push` cleanly drops the table.
   - Verify: chat works (auth still functional).
8. **Frontend SSE wrapper** — extract helper.
   - Verify: chat streams + approval streams both work.
9. **Settings status helpers** — add to `api.ts`, swap settings page.
   - Verify: integration dots update correctly on session load.
10. **SMS verification backend** — `verifications` repository, four channel
    endpoints, repo `delete_by_address` addition.
    - Verify (curl):
      - `POST /api/channels/sms/start` with valid phone → 200 + SMS arrives.
      - `POST /api/channels/sms/verify` with correct code → channel row exists.
      - `POST /api/channels/sms/verify` with wrong code → 400, no row.
      - Code expires after 10 min → 400 on verify.
      - `DELETE /api/channels/sms` → channel row gone.
11. **SMS verification frontend** — modal + Hub wiring + auth store field.
    - Verify: enter phone, receive SMS, type code, see "connected".
12. **End-to-end SMS round trip with Twilio trial number.**
    - Verify (gates from "Inbound webhook" section above): all 7 pass.
    - If TFV blocks production webhook URL, use ngrok-loopback simulation
      to confirm the code path, then run trial-number test once TFV clears.
      The merge gate is: code path verified locally + a documented plan
      for the post-TFV trial-number test.
13. **Tech-debt log** — append to `docs/ARCHITECTURE_CHANGES.md`:
    - Fallback path reliability (root-cause Agno session retention).
    - `_oauth_states` / `_oauth_pkce` in-memory fallbacks (move to DB or
      require Redis in production).

## Risk + rollback

- Each step is isolated; a bad step leaves the rest of the system working.
- Schema impact: `jwks` dropped (Drizzle handles), `verifications` reused
  (no schema change). No data loss.
- Approval-resume change is highest-risk. Mitigation: the fallback path in
  `run_resume.py` is the safety net and stays intact. Rollback is a
  single-file revert of `approve.py`.
- Constants extraction is mechanically risky (rename storms). Mitigation:
  one constant per commit during step 1, each with a quick smoke test.

## Verification checklist (full pass — all must clear before merge)

**Cleanup:**
- [ ] `git grep _diag backend/` returns nothing.
- [ ] `git grep "America/New_York" backend/` returns nothing outside `config.py`.
- [ ] `git grep "claude-sonnet-4-6" backend/` returns nothing outside `constants.py`.
- [ ] `git grep "FALLBACK_SUCCESS\|_SUCCESS_TEXTS" backend/` returns nothing.
- [ ] `git grep "_to_uuid\|def _row_to_dict" backend/repositories/` returns
      results only in `_helpers.py`.
- [ ] `git grep jwt frontend/src/lib/auth.ts` returns nothing.
- [ ] `jwks` table not in schema; not in database (verify with
      `psql -c "\dt jwks"`).

**Functional:**
- [ ] Chat works (existing flow, no regressions).
- [ ] Approval card on a write tool resolves through web — happy path.
- [ ] Approval fallback fires if Agno session missing; ack message includes
      the "(System acknowledgement.)" disclosure.
- [ ] Calendar query routes to Google when connected, Outlook otherwise;
      both backends return the same JSON shape.
- [ ] Microsoft + Google connect/disconnect from Hub.
- [ ] SMS connect from Hub: phone → code → verified.
- [ ] Wrong code → error visible to user, no channel row created.
- [ ] Inbound SMS from a verified phone runs the agent and replies (Twilio
      trial number round trip; ngrok-loopback acceptable as gate before TFV).
- [ ] Inbound SMS from unknown number → "link this number" reply.
- [ ] Inbound SMS write tool → preview + YES/NO; YES executes, NO declines.
- [ ] No new files in `/tmp` after running the backend through a full session.

**Tech debt logged (not fixed, just acknowledged):**
- [ ] `docs/ARCHITECTURE_CHANGES.md` entry for fallback root-causing.
- [ ] `docs/ARCHITECTURE_CHANGES.md` entry for `_oauth_states` / `_oauth_pkce`
      durability.
