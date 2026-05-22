# Orbit — Project Status

Last updated: 2026-05-22 (post Phase 1.2 validation + coordinate-mode decision)

> Big architectural changes are tracked separately in `docs/ARCHITECTURE_CHANGES.md`.
> **Active session state** lives in `docs/handoff/2026-05-22-coordinate-mode-decision.md` — read that first if you're picking up live work.

**Where we are right now**: production deploy is live with auth + Telegram + Microsoft + Google Calendar integrations. A manual validation pass (Phase 1.2) surfaced two issues: (1) Anthropic Sonnet 4.6 has sustained overload windows that survive `max_retries=5` — addressed with a per-turn `FallbackClaude` (Sonnet → Haiku) currently committed but not yet wired, and (2) Agno Team route mode architecturally can't deliver the README's cross-domain promises — decision is to switch to coordinate mode (in flight). Validation paused mid-stream pending those two fixes.

## What's Built and Working

### Backend (Python/FastAPI)
- **Orchestrator**: Agno Team in route mode. The team leader runs `claude-haiku-4-5-20251001` (routing is a classification task — Haiku keeps time-to-first-token low). The three specialist agents (email, calendar, tasks) run `claude-sonnet-4-6` for tool selection and synthesis.
- **SSE streaming**: Full event translator pipeline — content deltas, tool calls/results, agent delegations, approval events, error handling. Handles both `TeamRun*Event` and `Run*Event` (Agno quirk in route mode)
- **Email tools**: `list_emails`, `get_email`, `search_emails`, `send_email`, `reply_to_email`, `trash_email`, `move_email`, `get_attachments` (reads text attachments inline via base64 decode, returns binary file info for others)
- **Calendar tools**: `list_events`, `get_event`, `create_event`, `update_event`, `delete_event`
- **Tasks tools**: `list_task_lists`, `list_tasks`, `get_task`, `create_task`, `update_task`, `complete_task`, `delete_task`
- **All write tools** have `requires_confirmation=True`
- **Repository layer**: asyncpg repositories for conversations, messages, activity, approvals, integrations, users
- **Auth**: Session validation via Better Auth session token lookup in `sessions` table
- **Token management**: MSAL-based OAuth token refresh, Fernet encryption at rest, O365 Account construction
- **Conversation titler**: Auto-generates titles for new conversations
- **API routes**: `/api/chat` (SSE), `/api/chat/approve`, `/api/conversations` (CRUD), `/api/activity`, `/api/auth/microsoft` (OAuth)

### Frontend (Next.js 15/TypeScript)
- **Chat UI**: Message list with markdown rendering (react-markdown), streaming content display, suggestion chips on empty state, controlled input with focus ring
- **Conversation history**: Sidebar lists all previous conversations (fetched from API), click to load messages, auto-refreshes after streaming. Chat header shows conversation title.
- **Activity feed**: Real-time tool calls, delegations, approvals with colored icons per event type, timeline connectors, stats bar
- **Approval cards**: Shown inline when write tools need confirmation
- **Settings page**: Profile section, timezone/theme preferences, daily usage card, "What Orbit remembers" memory viewer + per-row delete, about section. Integrations live in the separate **Hub** page (Microsoft 365 + Google Calendar + Telegram all wired with connect/disconnect; Gmail/Notion/Slack/GitHub cards exist as "coming soon").
- **Activity page**: Standalone page with stats bar and full activity feed
- **Auth**: Better Auth email+password, login page, auth provider, middleware guard
- **Layout**: Sidebar (logo links to landing, new chat button, nav items, conversation list, connection status, user info, sign out button) + main content area with border
- **Splash screen**: Loading gate while auth initializes
- **Markdown renderer**: Custom component that downgrades headers to bold, styles lists/code/links, renders hr as subtle lines
- **Zustand stores**: auth-store (user, session, Microsoft connection), chat-store (messages, streaming, conversations, approvals), activity-store

### Agent Response Quality
- No emojis (enforced in all agent instructions)
- Minimal formatting — bold for emphasis, simple lists, no headers/hr/blockquotes
- Agents don't narrate ("I'll now fetch...") — they just do it and present results
- Email agent proactively reads attachments via `get_attachments`

