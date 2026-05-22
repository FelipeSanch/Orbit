# Orbit

A personal AI chief-of-staff that connects email, calendar, and tasks through a
single chat interface — with a live activity dashboard showing every action it
takes and an approval card for every write.

> Built solo over a few months. One assistant, one shared brain, multiple
> surfaces: a web dashboard and a Telegram bot. Same agents, same memory,
> same approval flow on both.

**Live demo:** <https://orbit-ruby-one.vercel.app>

## What it does

- **Chat** — "What's on my calendar today?" / "Reply to Sarah's email, formal
  tone" / "Find action items in my recent emails and create tasks for them."
- **Live activity feed** — Every tool call, agent hand-off, and approval shows
  up in real time, color-coded by domain (email, calendar, tasks).
- **Approval cards** — Every write operation (send email, create event, delete
  task) pauses for a tool-specific preview. Approve or reject inline on the
  web or with a tap on Telegram.
- **Cross-session memory** — "I prefer morning meetings" persists across
  conversations via Agno memory.
- **Multi-provider** — Outlook Mail / Calendar / To Do via Microsoft Graph,
  with Google Calendar as a parallel per-user opt-in.
- **Multi-channel** — Web dashboard for the full picture; Telegram for
  on-the-go free-text + inline-button approvals. Pair your phone once with
  `/start <code>` and it's the same assistant.

## Try it

After signing up at the live demo (or `localhost:3000`):

1. **Sign in** — email + password, or one-click Google / Microsoft.
2. **Connect a data source** — open the Hub (top-right) and connect Microsoft
   365 and/or Google Calendar. Microsoft unlocks all three agents (Mail,
   Calendar, To Do); Google adds a second calendar provider.
3. **Ask something read-only** —
   - "Any urgent emails?"
   - "What's on my calendar today?"
   - "What's on my task list?"
   - "What should I focus on today?" (cross-domain — fans out to all three)
4. **Try a write** — "Reply to the last email from Sarah saying I'll send the
   draft by Friday." You'll get an approval card with the full preview.
   Approve to send, reject to discard.
5. **Pair Telegram** — from Settings, generate a `/start` code and message
   `@orbit101bot`. The same assistant answers there with inline ✅ / ❌
   buttons on every write.

## Architecture

```
   ┌──────────────────┐         ┌──────────────────┐
   │ Web (Next.js 15) │         │  Telegram bot    │
   │  · Better Auth   │         │ (@orbit101bot)   │
   │  · Drizzle (SoT) │         │  inline approvals│
   │  · Zustand       │         └────────┬─────────┘
   │  · SSE consumer  │                  │
   └────────┬─────────┘                  │
            │ POST /api/chat (SSE)       │ webhook
            ▼                            ▼
   ┌─────────────────────────────────────────────────────┐
   │ FastAPI (Python 3.12)                               │
   │                                                     │
   │  Agno Team — route mode                             │
   │   ├─ Orchestrator (Haiku 4.5) — routes only         │
   │   ├─ Email Agent      (Sonnet 4.6) — Outlook        │
   │   ├─ Calendar Agent   (Sonnet 4.6) — Outlook        │
   │   ├─ GCal Agent       (Sonnet 4.6) — Google         │
   │   └─ Tasks Agent      (Sonnet 4.6) — MS To Do       │
   │                                                     │
   │  Repositories (asyncpg, raw SQL, app-level scoping) │
   │  Token manager (MSAL + Fernet)                      │
   │  SSE pipeline → event translator                    │
   └────────┬────────────────────────────┬───────────────┘
            │                            │
   ┌────────▼─────────┐         ┌────────▼─────────┐
   │  Neon Postgres   │         │  Upstash Redis   │
   │ (public + agno)  │         │ OAuth state +    │
   │                  │         │ rate limiting    │
   └──────────────────┘         └──────────────────┘
```

A few design choices worth a closer look:

