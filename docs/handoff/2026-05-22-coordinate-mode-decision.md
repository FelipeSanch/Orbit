# Handoff — coordinate-mode decision + Haiku fallback (in flight)

Status: Phase 1.2 validation (manual test pass on shipped tools) is **paused mid-stream**. The pause is structural, not fatigue — validation surfaced a real architectural mismatch between route mode (one specialist per delegation, stateless) and the product's cross-domain promise, and we chose to fix the architecture before continuing to patch around it.

Decision locked in this session: **switch from Agno Team route mode to coordinate mode**, but ship a Haiku fallback for specialists FIRST so the mode switch is debugged against a more resilient model layer.

## What was committed this session (5 commits, all on `main`)

```
9b7c556 feat(reliability): FallbackClaude (specialist Sonnet → Haiku on overload)  [WIP, not wired]
4f0e7a6 fix(reliability): retry on Anthropic overload + persist run errors
b80bdb4 fix(agents): per-specialist session history + stricter no-emoji rule
9edb57e feat(microcopy): provider-aware tool returns + connection-state context
263d26c perf(orchestrator): Haiku 4.5 + docs/README refresh
```

### 263d26c — Haiku 4.5 orchestrator + README/docs refresh
Orchestrator swapped from Sonnet 4.6 to Haiku 4.5 (routing is classification, not synthesis). Specialists stay on Sonnet. README rewritten to reflect Telegram-as-peer-channel (not SMS), production deploy, refreshed architecture diagram showing orchestrator/specialist model split. `docs/STATUS.md:15` and `docs/agents.md:16` updated to match.

### 9edb57e — Provider-aware microcopy + connection-state context
Every tool now wraps its return in `{"provider": "outlook"|"outlook_calendar"|"google_calendar"|"ms_todo", ...}`. List returns: `{"provider", "items": [...]}` instead of bare arrays. When a provider isn't connected, tools return `{"error": "not_connected", "message": "..."}` with an explicit "open the Hub" instruction; specialists are told to surface that directly instead of retrying.

`agent_factory` now reads both Microsoft and Google `is_connected` state and passes them (plus active calendar_provider) to `create_orchestrator_team`. The orchestrator renders that state into its instructions so it can decline upfront ("Microsoft isn't connected yet — open the Hub…") instead of delegating to a specialist that would fail at the tool boundary.

### b80bdb4 — Per-specialist session history + stricter no-emoji rule
Specialists were stateless across turns. Each delegation handed Email/Calendar/Tasks Agent a fresh slate with no memory of prior tool calls in the same conversation. A follow-up like "open the GitHub Upstash alert" had the Email Agent search-and-retry **four times** to rediscover an id it had returned 30 seconds earlier — observed taking ~2 min for a single `get_email` round trip.

Fix: each specialist now gets `db=get_agno_db()` + a scoped `session_id` (`{conv_session}:email`, `:calendar`, `:gcal`, `:tasks`) + `add_history_to_context=True`. Scoping under the conversation keeps domains isolated so they don't clobber each other's Agno session rows.

**Note for the coordinate-mode switch:** this per-specialist session_id hack becomes **unnecessary** in coordinate mode (the team leader manages all member state). Plan to revert this commit's `agent_factory.py` changes once the switch lands and works.

Separately: Sonnet kept sneaking emojis (🔵 unread, ✅ read) into replies despite "Never use emojis." Replaced with concrete forbidden list (`🔵 ✅ ⚠️ ❌ ✓ ✗ ⭐`) plus explicit plain-text substitutes ('unread', 'read', 'pending'). Applied to all four specialists and the orchestrator.

### 4f0e7a6 — Anthropic overload retry + run_error persistence
Phase 1.2 surfaced a "cold-start failure" pattern: the first specialist call in a fresh conversation would fail with "The agent run failed", succeed on retry. Activity-log persistence (also added here) revealed the actual cause: Anthropic returns `overloaded_error` (HTTP 529) under brief capacity pressure, and Agno's `ModelRateLimitError` propagates as a `RunErrorEvent` before the SDK's default 2 retries can ride it out.

Two fixes:
1. Bump `max_retries` to 5 on all five Claude instances via `client_params`.
2. Persist `RunErrorEvent`/`TeamRunErrorEvent` payloads as `run_error` rows in `activity_log` so the underlying message is queryable. Surface "Claude's API is briefly overloaded. Try the same message again in a few seconds." for overloads specifically; the generic "agent run failed" stays for other errors.

**Outcome during this session**: even with `max_retries=5`, sustained Anthropic overload windows produced three back-to-back 529s over 8 minutes. So the retry bump alone is not enough — hence the FallbackClaude work below.

### 9b7c556 — FallbackClaude (WIP, NOT wired)
Standalone class at `backend/services/claude_with_fallback.py`. Designed per Felipe's amendments: per-turn fallback (restore primary in `finally` so next turn tries Sonnet again), fires only after Sonnet's max_retries budget is exhausted, never restarts mid-stream, fires a structured `on_fallback(primary, fallback, reason)` callback for observability.