## What's Verified End-to-End
- "Check my emails" returns real Outlook emails with correct sender, subject, date, snippet
- SSE streaming works — content deltas arrive incrementally, tool calls show in activity feed
- Conversation persistence — messages saved to DB, conversations listed in sidebar, click to reload
- Error handling — 429 rate limits, tool errors, run errors all forwarded to frontend
- Agent routing — email/calendar/tasks queries go to the correct specialist
- Auth flow — sign up, sign in, session validation, sign out all work

## Current Phase: Phase 2 (Approval Flow + Cross-Tool Synthesis) — In Progress

### Active work
- **Telegram surface (shipped 2026-05-21).** Replaces the previous SMS/Twilio plan. `services/telegram_client.py` (httpx Bot API wrapper) + `services/telegram_dispatch.py` (inbound message + callback-query handlers) + `api/routes/telegram.py` (webhook + pair/status/disconnect). Inline-keyboard `✅ Send / ❌ Reject` buttons replace SMS YES/NO. Pairing via 6-digit code in the Hub UI → user taps `/start <code>` in Telegram → chat is bound. Shared `services/run_resume.py` between web and Telegram approval paths so behavior stays identical. Bot is `@orbit101bot`. Local dev needs ngrok + `python -m scripts.setup_telegram_webhook --url ...` to register.
- **Twilio fully removed (commit `60e68c4`).** Files deleted, deps dropped, env stripped. The `pending_approvals.channel` column now takes `'web'` or `'telegram'`.

### Critical fixes landed
- **asyncpg `sslmode` bug** — Every Agno-dependent call (memory, paused-run resume, session lookup) was crashing on Neon because SQLAlchemy+asyncpg doesn't parse libpq's `sslmode` query param. Fix in `services/agno_db.py`: build the engine manually with `connect_args={"ssl": sslmode_value}` after stripping libpq-only query params.
- **`session_id = conversation_id`** — The client was reusing one random session_id across all conversations, so Agno's paused runs and history mixed between different Orbit conversations. Now one conversation = one Agno session. Stream is also aborted on conversation switch + activity feed cleared.
- **Approval card filter** — Only tools with `requires_confirmation=True` surface a card. Read-only tools queued alongside a gated tool resume automatically.
- **Pause-noise suppression** — "Member 'X' requires human input…" no longer leaks into chat.
- **Word-space preservation** — fixed a per-delta `.strip()` that was merging tokens ("Gotit", "checkfor"). Final tidy runs only once on completed content.
- **Approval resume fallback** — If Agno can't resume the paused run (server restart, session drift), the approve endpoint directly invokes the tool using stored args. User still gets the action; no more "That approval request expired" dead end.
- **Agent persona refresh** — Orchestrator and specialists rewritten to feel like a trusted chief-of-staff, not a tool wrapper. Warmer empty state and outcome-focused suggestions.

### Recent Work
- **Agno storage wired up**: `Team` now has `db=AsyncPostgresDb(schema="agno")` so paused runs persist. Singleton at `services/agno_db.py`.
- **Approval endpoint streams continuation**: `POST /api/chat/approve` loads the paused Agno session, applies `req.confirm()` / `req.reject()` to the matching `tool_call_id`, calls `team.acontinue_run(stream=True)`, and streams events back through the same SSE translator.
- **Frontend consumes approval stream**: `approveAction()` returns a `ReadableStream`, chat panel feeds events through the same `useSSE` handler as chat.
- **Approval card redesign**: tool-specific previews (email To/Cc/Subject/Body, event Title/Start/End/Location, task Title/Due/Notes). Primary-verb button ("Send" / "Delete" / "Confirm"). Clean 3-section layout.
- **Duplicate approval fix**: event translator dedupes by `tool_call_id` across `RunPausedEvent` + `TeamRunPausedEvent` + requirements/tools lists. Also explicitly skips `delegate_task_to_member` (Agno internal routing).
- **Frontend dedupe**: `addApproval` store action drops approvals with identical `toolName` + `toolArgs` while one is still pending.
- **Agno memory + history**: orchestrator has `update_memory_on_run=True`, `add_history_to_context=True`, `num_history_runs=5` so "I prefer morning meetings" can persist across sessions.
- **Token cost tracking**: event translator captures `metrics` from `RunCompletedEvent`, chat & approve routes persist them in `messages.metadata.metrics` (input/output/total tokens).
- **Activity feed polish**: tool calls color-coded by domain (email=sky, calendar=emerald, tasks=amber). Approval events colored (required=amber, approved=emerald, rejected=red), delegations=violet.
- **Orchestrator instructions hardened**: execute immediately when all required params provided, never re-ask for user-omitted fields. (Cross-domain "delegate sequentially + synthesize" wording is currently wishful — route mode delivers exactly one specialist per turn. Coordinate-mode switch in flight; see active handoff.)
- **Phase 1 bug fixes**:
  - `tools/tasks.py`: `get_task`/`update_task`/`complete_task`/`delete_task` now default `task_list_id` to the user's default folder.
  - `tools/calendar.py`: `list_events` today-filter no longer excludes events that cross midnight.

