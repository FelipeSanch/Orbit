# Architecture Changes Log

Running log of non-trivial architectural decisions and refactors. Bug fixes and UI tweaks live in `STATUS.md`; this file captures changes that affect how the system is wired together.

---

## 2026-05-21 — Telegram replaces SMS as the second surface

**Pivot**
The Twilio/SMS path (see 2026-04-26 entry below) was killed before going live. Twilio toll-free verification is a 1–2 business-day gate per number, SMS replies are constrained to plain-text YES/NO (160-char segments, no rich buttons), and the dispatch was burning per-message billing. Telegram is permissionless, free, supports inline-keyboard approval buttons, and has slash-command primitives — strictly better UX for the second-surface use case.

**Change**
- `backend/services/telegram_client.py` — httpx wrapper around the Bot API (no `python-telegram-bot` dep). Module-level bot-username cache warmed in lifespan.
- `backend/services/telegram_dispatch.py` — mirror of the deleted `sms_dispatch.py` (recoverable via `git show 5de2916:backend/services/sms_dispatch.py`). `handle_inbound_message` and `handle_callback_query`. Inline-keyboard `✅ Send / ❌ Reject` buttons replace the YES/NO text protocol.
- `backend/api/routes/telegram.py` — `POST /api/webhooks/telegram/inbound` (header-verified via `X-Telegram-Bot-Api-Secret-Token`, `BackgroundTasks` dispatch, 200 fast) + `POST/GET/DELETE /api/channels/telegram[/pair|/status]`.
- `backend/services/redis.py` — added `set_pairing_code` / `pop_pairing_code` with single-use semantics (atomic GET-then-DELETE on Upstash; pop on the in-memory dict for local dev).
- `backend/scripts/setup_telegram_webhook.py` — `--url`, `--delete`, `--info` CLI for registering the webhook with Telegram (needs to be rerun whenever the ngrok URL rotates).

**Schema change**
Added `pending_approvals.short_token TEXT UNIQUE`. Telegram callback_data is capped at 64 bytes and our `approval_id` is a 36-char UUID — wouldn't fit cleanly alongside an action prefix. The dispatch generates an 8-char `secrets.token_urlsafe(6)` token at approval creation and the callback (`a:<short>` / `r:<short>`) looks it up scoped by `user_id`. Drizzle-pushed.

**Pairing flow**
1. Hub UI calls `POST /api/channels/telegram/pair` → backend generates a 6-digit code, stores `{telegram:pair:<code> → user_id}` in Redis with 10-min TTL, returns `{code, bot_username, deeplink}`.
2. User taps the `t.me/<bot>?start=<code>` deeplink (or sends `/start <code>` manually).
3. Webhook receives `/start`, dispatch calls `redis.pop_pairing_code('telegram', code)` (atomic), upserts the channel binding (`type='telegram', address=<chat_id>`), replies with confirmation.
4. Hub polls `/api/channels/telegram/status` every 2s for 10 minutes; flips to Connected when the binding lands.

**Approval round-trip**
- Free text → `team.arun(stream=False)` → if `status == 'paused'`, persist `pending_approvals` with `channel='telegram'` + `short_token`, send a one-line preview with the inline keyboard.
- Button tap → `handle_callback_query` answers the callback (15s ack window), looks up the approval by `short_token` scoped to `user_id`, resolves it, strips the keyboard via `editMessageReplyMarkup`, calls `services/run_resume.resume_approval` (shared with the web approve route — both happy-path and direct-tool-fallback return a single string), and sends the result back through `send_message`. The Telegram channel acts as a peer surface: the response always returns through the channel the user used, never silently into the web SSE.

**Files removed / renamed**
- `backend/services/twilio_client.py`, `backend/services/sms_dispatch.py`, `backend/api/routes/sms.py` — deleted in commit `60e68c4`.
- `pending_approvals.channel` now takes `'web'` or `'telegram'`. `'sms'` values are still readable by the schema but no longer written.

---

## 2026-04-21 — Agno session persistence + streaming approval flow

**Problem**
Approval clicks wrote `status="approved"` to the DB but never resumed the agent. Write operations (send_email, create_event, etc.) never actually executed after user approval.

