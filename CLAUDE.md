# Orbit

Personal AI assistant connecting Outlook Mail, Calendar, and To Do through one chat interface with a real-time activity dashboard.

**One-liner:** Orbit is a personal AI assistant that connects to your email, calendar, and tasks through one chat interface, with a live dashboard showing everything it does.

## Stack

- Backend: Python 3.12, FastAPI, Agno (agent framework), Claude Sonnet 4.6
- Frontend: Next.js 15, TypeScript, Tailwind CSS
- Database: Supabase (PostgreSQL + pgvector + Auth + RLS)
- Cache: Upstash Redis (SSE buffering, rate limiting)
- Deploy: Railway (backend), Vercel (frontend)
- Microsoft integration: Microsoft Graph API via `O365` library (python-o365), MSAL for auth

## Project structure

- `backend/` — Python FastAPI app (we write our own server, NOT AgentOS)
- `backend/agents/` — Agno agent definitions (orchestrator, email, calendar, tasks)
- `backend/tools/` — `@tool`-decorated functions wrapping Microsoft Graph API via O365
- `backend/services/` — Event bus, permissions, Microsoft OAuth token management
- `backend/api/` — FastAPI route handlers (chat SSE, action approval, OAuth callbacks)
- `frontend/` — Next.js dashboard with chat panel, activity feed, approval cards
- `docs/` — Architecture, agent specs, schema, streaming design, OAuth flow
- `schema.sql` — Supabase database schema with RLS policies

## Architecture (read @docs/ for details)

- Agno `Agent` with `team=[email_agent, calendar_agent, tasks_agent]` as orchestrator
- We use Agno's Agent, Team, @tool, memory, sessions, streaming — but NOT AgentOS
- Our own FastAPI server wraps `orchestrator.arun()` and streams RunOutputEvents as SSE
- `@tool(requires_confirmation=True)` on all write operations
- Deterministic tool calls for simple commands; agent delegation for judgment calls
- All Microsoft APIs (Mail, Calendar, To Do) go through Microsoft Graph via one OAuth token
- Auth: Azure AD OAuth2 authorization code flow via MSAL, tokens stored in Supabase
- Supabase RLS on every custom table, user_id on every row

## Microsoft Graph API details

- Library: `O365` (python-o365) — wraps Microsoft Graph with Pythonic interface
- Auth library: `msal` — handles OAuth2 authorization code flow + token refresh
- Single app registration in Azure Portal covers all three services
- Scopes: `Mail.ReadWrite`, `Mail.Send`, `Calendars.ReadWrite`, `Tasks.ReadWrite`, `User.Read`, `offline_access`
- Token endpoint: `https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token`
- Graph base URL: `https://graph.microsoft.com/v1.0`
- O365 Account object handles token caching and automatic refresh

## Commands

- Backend: `cd backend && uvicorn main:app --reload`
- Frontend: `cd frontend && npm run dev`
- Typecheck: `cd frontend && npx tsc --noEmit`
- Lint: `cd backend && ruff check .`
- Format: `cd backend && ruff format .`
- Test agent: `cd backend && python test_agent.py`

## Code style

- Python: snake_case, type hints on all functions, ruff for formatting
- TypeScript: camelCase, strict mode, named exports only, no `any` types
- Agno tools: always include `Args:` section in docstring — the LLM reads this as the tool schema
- Agent instructions: list of strings, not long paragraphs
- Return JSON strings from tools, not dicts or O365 objects

## Rules

- Never commit API keys, client secrets, or tokens. Environment variables only
- Never use `agent.print_response()` in production. Use `agent.arun()` for async
- All database writes scoped by user_id. RLS enforces this
- Microsoft OAuth tokens stored encrypted in `integrations` table
- Every write tool MUST have `requires_confirmation=True`
- O365 objects must be serialized to JSON strings before returning from tools
- When compacting, preserve the list of modified files and current task status

## Context docs (read before working in these areas)

- Architecture overview: @docs/architecture.md
- Agent definitions and routing logic: @docs/agents.md
- Database schema and RLS policies: @docs/schema.md
- SSE streaming design and event types: @docs/streaming.md
- Microsoft OAuth flow and token management: @docs/oauth.md
