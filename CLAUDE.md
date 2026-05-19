# Orbit

Personal AI assistant connecting Outlook Mail, Calendar, and To Do through one chat interface with a real-time activity dashboard.

**One-liner:** Orbit is a personal AI assistant that connects to your email, calendar, and tasks through one chat interface, with a live dashboard showing everything it does.

## Stack

- Backend: Python 3.12, FastAPI, Agno (agent framework), Claude Sonnet 4.6
- Frontend: Next.js 15, TypeScript, Tailwind CSS
- Database: Neon (PostgreSQL), Drizzle ORM (schema/migrations), asyncpg (Python queries)
- Auth: Better Auth (email+password, JWT plugin for cross-service validation)
- Cache: Upstash Redis (SSE buffering, rate limiting)
- Deploy: Railway (backend), Vercel (frontend)
- Microsoft integration: Microsoft Graph API via `O365` library (python-o365), MSAL for auth

## Project structure

- `backend/` — Python FastAPI app (we write our own server, NOT AgentOS)
- `backend/agents/` — Agno agent definitions (orchestrator, email, calendar, tasks)
- `backend/tools/` — `@tool`-decorated functions wrapping Microsoft Graph API via O365
- `backend/services/` — Database pool, encryption, Microsoft OAuth token management, Redis
- `backend/repositories/` — asyncpg repository layer (one file per domain: conversations, messages, activity, approvals, integrations)
- `backend/api/` — FastAPI route handlers (chat SSE, action approval, OAuth callbacks)
- `frontend/` — Next.js dashboard with chat panel, activity feed, approval cards
- `frontend/src/db/` — Drizzle schema (single source of truth) and client
- `frontend/src/lib/auth.ts` — Better Auth server config
- `frontend/src/lib/auth-client.ts` — Better Auth client
- `docs/` — Architecture, agent specs, schema, streaming design, OAuth flow

## Architecture (read @docs/ for details)

- Agno `Agent` with `team=[email_agent, calendar_agent, tasks_agent]` as orchestrator
- We use Agno's Agent, Team, @tool, memory, sessions, streaming — but NOT AgentOS
- Our own FastAPI server wraps `orchestrator.arun()` and streams RunOutputEvents as SSE
- `@tool(requires_confirmation=True)` on all write operations
- Deterministic tool calls for simple commands; agent delegation for judgment calls
- All Microsoft APIs (Mail, Calendar, To Do) go through Microsoft Graph via one OAuth token
- Auth: Better Auth handles signup/signin, session management, and JWT generation
- Backend validates sessions by looking up the session token in the `sessions` table via asyncpg
- No RLS — app-level `WHERE user_id = $1` in every repository query

## Database

- Schema defined in `frontend/src/db/schema.ts` (Drizzle) — single source of truth
- Push schema changes: `cd frontend && npx drizzle-kit push`
- Backend uses asyncpg with raw SQL via repository pattern (`backend/repositories/`)
- Connection pool initialized in FastAPI lifespan (`services/database.py`)
- Tables: users, sessions, accounts, verifications (Better Auth), user_preferences, integrations, conversations, messages, activity_log, pending_approvals (app)

## Microsoft Graph API details

- Library: `O365` (python-o365) — wraps Microsoft Graph with Pythonic interface
- Auth library: `msal` — handles OAuth2 authorization code flow + token refresh
- Single app registration in Azure Portal covers all three services
- Scopes: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Tasks.ReadWrite`, `User.Read`
- Token endpoint: `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token`
- Graph base URL: `https://graph.microsoft.com/v1.0`
- O365 Account object handles token caching and automatic refresh

## Commands

- Backend: `cd backend && uvicorn main:app --reload`
- Frontend: `cd frontend && npm run dev`
- Typecheck: `cd frontend && npx tsc --noEmit`
- Lint: `cd backend && ruff check .`
- Format: `cd backend && ruff format .`
- Schema push: `cd frontend && npx drizzle-kit push`
- Test agent: `cd backend && python test_agent.py`

## Env vars

### Backend (`backend/.env`)
- `ANTHROPIC_API_KEY` — Claude API key
- `DATABASE_URL` — Neon PostgreSQL connection string
- `BETTER_AUTH_SECRET` — shared secret for session validation
- `BETTER_AUTH_URL` — Better Auth server URL (http://localhost:3000)
- `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN` — optional Redis
- `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI` — Azure AD OAuth
- `ENCRYPTION_KEY` — Fernet key for token encryption
- `FRONTEND_URL` — CORS origin

### Frontend (`frontend/.env.local`)
- `NEXT_PUBLIC_API_URL` — backend URL (http://localhost:8000)
- `NEXT_PUBLIC_BETTER_AUTH_URL` — Better Auth URL (http://localhost:3000)
- `DATABASE_URL` — Neon PostgreSQL connection string (same as backend)
- `BETTER_AUTH_SECRET` — Better Auth secret (same as backend)
- `BETTER_AUTH_URL` — Better Auth URL (http://localhost:3000)

## Code style

- Python: snake_case, type hints on all functions, ruff for formatting
- TypeScript: camelCase, strict mode, named exports only, no `any` types
- Agno tools: always include `Args:` section in docstring — the LLM reads this as the tool schema
- Agent instructions: list of strings, not long paragraphs
- Return JSON strings from tools, not dicts or O365 objects

## Rules

- Never commit API keys, client secrets, or tokens. Environment variables only
- Never use `agent.print_response()` in production. Use `agent.arun()` for async
- All database writes scoped by user_id via WHERE clause in repository queries
- Microsoft OAuth tokens stored encrypted in `integrations` table
- Every write tool MUST have `requires_confirmation=True`
- O365 objects must be serialized to JSON strings before returning from tools
- When compacting, preserve the list of modified files and current task status

## Context docs (read before working in these areas)

- Architecture overview: @docs/architecture.md
- Agent definitions and routing logic: @docs/agents.md
- Database schema: @docs/schema.md
- SSE streaming design and event types: @docs/streaming.md
- Microsoft OAuth flow and token management: @docs/oauth.md