**Root cause**
1. Team was constructed without a `db=...` — Agno had no way to persist paused runs across HTTP requests.
2. `POST /api/chat/approve` was a fire-and-forget REST endpoint that updated a status column and returned JSON. No mechanism resumed `team.acontinue_run()`.

**Change**
- New file `backend/services/agno_db.py` exposes `get_agno_db()` — a singleton `AsyncPostgresDb(db_schema="agno")` bound to the same Neon instance as our app tables. Converts `postgresql://` URLs to `postgresql+asyncpg://` for SQLAlchemy async.
- `backend/agents/orchestrator.py` now passes `db=get_agno_db()` to the Team. Paused runs, session history, and user memories all persist to the `agno` schema on Neon.
- `backend/api/routes/approve.py` rewritten from JSON → SSE streaming:
  1. Validates approval exists and marks its status in `pending_approvals`
  2. Rebuilds the team for the same `user_id` + `session_id`
  3. `team.aget_session()` loads the paused session
  4. Finds the paused run and the requirement whose `tool_execution.tool_call_id` matches the approval
  5. Calls `req.confirm()` / `req.reject()` on that one requirement
  6. `team.acontinue_run(run_id, session_id, requirements=[...], stream=True, stream_events=True)` resumes the agent
  7. Continuation events flow back through `translate_team_stream()` — the same SSE protocol as `/api/chat`
- Frontend `approveAction()` now returns a `ReadableStream` (not a `Promise<JSON>`). The chat panel feeds it through the same `useSSE` hook as the chat endpoint.

**Schema change**
Added `pending_approvals.session_id TEXT` (non-null, default `""`). Required so the approve endpoint knows which Agno session to resume. Pushed via `drizzle-kit push`.