**Status:** imports cleanly, instantiates, lints clean. **Not yet wired into agent_factory.** That's the next chat's first task — ~15 min.

## Validation findings (Phase 1.2)

What we actually tested against Felipe's real Microsoft + Google Calendar accounts on **localhost**, not prod:

| Tool | Status | Notes |
|---|---|---|
| `list_emails` | ✅ works on warm path | First attempt in a fresh conversation often 529s (Anthropic overload, not our code) |
| `search_emails` | ✅ works | Provider citation lands correctly: "in your Outlook inbox" |
| `get_email` | 🟡 works but slow | Pre-fix: 2 min, 4 search retries to rediscover id. Post-`b80bdb4`: not yet revalidated due to overload window |
| `get_attachments` | ⬜ not tested | Blocked on overload before reaching this batch |
| `send_email` | ⬜ not tested | Blocked |
| `reply_to_email` | ⬜ not tested | Blocked |
| `trash_email`, `move_email` | ⬜ not tested | Blocked |
| Outlook Calendar (5 tools) | ⬜ not tested | Phase 1.2 batch 2 — never reached |
| Google Calendar (5 tools) | ⬜ not tested | Phase 1.2 batch 3 — never reached |
| MS To Do (7 tools) | ⬜ not tested | Phase 1.2 batch 4 — never reached. **Most likely to have rust** per the original plan. |
| Cross-domain queries | ❌ architecturally blocked | Route mode can't synthesize across specialists. This is the entire reason for the coordinate-mode switch. |
| Approval flow on a write | ⬜ not tested | Will be the first 2h gating probe of the mode switch. |
| Memory persistence (Phase 1.3) | ⬜ not tested | UI exists (settings/page.tsx:189); writes/reads in prod unverified. |

### Microcopy fixes confirmed landing
- `search_emails` reply: "in your Outlook inbox" — provider tag visible ✓
- Sonnet still sneaks emojis through (🔵 ✅ in a list_emails reply seen this session) → b80bdb4 strengthened the rule; not yet re-validated.

### Real bugs we did NOT fix
- **Hub Connect button silent no-op when not signed in** (`hub/page.tsx`, the `onConnect` async closure has `if (!session?.token) return;`). Should show "please sign in" instead of doing nothing. Not blocking; file as Phase 3.2 polish.

## The architecture decision

**Path A: switch to coordinate mode.** Locked in.

Why: every patch we added this session (specialist session_id scoping, "reuse ids" instructions, Phase 1.5 cross-domain deferral) is a downstream symptom of route mode being the wrong abstraction for a cross-domain assistant. Route mode delegates to exactly one specialist per user message and returns that specialist's output directly (`agno/team/mode.py:15-16`). The README's headline use cases ("what should I focus on today", "find action items in emails and turn them into tasks") cannot work in route mode by definition.

Coordinate mode (`agno/team/mode.py:12-13`): "Default supervisor pattern. Leader picks members, crafts tasks, synthesizes responses." That's what Orbit's UX promises.

### Felipe's three amendments to the plan

1. **Ship Haiku fallback FIRST, mode switch second.** Reasoning: the mode switch should be debugged against a stable model layer. If Sonnet 529s during mode-switch testing, you can't tell which failures are coordinate-mode bugs vs. Anthropic capacity.

2. **First 2h of the mode switch is a scoping probe, not a delivery commitment.** Specifically: get one approval round-trip working end-to-end (send email → approval card → approve → email actually sends → confirmation in chat). The current `run_resume` + `req.confirm(tool_call_id)` machinery was built around route-mode events (`TeamRunPaused*Event`, member-run continuation). Coordinate may emit different event types with different shapes. **If the approval flow needs significant rework, stop and come back to reassess scope. Don't fix in flight.**

3. **Port the silent-failure detection pattern (run_error persistence from 4f0e7a6) to whatever coordinate mode's equivalent failure modes are.** Don't assume coordinate is bug-free. If anything reproducible surfaces (specialist context loss, leader-synthesis hang, partial approval state), save the repro and file upstream — the "found and filed an Agno bug during validation" narrative still holds either way.

### Risks Felipe explicitly flagged

- **Estimate could 2-3× the 4-8h.** Surface scope creep as it happens, not after.
- **Cost per query goes up** — coordinate uses leader + specialist Sonnet calls. May need to demote the leader's synthesis pass to Haiku to keep tokens sane.
- **Approval flow is the biggest unknown.** That's why the 2h probe exists.
- **Latency rises** — multi-agent reasoning adds round trips. Set demo expectations accordingly.
- **#8029 talk-track** (Agno upstream bug about route-mode `acontinue_run` dropping paused member-runs) shifts focus. The general narrative ("found and filed a framework bug during validation") still works — may even adapt to a coordinate-mode bug if one surfaces.

## Exact next-step sequence

