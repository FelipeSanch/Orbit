# Architecture

## System Overview

Orbit is a personal AI assistant that connects Outlook Mail, Calendar, and Microsoft To Do through a single chat interface. It uses an Agno Team in **route mode** to delegate user requests to specialist agents.

```
┌──────────────────────────────────────────────────────────┐
│                    Frontend (Next.js 15)                  │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────┐    │
│  │ Chat UI  │  │ Activity Feed│  │ Approval Cards  │    │
│  └────┬─────┘  └──────┬───────┘  └────────┬────────┘    │
│       │               │                    │             │
│       └───────────────┼────────────────────┘             │
│                       │ SSE (POST-based)                 │
└───────────────────────┼──────────────────────────────────┘
                        │
┌───────────────────────┼──────────────────────────────────┐
│                 Backend (FastAPI)                         │
│  ┌────────────────────┴─────────────────────┐            │
│  │           SSE Event Translator           │            │
│  └────────────────────┬─────────────────────┘            │
│  ┌────────────────────┴─────────────────────┐            │
│  │         Agno Team (Route Mode)           │            │
│  │  ┌─────────┐ ┌──────────┐ ┌───────────┐ │            │
│  │  │  Email  │ │ Calendar │ │   Tasks   │ │            │
│  │  │  Agent  │ │  Agent   │ │   Agent   │ │            │
│  │  └────┬────┘ └────┬─────┘ └─────┬─────┘ │            │
│  └───────┼───────────┼─────────────┼────────┘            │
│  ┌───────┴───────────┴─────────────┴────────┐            │
│  │         Microsoft Graph API (O365)        │            │
│  │     Mail   │  Calendar  │  To Do          │            │
│  └──────────────────────────────────────────┘            │
│                                                          │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────┐     │
│  │  Supabase   │  │   Redis    │  │ Token Manager │     │
│  │  (Postgres) │  │  (Upstash) │  │  (Encryption) │     │
│  └─────────────┘  └────────────┘  └───────────────┘     │
└──────────────────────────────────────────────────────────┘
```

## Data Flow

1. User sends message via chat UI
2. Frontend POSTs to `/api/chat`, receives SSE stream
3. Backend creates/loads conversation, stores user message
4. Agno Team routes message to the appropriate specialist agent
5. Agent calls Microsoft Graph API tools via O365, streams content back
6. Event translator converts Agno events to our SSE protocol
7. Write tools pause for approval (`requires_confirmation=True`)
8. Frontend shows approval card, user approves/rejects
9. Backend continues the run on approval
10. Assistant response stored in messages table

## Key Design Decisions

### Route Mode over Coordinate Mode
Route mode lets the team leader analyze each message and delegate to exactly one specialist. For cross-domain queries, the leader makes sequential delegations. This is simpler and more predictable than coordinate mode.

### Custom SSE over Agno FastAPIApp
We wrap `team.arun()` ourselves to control the wire format, handle approvals, and log activity. Agno's built-in FastAPIApp doesn't support our approval flow.

### POST-based SSE
Standard `EventSource` only supports GET. We use `fetch()` with `ReadableStream` to POST the chat message and read the SSE response body.

### Factory/Closure Pattern for Tools
Microsoft credentials are injected into `@tool` functions via closures created by factory functions (e.g., `create_email_tools(token_manager, user_id)`). This keeps tools stateless while binding user-specific credentials.