**Implications**
- Two Postgres schemas on the same Neon database: `public` (our tables) and `agno` (Agno's session/memory/approval storage). Agno auto-creates its tables on first boot.
- `session_id` now has dual meaning: (1) our client-generated ID, (2) Agno's session key. The two are the same value and carry the user across the full HITL loop.
- Every write tool's approval fires one SSE stream, one `acontinue_run`, one new `RunCompletedEvent` — all using the original `run_id`. Metrics on the continuation accrue to the original run.

**What this enables**
- HITL write actions actually execute after approval
- User memory persists across conversations (`update_memory_on_run=True` also landed)
- Conversation history is backed by real Agno sessions, not just our `messages` table

---

## 2026-04-22 — Google Calendar integration (parallel to Outlook)

**Decision**
Support both Microsoft and Google calendars per-user. Route calendar work to Google if connected; fall back to Outlook. Email and tasks always use Microsoft. Mixed stack is fine — Duke assigns Microsoft for email, user prefers Google Calendar UX.

**Backend additions**
- `config.py` — new settings `google_client_id`, `google_client_secret`, `google_redirect_uri`.
- `services/google_token_manager.py` — parallel to `token_manager.py`. Uses `google-auth-oauthlib` + `google.oauth2.credentials`. Same in-memory-cache pattern (5-minute refresh buffer, skip network call when stored token is fresh).
- `tools/google_calendar.py` — `list_events`, `get_event`, `create_event`, `update_event`, `delete_event`. Same `requires_confirmation=True` semantics on writes. Uses `googleapiclient.discovery.build("calendar", "v3", credentials=creds)`. Handles RFC3339 + IANA timezones via `ZoneInfo`.
- `agents/google_calendar_agent.py` — specialist with the same instructions as the Outlook calendar agent, just points at the Google tools.
- `api/routes/google_oauth.py` — `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/google/status`, `DELETE /api/auth/google`. Same shape as the Microsoft equivalents, reusing Redis OAuth-state + `integrations` table with `provider='google'`.
- `services/agent_factory.py` — per-request choice: `await google_token_manager.is_connected(user_id)` → use Google tools/agent, else Outlook. Team construction unchanged otherwise.

**No schema change**
The `integrations` table already has a `provider` column and a `(user_id, provider)` unique index. Google rows just use `provider='google'`. That's why we don't need a new migration.

**Frontend additions**
- `auth-store.ts` — `isGoogleConnected` + `setGoogleConnected`, same shape as Microsoft.
- `auth-provider.tsx` — on session load, fetches both `/api/auth/microsoft/status` and `/api/auth/google/status` in parallel so the sidebar dots are correct on every page, not just Settings.
- `settings/page.tsx` — Google Calendar connect card replaces the old "Coming soon" placeholder. Button redirects to `/api/auth/google?authorization=Bearer <token>`.
- `sidebar.tsx` — second integration dot for Google Calendar alongside the Microsoft one.

**Key tradeoff**
Google OAuth refresh tokens from an app in "Testing" mode expire after 7 days. Fine for dev. To make this production-ready we'd publish the OAuth app (still private, but flips the testing flag) and refresh tokens become long-lived. Logged here so it's not a surprise later.

**Scopes used**
- `https://www.googleapis.com/auth/calendar` (read+write)
- `https://www.googleapis.com/auth/userinfo.email`
- `openid`

---

## 2026-04-26 — SMS as a peer surface (Twilio)

**Decision**
SMS is committed to as a focal-point surface, peer to the web dashboard
— not a feature of it. Same brain (the Agno team), same memory, same
approvals. Different transport.

**New schema**
- `channels` table: `id, user_id, type, address, verified, verified_at,
  created_at`. Unique on `(type, address)`. Maps an external identity
  (a phone number) to an Orbit user.
- `pending_approvals.channel` column added (`web` default, `sms` for
  approvals delivered over SMS). Lets the resolution flow know how to
  reach the user.

**New backend modules**
- `services/twilio_client.py` — lazy REST client + `RequestValidator`
  for inbound webhook signature verification + `send_sms()` helper.
- `services/sms_dispatch.py` — the SMS turn loop. Identity lookup,
  YES/NO detection for pending approvals, fresh agent run, pause
  handling (formats one-line preview + asks YES/NO), persistence,
  outbound send.
- `services/run_resume.py` — extracted the "resume a paused Agno run"
  logic that used to live only in the web approve route. Both the web
  approve endpoint and the SMS reply path call it. Same happy path
  (Agno `acontinue_run` + `req.confirm()`), same fallback (direct tool
  invocation when Agno can't find the paused run), same success copy.
- `repositories/channels.py` — phone→user lookup, upsert verified.
- `api/routes/sms.py` — `POST /api/webhooks/twilio/inbound`. Validates
  `X-Twilio-Signature`, reconstructs the URL behind `x-forwarded-proto/host`
  so it works through ngrok, returns empty TwiML, dispatches to
  `sms_dispatch.handle_inbound_sms`. Always returns 200 (Twilio retries
  storm otherwise) — errors are logged but not surfaced.
- `repositories/conversations.py` — added `find_by_title` so SMS turns
  can find/create the per-day conversation thread.

**Identity & session model**
- A phone number maps 1:1 to a user via `channels`. Unknown numbers
  get a one-line "open Orbit web app to link this number" reply.
- One Orbit conversation per (user, day) for SMS — title is `SMS · YYYY-MM-DD`.
  SMS threads show up in the web sidebar alongside web conversations
  with channel metadata.
- Agno session_id for SMS = `sms:{phone_e164}:{YYYY-MM-DD}`. Daily
  rollover keeps Agno's history window bounded; within a day all SMS
  context is one continuous session for memory + history purposes.

**Approval flow over SMS**
- Agent pauses on a write tool → `sms_dispatch` formats a one-line
  preview based on tool name + args (`_summarize_tool_for_sms`),
  persists `pending_approvals` row with `channel='sms'`, sends the
  preview + "Reply YES to send, NO to cancel."
- Inbound webhook checks for a pending SMS approval before treating the
  message as a fresh agent turn. If body matches affirmative/negative
  vocabulary AND a pending approval exists for this user (within 15
  min), it routes to `_handle_pending_reply` → `resume_approval`.
- Vocabulary is generous and case-insensitive: `y/yes/yep/yeah/ok/okay/
  send it/go/do it` and `n/no/nope/cancel/stop/don't/dont`. Punctuation
  tolerated (`Yes!` works).

**Dev environment**
- ngrok with reserved domain `celtic-remold-unrefined.ngrok-free.dev`
  forwards to local backend on port 8000.
- Twilio webhook URL: `https://celtic-remold-unrefined.ngrok-free.dev/api/webhooks/twilio/inbound`.
- `TWILIO_WEBHOOK_VALIDATE` env var to disable signature checks if a
  tunneling setup mangles the URL — defaults to `true`.

**Currently blocked on**
- Twilio toll-free verification (1–2 business days). Webhook config
  is gated until verification clears. Code path is fully built and
  tested for the parts that don't require message delivery.

---

## 2026-04-25 — The real reason approvals kept hitting fallback

**Symptom**
Every approve click triggered the fallback path. Direct execution succeeded but the agent had no awareness, leading to duplicate-event chaos. We blamed it on Agno session timing, dev reloads, the `session_id = conversation_id` migration. None of those were the actual cause.

**Root cause**
We were generating our own random `run_id` UUID in `chat.py` (`run_id = str(uuid.uuid4())`) and storing **that** in `pending_approvals.run_id`. But Agno generates its **own** internal `run_id` for each TeamRunOutput. The two never matched, so when the approve endpoint did:

```python
paused_run = next(
    (r for r in agno_session.runs if r.run_id == run_id),  # ← our UUID, not Agno's
    None,
)
```

…it never found anything. Resume always returned None, fallback always fired.

This had been the case from day one of the approval flow. Earlier "fixes" (session_id in Team constructor, memory-sync) only papered over downstream symptoms.

**Fix**
- `services/event_translator.py`: drop the `run_id` parameter. Discover Agno's actual run_id from the first event that exposes one (every team run/stream event has a `run_id` attribute), use it for `stream_start`, `pending_approvals` row, activity_log entries, and `stream_end`.
- `api/routes/chat.py`: stop generating a random run_id. Read it back from the `stream_start` / `stream_end` SSE events and use it for the assistant message metadata.
- `api/routes/approve.py`: same translator signature change. The `run_id` field on the approval row is now Agno's actual ID, so `aget_session().runs` lookup matches.

**Why we didn't catch this earlier**
The fallback was working too well. It hid the resume failure behind a "good enough" outcome that quietly used the wrong tool set when Google Calendar was connected, leading to the duplicate-events problem and the "event landed on Outlook instead of Google" bug.

Diagnostic logging in `/tmp/orbit-approve-diag.log` would have shown `runs_count=1, run_ids_in_session=['<agno_run_id>'], paused_run_found=False` — clearly different IDs. We never got around to actually running it.

---

## 2026-04-21 — Session-id in Team constructor + fallback memory sync

**Problem 1 — Resume was silently failing every time**
The orchestrator built the Team with no `session_id` in `__init__`, then assigned `team.session_id = session_id` afterwards. But Agno reads `self.session_id` during `initialize_team()` — if it's `None` at that moment, Agno saves the paused session under an unrelated/random key. Later, our approve endpoint looks up by `conversation_id` and finds nothing. That's why every approval hit the fallback path.

**Fix** — Pass `session_id=session_id` and `user_id=user_id` directly in the `Team(...)` constructor call in `agents/orchestrator.py`. Dropped the post-construction attribute assignments. Now Agno persists under the right key from turn one, the happy path actually works, and fallback becomes rare rather than guaranteed.

**Problem 2 — After a fallback, the agent has no idea the action happened**
The fallback path invokes the tool directly via `create_calendar_tools(token_manager, user_id)[create_event]` and writes an assistant message to our `messages` table. But Agno's session history lives in `agno.sessions.runs[*].messages`, not ours — so the next user turn, the agent sees an empty history and tries the same action again. The user ended up with three duplicate calendar events before giving up.

**Fix**:
1. `repositories/messages.py::fallback_context(conversation_id)` scans the last 5 assistant messages with `metadata.fallback=true AND metadata.tool_ok=true` and formats them into a system note: `"[System note — these actions were already completed earlier in this conversation. Do not repeat them unless the user explicitly asks for another one: ...]"`.
2. `api/routes/chat.py` prepends that note to the user's message before passing it to `team.arun(...)`. The agent reads it, knows the action is done, and stops trying to re-do it.
3. Fallback messages are now tool-specific and human. `"Event created on your calendar. It'll be in Outlook at the time you specified."` instead of `"Done. Create event completed."`.

**Why the two fixes together matter**
Fix 1 means resume works — fallback stays a safety net instead of the default. Fix 2 means when fallback does fire (dev reloads, future edge cases), the agent stays coherent across turns.

---

## 2026-04-21 — Two bugs fixed: delta-strip + resume fallback

**Problem 1 — "Gotit", "checkfor"**
My `_strip_pause_noise()` helper was calling `.strip()` on every content delta. Agno streams deltas with meaningful leading/trailing whitespace (that's how word boundaries survive across chunks). Per-delta stripping merged adjacent tokens — hence "Gotit", "checkfor", "simultaneously grabbing the details needed to create the event.Noconflicts".

**Fix** — Split into two functions: `_strip_pause_noise()` does only the regex substitution (no whitespace touching), and `_tidy_final(text)` does the blank-line collapse + outer trim. The per-delta path uses only the former. `_tidy_final` runs once at `content_done` / `RunContentCompletedEvent`.

**Problem 2 — "That approval request expired" on every retry**
The happy path requires Agno to still have the paused run in memory-or-DB. Between pause and approval click, lots can go wrong: uvicorn reloads during dev, session state drifts, schema was just migrated, etc. Our approve endpoint was hard-failing with "Paused run not found" — the user got stuck in a retry loop with no way out.

**Fix — Direct-execution fallback**
`backend/api/routes/approve.py` rewritten with a two-path event generator:
1. **Happy path.** Load the Agno session, find the paused run, call `req.confirm()` / `req.reject()`, `acontinue_run(stream=True)`, stream SSE back. (Unchanged logic.)
2. **Fallback.** If `aget_session()` fails or the run isn't in `session.runs`, log a warning and invoke the stored tool directly using `pending_approvals.tool_name` + `tool_args`. We build a fresh `tool_map` via `create_{email,calendar,tasks}_tools(token_manager, user_id)`, look up the function, and call `entrypoint(**tool_args)`. The result is written back as a plain assistant message ("Done. Create event completed."). User still gets the action; Agno's context is out-of-sync for the rest of this conversation, but that's recoverable with a new chat.

Rejections in the fallback path just emit "Got it, not doing that." — no side effect, no Agno call.

**Why this matters**
Before: approval failure = dead end = user has to retype the whole request.
After: approval failure on a write intent = the write still happens, user gets a one-line confirmation, chat flows on.

---

## 2026-04-21 — Approval card filtering + pause-noise stripping

**Problem**
Two bugs surfaced when a user asked the calendar agent to create an event from email context:
1. The agent's plan was `list_events` (check conflicts) → `create_event`. Agno's `RunPausedEvent` bundled BOTH tools in its `tools`/`requirements` lists. Our translator was emitting an approval card for **every** tool in the paused event, so `list_events` (a read-only tool with no `requires_confirmation`) got a card it shouldn't have.
2. Agno yields framework scaffolding text into the content stream when a member pauses — literally `"Member 'Calendar Agent' requires human input before continuing."` — which was landing in the chat bubble as if the agent said it.

**Change**
`backend/services/event_translator.py`:
1. **Approval filter.** Before creating an approval row + emitting `approval_required`, check `tool_exec.requires_confirmation` (explicit True) AND `tool_exec.confirmed is None` (not already resolved). Tools that don't need confirmation — or were already confirmed earlier in the run — are silently skipped. They'll still execute when `acontinue_run` resumes; they just don't need a card.
2. **Pause-noise strip.** Added `_strip_pause_noise(text)` using a regex that matches Agno's paused-member placeholders (`"Member 'X' requires human input..."` and `"Task [id] paused."`). Applied to every `RunContentEvent` / `TeamRunContentEvent` delta AND to the final `content` on completion events. If the cleaned result is empty, the delta isn't emitted at all — no stray blank bubbles.

**Implications**
- One write intent = one card, regardless of what read-only tools are queued alongside it.
- Chat bubbles never show Agno's internal pause scaffolding.
- The approval resume path is simpler because the confirmed tool is unambiguous — no more "was the user approving the list or the create?"

---

## 2026-04-21 — Duplicate approval deduplication

**Problem**
One `send_email` call produced four approval cards in the UI. Also, `delegate_task_to_member` (Agno's internal team routing tool) appeared as a user-facing approval.

**Root cause**
In route mode, Agno fires both `RunPausedEvent` (from the member agent) and `TeamRunPausedEvent` (wrapping it at the team level). Each event has both a `requirements` list (each with a `tool_execution`) and a `tools` list — same tool surfaced 2–4 times.

**Change**
- `backend/services/event_translator.py`:
  - Tracks `approved_tool_call_ids: set[str]` across the whole stream. Each `tool_call_id` emits an approval exactly once regardless of how many paused events mention it.
  - Explicitly skips `delegate_task_to_member` — it's Agno's internal routing, never user-facing.
  - Per-event dedup pass across `requirements` + `tools` before the stream-wide set check.
- `frontend/src/stores/chat-store.ts`:
  - `addApproval` drops entries whose `toolName` + `JSON.stringify(toolArgs)` match a pending approval already in the store. Belt-and-suspenders in case the backend still double-emits.

**Implications**
- Exactly one card per write intent, even under Agno's double-event-fire behavior.
- Agno's routing tool never leaks into the approval UI.

---

## 2026-04-21 — Agno memory + history + token metrics

**Change**
- Orchestrator team now has:
  - `update_memory_on_run=True` — Agno writes user memories to its `agno.memory` table after each run (preferences, facts, style hints).
  - `add_history_to_context=True` + `num_history_runs=5` — last 5 runs from the session are injected into the model context automatically.
- Event translator now captures `metrics` (input/output/total tokens) from `RunCompletedEvent` and emits them on the `stream_end` SSE event.
- Chat and approve routes persist metrics in `messages.metadata.metrics` — ready for a future daily-cost card without another migration.

**Implications**
- User memories (e.g. "I prefer morning meetings") survive across conversations in the same `user_id`.
- Conversation context now flows automatically — the agent no longer "forgets" earlier turns within a session.
- Per-message cost data is available for any future analytics without additional plumbing.

---

## 2026-04-21 — Session = Conversation

**Problem**
The frontend generated one random `session_id` per browser tab and reused it across every conversation. But `session_id` is Agno's unit of isolation for paused runs, conversation history window, and session-scoped memories. With one session_id across many conversations, Agno was mixing context — a paused "send email to Sarah" in conversation A could be resumed from conversation B, and history from unrelated conversations leaked into the agent's context.

**Change**
- `backend/api/routes/chat.py`: `session_id = conversation_id` (explicit — no longer reads from the request body). If the request lacks a `conversation_id`, create the conversation first, then use its UUID as the Agno session.
- `backend/api/routes/approve.py`: already uses `approval["session_id"]` from the DB — now that's always the conversation_id, so resume logic is automatic.
- `ChatRequest` Pydantic model: dropped `session_id` field entirely. The client doesn't send it; it's no longer a concept the frontend needs to track.
- `frontend/src/lib/api.ts`: `sendChatMessage()` signature is now `(message, conversationId, token, signal?)` — the sessionId param is gone. Also accepts an optional `AbortSignal` for cancellation.
- `frontend/src/stores/chat-store.ts`: removed `currentSessionId` state + generator. Added `activeAbortController` so in-flight streams can be cancelled when the user switches conversations or starts a new chat. `selectConversation`, `removeConversation`, and `reset` all abort the stream before resetting state.

**Frontend UX fix that fell out of this**
- Switching conversations mid-stream used to leak tokens into the old conversation and activity into the new view. Now the stream aborts cleanly on switch, and the activity feed is cleared alongside.

**Implications**
- One conversation = one Agno session = one history window = isolated paused runs. Approvals resume against the right context.
- Deleting a conversation now implicitly evicts the Agno session too (our `pending_approvals` cascade handles paused state, and Agno's session data becomes orphaned rows in the `agno` schema — cheap to leave, cleanup job can come later).
- No more "random UUID" leaking between convos.

---

## 2026-04-21 — Agent persona refresh

**Change**
Rewrote instructions for the orchestrator + all three specialists (`email`, `calendar`, `tasks`). Old instructions read like rules ("NEVER do X", "Do not narrate"); new ones read like identity ("you're a trusted chief-of-staff", "just do the work"). Same guardrails preserved (no emojis, minimal formatting, no preamble), now framed positively and with clearer intent for when to act vs. clarify.

Also:
- Empty-state heading changed from "How can I help you today?" to "What can I take off your plate?" with warmer sub-copy.
- Suggestion chips reframed around outcomes the user cares about (*What should I focus on today?*, *Anything urgent in my inbox?*) instead of feature descriptions.
- Conversation titler moved to Haiku 4.5 (faster + cheaper, 3-5 word labels rather than 4-6 headlines).

---

## 2026-04-21 — asyncpg sslmode bug fix

**Symptom**
After the Agno-DB wiring landed, every team-related request (memory, session lookup, `acontinue_run`, `aget_session`) was silently failing; the frontend showed a generic `Failed to fetch` coming from the SSE stream collapsing mid-request. First reproduction was during an approval continuation.

**Root cause**
Neon's `DATABASE_URL` is libpq-style: `postgresql://user:pass@host/db?sslmode=require&channel_binding=require`. Our own asyncpg pool (in `services/database.py`) accepts that because asyncpg's native interface parses libpq params. But **SQLAlchemy + asyncpg does not** — `sslmode` is a libpq-only keyword, not an asyncpg-async one, and SQLAlchemy forwards it blindly as a kwarg to `asyncpg.connect(...)` which raises `TypeError: connect() got an unexpected keyword argument 'sslmode'`.

**Fix**
`services/agno_db.py`:
1. `_to_async_url(url)` parses the URL, strips libpq-only params (`sslmode`, `channel_binding`, `sslrootcert`, `sslcert`, `sslkey`), and returns `(cleaned_url, connect_args)`.
2. If `sslmode` was present, it's forwarded as `connect_args["ssl"] = <sslmode_value>` — asyncpg's `connect()` accepts the libpq-style strings directly (`require`, `prefer`, `disable`, `verify-ca`, `verify-full`).
3. We now build the `AsyncEngine` ourselves via `create_async_engine(cleaned_url, connect_args=connect_args, pool_pre_ping=True, pool_recycle=3600)` and pass it to `AsyncPostgresDb(db_engine=...)`.

Earlier approach (`ssl=True`) was also wrong — that triggered full cert verification which failed on Neon's certs. Using the sslmode string means "encrypt without verifying cert" (matches what libpq's `sslmode=require` does).

**Verified**
`team.aget_session()` against Neon now succeeds and returns `None` for unknown sessions. Schema auto-create in the `agno` schema works. Backend health + all protected routes returning expected 422 (auth required) after backend reload.

**Takeaway**
If a library ever accepts both libpq URLs and bare asyncpg params, assume they don't agree on query-string keys. Always test the connection path explicitly after switching drivers.

---

## 2026-04-21 — Observability endpoints: usage + memories

**New endpoints**
- `GET /api/usage/today` — sums token metrics from `messages.metadata.metrics` since midnight UTC for the current user. Returns `{messages, input_tokens, output_tokens, total_tokens, estimated_cost_usd}`. Pricing baked in at $3/$15 per million input/output tokens (Sonnet 4.6).
- `GET /api/memories` — proxies `AgnoDb.get_user_memories(user_id=...)` and returns a normalized list of `{id, memory, topics, updated_at}`. Lets the UI surface what Agno has learned without leaking schema details.

**Repository addition**
- `repositories/messages.py`: `usage_since(user_id, iso_timestamp)` performs a SUM over `metadata->'metrics'->>'input_tokens'` etc. Uses Postgres's JSONB operators so no code change is needed for new metric fields.

**Settings page**
- New "What Orbit remembers" card lists memories with topic tags.
- New "Usage today" card shows messages / input / output / estimated cost in a 4-up grid.

**Why this order**
Before building trust progression (auto-approve low-risk writes), the user needs visibility into what the agent has already done and remembered. This cluster of endpoints is the substrate.

---

## 2026-04-21 — Tool/agent refactor: folder defaults + date filter

**Tasks tools** (`backend/tools/tasks.py`)
`get_task` / `update_task` / `complete_task` / `delete_task` previously required `task_list_id` as a positional argument. But `list_tasks` only returns `task_id`s with no folder context, so the agent couldn't complete a task without first calling `list_task_lists`. Changed all four to accept `task_list_id=""` and fall back to `todo.get_default_folder()`.

**Calendar tool** (`backend/tools/calendar.py`)
`list_events`'s "today" filter used `start >= now AND end <= end_of_day`, which excluded events that started today but crossed midnight (11pm meetings, all-day events). Changed the second clause to `start <= end_of_day` so the filter is purely on start time.

---

## What to grep for

- All Agno session storage → `services/agno_db.py`
- Approval continuation → `api/routes/approve.py`
- Event dedup → `services/event_translator.py` (`approved_tool_call_ids`)
- Frontend approval stream consumer → `components/chat/chat-panel.tsx` `resolveAndContinue`