- **Routing on a cheap model, work on a capable one** — the orchestrator's
  only job is classification (which specialist?), so it runs Claude Haiku 4.5
  to keep time-to-first-token low. Specialists run Sonnet 4.6 because tool
  selection and synthesis benefit from the bigger model.
- **Agno Team in route mode** — the team leader delegates each message to one
  specialist; cross-domain queries fan out sequentially and are synthesized
  with prioritization (urgent emails → today's meetings → overdue tasks).
- **POST-based SSE** — standard `EventSource` only supports GET, so the
  frontend uses `fetch` + `ReadableStream` to POST the message and parse the
  stream body. Lets the same hook drive the chat response and the approval
  continuation.
- **HITL approvals stream** — clicking Approve doesn't just flip a status; it
  reloads the paused Agno session, calls `req.confirm()` on the matching
  `tool_call_id`, and streams the continuation back through the same SSE
  protocol. Direct-tool fallback covers server restarts. Telegram uses the
  identical resume path with an inline-keyboard callback.
- **One backend, two surfaces** — the Telegram bot doesn't have its own
  agents. It posts inbound messages into the same `orchestrator.arun()` and
  the same approval/resume machinery, so memory and conversation state stay
  consistent across channels.
- **No RLS** — every repository query carries `WHERE user_id = $1` at the
  application layer. Drizzle defines the schema once; asyncpg reads it.

For deeper notes: `docs/architecture.md`, `docs/agents.md`, `docs/schema.md`,
`docs/streaming.md`, `docs/oauth.md`, and the architectural change log at
`docs/ARCHITECTURE_CHANGES.md`.

## Stack

- **Backend** — Python 3.12, FastAPI, Agno (agent framework), Claude Haiku 4.5
  (orchestrator) + Claude Sonnet 4.6 (specialists)
- **Frontend** — Next.js 15, TypeScript, Tailwind, Zustand
- **Database** — Neon (PostgreSQL); Drizzle for schema/migrations; asyncpg from
  Python
- **Auth** — Better Auth (email+password, Google + Microsoft social, JWT plugin)
- **Cache** — Upstash Redis
- **Integrations** — Microsoft Graph (Mail / Calendar / To Do), Google Calendar
  API, Telegram Bot API
- **Deploy** — Railway (backend), Vercel (frontend)

## Running locally

```sh
# Backend
cd backend
cp .env.example .env          # Neon URL, Better Auth secret, Microsoft / Google OAuth, etc.
uv sync                       # or: pip install -e .
uvicorn main:app --reload

# Frontend
cd frontend
cp .env.example .env.local    # same DATABASE_URL, NEXT_PUBLIC_BETTER_AUTH_URL, etc.
npm install
npx drizzle-kit push          # applies the Drizzle schema to Neon
npm run dev
```

Open <http://localhost:3000>, sign up, connect Microsoft (and/or Google) from
the Hub, and start chatting.

## Status

`docs/STATUS.md` has the running log. Headline:

**Shipped**
- Chat with streaming, cross-session memory, conversation history sidebar,
  token cost tracking with a daily cap.
- Approval cards for every write — preview, approve / reject inline.
- Microsoft 365 + Google Calendar integrations, OAuth + Fernet-encrypted
  tokens, automatic refresh, key-rotation script.
- Auth overhaul — email+password, Google + Microsoft social, password
  strength meter, friendly error mapping.
- **Telegram as a peer surface** — `/start <code>` pairing, free-text
  inbound, inline-button approvals, webhook secret enforcement.
- Production deploy — Vercel + Railway, Neon dev / prod branch split.

**Open**
- Sign-in via passkey / Touch ID (Better Auth `passkey()` plugin).
- `/privacy` and `/terms` static pages (needed for Google OAuth verification
  before the consent screen can go public).
- Roadmap: see `docs/ROADMAP.md`. Notion, Slack, and GitHub agents next; then
  proactive / scheduled agents (morning briefings via Telegram).
