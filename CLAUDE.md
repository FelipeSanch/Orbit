# Orbit

Personal AI assistant connecting Gmail, Calendar, and Tasks through one chat interface with a real-time activity dashboard.

**One-liner:** Orbit is a personal AI assistant that connects to your email, calendar, and tasks through one chat interface, with a live dashboard showing everything it does.

## Stack

- Backend: Python 3.12, FastAPI, Agno (agent framework), Claude Sonnet 4.6
- Frontend: Next.js 15, TypeScript, Tailwind CSS
- Database: Supabase (PostgreSQL + pgvector + Auth + RLS)
- Cache: Upstash Redis (SSE buffering, rate limiting)
- Deploy: Railway (backend), Vercel (frontend)

## Project structure

- `backend/` — Python FastAPI app (we write our own server, NOT AgentOS)
- `backend/agents/` — Agno agent definitions (orchestrator, email, calendar, tasks)
- `backend/tools/` — `@tool`-decorated functions wrapping Google APIs
- `backend/services/` — Event bus, permissions, OAuth token management
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
- All Google APIs (Gmail, Calendar, Tasks) share one OAuth consent screen and token
- Supabase RLS on every custom table, user_id on every row

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
- Return JSON strings from tools, not dicts

## Rules

- Never commit API keys or tokens. Environment variables only
- Never use `agent.print_response()` in production. Use `agent.arun()` for async
- All database writes scoped by user_id. RLS enforces this
- Google OAuth tokens stored encrypted in `integrations` table
- Every write tool MUST have `requires_confirmation=True`
- When compacting, preserve the list of modified files and current task status

## Context docs (read before working in these areas)

- Architecture overview: @docs/architecture.md
- Agent definitions and routing logic: @docs/agents.md
- Database schema and RLS policies: @docs/schema.md
- SSE streaming design and event types: @docs/streaming.md
- Google OAuth flow and token refresh: @docs/oauth.md