### Remaining Phase 2 items
- [ ] Cross-tool synthesis end-to-end test ("Find action items in my recent emails and create tasks for them") — **blocked on coordinate-mode switch**; route mode can't deliver this.
- [ ] Browser test: reject flow → agent acknowledges no action taken
- [ ] Full manual validation pass on the shipped tool surface — paused mid-stream (see handoff). Verified so far: `search_emails` ✓, `list_emails` ✓ (warm path), provider citation in replies ✓. Blocked: `get_email` perf retest, `get_attachments`, all writes, calendar tools, all tasks tools, cross-domain.

### Phase 3 progress
- [x] Conversation history sidebar
- [x] Agno memory enabled
- [x] Token metrics captured per message
- [x] Activity feed colors per agent type
- [x] Daily usage/cost card in settings (`GET /api/usage/today`)
- [x] Memory viewer + delete in settings (`GET /api/memories`, `DELETE /api/memories/:id`)
- [x] Conversation delete from sidebar hover
- [x] Friendly error translation in chat (connection / rate-limit / MS-not-connected / expired-approval)
- [x] `delegate_task_to_member` hidden from activity feed + tool_call stream
- [x] `stream_end` safety net clears streaming state on rejected / empty continuations
- [ ] Memory persistence browser test ("I prefer morning meetings" across sessions)
- [ ] Trust level progression (skip manual approval for reads after N approvals)

### Phase 3+
See `docs/ROADMAP.md` for Phases 3-6 (Memory, Telegram, Expand Integrations, Proactive Agents).

## Key Files to Know

| Area | File | What it does |
|------|------|-------------|
| Agno storage | `backend/services/agno_db.py` | Singleton `AsyncPostgresDb` (schema `agno`) — persists paused runs for resumption |
| Approve route | `backend/api/routes/approve.py` | Resumes paused run via `team.acontinue_run()` and streams continuation as SSE |
| SSE pipeline | `backend/services/event_translator.py` | Converts Agno events to SSE protocol. Most complex backend file. |
| Agent factory | `backend/services/agent_factory.py` | Builds orchestrator team with tools bound per-user |
| Token management | `backend/services/token_manager.py` | MSAL token refresh + Fernet encryption + O365 Account |
| Chat route | `backend/api/routes/chat.py` | POST SSE endpoint, creates/loads conversations, runs orchestrator |
| Auth middleware | `backend/api/deps.py` | `get_current_user()` — validates session token via DB lookup |
| Chat store | `frontend/src/stores/chat-store.ts` | Messages, streaming state, conversations list, approvals |
| SSE hook | `frontend/src/hooks/use-sse.ts` | Parses SSE stream, dispatches to stores |
| Sidebar | `frontend/src/components/layout/sidebar.tsx` | Navigation, conversation history, sign out |
| Markdown | `frontend/src/components/ui/markdown.tsx` | Custom react-markdown for clean agent responses |
| Schema | `frontend/src/db/schema.ts` | Drizzle schema — single source of truth for all tables |
| Auth config | `frontend/src/lib/auth.ts` | Better Auth server config with Drizzle adapter + JWT plugin |

## Known Quirks
- Agno route mode sends member content as `RunContentEvent`, not `TeamRunContentEvent` — translator handles both
- O365 `BaseAttachment` has no `content_type` attribute — we detect file type by extension
- O365 attachment content is base64-encoded bytes, needs decoding
- Agno `ToolCallStartedEvent` stores tool info in `event.tool` (a `ToolExecution` object), not `event.tool_name`
- Model must be `claude-sonnet-4-6` (not `claude-sonnet-4-6-20250514` — that ID doesn't exist)