### Step 1: Wire FallbackClaude into the four specialist factories
~15 min. In `agent_factory.create_team_for_user`, define an `on_fallback(primary, fallback, reason)` closure that logs + writes a `model_fallback` activity_log row scoped to this `user_id` and `conversation_id` (= `session_id`). Pass it into each `create_*_agent` call. Each factory imports `FallbackClaude` and replaces `Claude(id="claude-sonnet-4-6", client_params={"max_retries": 5})` with `FallbackClaude(id="claude-sonnet-4-6", fallback_id="claude-haiku-4-5-20251001", client_params={"max_retries": 5}, on_fallback=on_fallback)`. **Orchestrator stays plain `Claude(id="haiku-...")` — no fallback needed for Haiku.**

After wiring: send `"what are my recent emails?"` against any account. If Anthropic is still overloaded, the activity feed should show a `model_fallback` event and Sonnet's response should be replaced by Haiku's. If Anthropic is calm, no fallback fires.

### Step 2: Coordinate-mode probe (2h max)
Change `agents/orchestrator.py:35` from `mode="route"` to `mode="coordinate"`. In the same edit, you'll likely need to remove or rewrite the routing-specific instructions in the orchestrator's instructions list (the "Route email questions to..." block becomes "Decompose the user's request..."). Keep the connection-state instruction at the top — it's mode-agnostic.

Then send `"send a test email to me with body 'hello from orbit'"`:
- Watch the activity feed. Coordinate mode may emit `TeamRunDelegated`, `TeamRunMemberCompletedEvent`, or new event types — the existing `event_translator.py` only handles `Run*Event` and `TeamRun*Event` shapes for some types, not all.
- The approval card MUST appear with the correct preview.
- Approve.
- The send MUST actually fire and the team MUST resume cleanly.

**If any of those fail:** stop, document the failure shape, file an Agno issue if reproducible, come back here to reassess. Specifically don't try to fix `run_resume.py` or `event_translator.py` in flight — those are the load-bearing pieces and you'll want a focused session for them.

**If approval round-trip works:** revert the `b80bdb4` per-specialist `session_id` scoping in `agent_factory.py` (coordinate mode manages member state itself), then proceed to step 3.

### Step 3: Resume Phase 1.2 validation
With architecture stable, work through the validation matrix above. Most things should now Just Work, with cross-domain queries actually delivering for the first time.

### Step 4: Prove cross-domain
Specifically test `"what should I focus on today"` and `"find action items in my recent emails and create tasks for them"`. These are the README's headline examples; they are the proof the architecture switch was worth it.

### Step 5: Ship-readiness
Passkeys (Better Auth `passkey()` plugin, ~150 lines + drizzle-kit push), `/privacy` + `/terms` static pages (~30 min, needed before Google OAuth consent screen can go public), final README accuracy pass, Hub Connect button silent-no-op fix, frontend final pass.

## Environment state at handoff

- **Branch**: `main`, clean. 5 commits ahead of origin/main — **not pushed**. Push when comfortable.
- **Local backend**: running on :8000 (PID 4680). Dev branch DB (`ep-shiny-dawn-amenvebx-pooler`). `uvicorn main:app --reload`.
- **Local frontend**: running on :3000 (PID 4707). Dev branch DB. Has Microsoft 365 + Google Calendar integrations live for `felipesancheznoguera6@gmail.com` (user_id `U3UdCvx9voYNq9rdMW0o57wgHhyuxaZX`).
- **Prod**: unchanged from the previous handoff. Tonight's commits have NOT been deployed. Prod backend on Railway is still the pre-Phase 1.1 code with Sonnet orchestrator.
- **Tests**: 90 passing (`cd backend && uv run pytest`). Ruff clean.
- **Anthropic API**: at last check (~04:48 UTC on 2026-05-22), Sonnet 4.6 was in a sustained overload window producing repeated 529s. Likely recovered by morning. If next-chat validation also gets 529s, retry in 10-20 min before assuming bugs.

## Files to know

- `backend/services/claude_with_fallback.py` — the WIP fallback class, ready to wire.
- `backend/services/agent_factory.py` — where the wiring goes.
- `backend/agents/orchestrator.py:35` — the `mode="route"` line to change.
- `backend/services/event_translator.py:423` — the run_error path; will likely need extension for coordinate-mode event types.
- `backend/services/run_resume.py` — load-bearing for approval continuation; may need attention in coordinate mode.
- `backend/api/routes/approve.py` — approval HTTP endpoint; should be mode-agnostic but worth re-reading.

## Quick-start prompt for the new chat

> Picking up from `docs/handoff/2026-05-22-coordinate-mode-decision.md`. Phase 1.2 validation is paused; decision locked in to switch Agno Team from route to coordinate mode with three amendments (ship Haiku fallback first, 2h approval-probe gate on the mode switch, port run_error persistence pattern). Start with Step 1: wire `FallbackClaude` (already committed at `backend/services/claude_with_fallback.py`) into the four specialist factories in `agent_factory.py`. Define an `on_fallback` closure that logs structured + writes a `model_fallback` activity_log row. Orchestrator stays plain Haiku. After wiring, do a quick smoke test against `felipesancheznoguera6@gmail.com` locally — if Anthropic is overloaded, the fallback should fire and the user should still get a response. Then come back to me before starting Step 2 (the mode switch).

That gives the next agent enough to start cleanly without re-reading this conversation.
