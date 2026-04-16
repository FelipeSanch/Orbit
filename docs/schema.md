# Database Schema

All tables live in the `public` schema on Supabase (PostgreSQL). Every table has RLS enabled and `user_id` scoping.

## Tables

### `user_preferences`
User settings like timezone and default calendar.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → auth.users | UNIQUE |
| timezone | TEXT | Default 'UTC' |
| default_calendar_id | TEXT | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**RLS:** Users can CRUD own rows (`auth.uid() = user_id`).

### `integrations`
Encrypted OAuth tokens. Backend-only access.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → auth.users | UNIQUE(user_id, provider) |
| provider | TEXT | e.g. 'microsoft' |
| encrypted_access_token | TEXT | Fernet-encrypted |
| encrypted_refresh_token | TEXT | Fernet-encrypted |
| token_expiry | TIMESTAMPTZ | |
| scopes | TEXT[] | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**RLS:** Service role only. Frontend cannot access.

### `conversations`
Chat sessions.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → auth.users | |
| title | TEXT | Auto-generated after first exchange |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**RLS:** Users can CRUD own rows.

### `messages`
Messages within conversations.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| conversation_id | UUID FK → conversations | CASCADE delete |
| user_id | UUID FK → auth.users | |
| role | TEXT | 'user', 'assistant', 'system' |
| content | TEXT | |
| metadata | JSONB | run_id, session_id, etc. |
| created_at | TIMESTAMPTZ | |

**RLS:** Users can CRUD own rows.
**Index:** `(conversation_id, created_at)` for chronological message loading.

### `activity_log`
Tool calls, delegations, approvals.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → auth.users | |
| conversation_id | UUID FK → conversations | Nullable, SET NULL on delete |
| event_type | TEXT | 'tool_call', 'approval_required', etc. |
| event_data | JSONB | Event-specific payload |
| created_at | TIMESTAMPTZ | |

**RLS:** Users can SELECT own rows. Service role can INSERT.
**Index:** `(user_id, created_at DESC)` for reverse-chronological feed.

### `pending_approvals`
Write operations awaiting user confirmation.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → auth.users | |
| conversation_id | UUID FK → conversations | CASCADE delete |
| run_id | TEXT | Agno run identifier |
| tool_name | TEXT | e.g. 'send_email' |
| tool_args | JSONB | Tool arguments |
| tool_call_id | TEXT | |
| status | TEXT | 'pending', 'approved', 'rejected', 'expired' |
| created_at | TIMESTAMPTZ | |
| resolved_at | TIMESTAMPTZ | |

**RLS:** Users can SELECT and UPDATE own rows. Service role can INSERT.
**Index:** `(user_id, status) WHERE status = 'pending'` for quick pending lookups.

## Extensions

- `pgvector` enabled for future semantic search capability.
