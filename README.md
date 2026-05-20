# Orbit

A personal AI chief-of-staff that connects email, calendar, and tasks through a
single chat interface — with a live activity dashboard showing every action it
takes and an approval card for every write.

> Built solo over a few months. One assistant, one shared brain, multiple
> channels: a web dashboard today and SMS as a peer surface (gated on Twilio
> toll-free verification).

## What it does

- **Chat** — "What's on my calendar today?" / "Reply to Sarah's email, formal
  tone" / "Find action items in my recent emails and create tasks for them."
- **Live activity feed** — Every tool call, agent delegation, and approval
  shows up in real time, color-coded by domain (email, calendar, tasks).
- **Approval cards** — Every write operation (send email, create event, delete
  task) pauses for a tool-specific preview. Approve or reject inline.
- **Cross-session memory** — "I prefer morning meetings" persists across
  conversations via Agno memory.
- **Multi-provider** — Outlook Mail / Calendar / To Do via Microsoft Graph,
  with Google Calendar as a parallel per-user opt-in.

## Architecture

```
Next.js 15 (web)              FastAPI (Python 3.12)
  ├─ Better Auth (sessions)    ├─ Agno Team (route mode, Claude Sonnet 4.6)
  ├─ Drizzle (schema SoT)      │   ├─ Email Agent  (Outlook)
  ├─ Zustand stores            │   ├─ Calendar Agent (Outlook OR Google)
  └─ SSE consumer              │   └─ Tasks Agent  (Microsoft To Do)
                               ├─ Repositories (asyncpg, raw SQL)
                               ├─ Token manager (MSAL + Fernet)
                               └─ SSE pipeline → POST-based stream
                Neon Postgres (single DB, two schemas: public + agno)
                Upstash Redis (OAuth state + rate limiting)
```

A few design choices worth a closer look:

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
  protocol. Direct-tool fallback covers server restarts.
- **No RLS** — every repository query carries `WHERE user_id = $1` at the
  application layer. Drizzle defines the schema once; asyncpg reads it.

For deeper notes: `docs/architecture.md`, `docs/agents.md`, `docs/schema.md`,
`docs/streaming.md`, `docs/oauth.md`, and the architectural change log at
`docs/ARCHITECTURE_CHANGES.md`.

## Stack

- **Backend** — Python 3.12, FastAPI, Agno (agent framework), Claude Sonnet 4.6
- **Frontend** — Next.js 15, TypeScript, Tailwind, Zustand
- **Database** — Neon (PostgreSQL); Drizzle for schema/migrations; asyncpg from
  Python
- **Auth** — Better Auth (email+password, JWT plugin)
- **Cache** — Upstash Redis
- **Integrations** — Microsoft Graph (Mail / Calendar / To Do), Google Calendar
  API, Twilio (SMS — code complete, awaiting carrier verification)
- **Deploy** — Railway (backend), Vercel (frontend)

## Running locally

```sh
# Backend
cd backend
cp .env.example .env          # fill in Neon URL, Better Auth secret, Microsoft / Google OAuth, etc.
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
Settings, and start chatting.

## Status

`docs/STATUS.md` has the running log. Headline:

- **Working** — chat, streaming, approvals, memory, history, conversation
  sidebar, token cost tracking, Microsoft + Google integration, friendly
  error translation.
- **In flight** — SMS surface, built end-to-end
  (`backend/services/sms_dispatch.py`, `backend/services/run_resume.py`,
  `backend/api/routes/sms.py`); gated on Twilio toll-free verification.
- **Roadmap** — see `docs/ROADMAP.md`. Notion, Slack, and GitHub agents next;
  then proactive/scheduled agents.
