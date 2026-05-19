# Database Schema

All tables live in the `public` schema on Neon (PostgreSQL). Schema is defined in `frontend/src/db/schema.ts` using Drizzle ORM — that file is the single source of truth. No RLS; app-level `WHERE user_id = $1` in every query.

## Auth Tables (managed by Better Auth)

### `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | `defaultRandom()` |
| name | TEXT | Default '' |
| email | TEXT | UNIQUE |
| email_verified | BOOLEAN | Default false |
| image | TEXT | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `sessions`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | UUID FK → users | CASCADE delete |
| token | TEXT | UNIQUE — used for auth validation |
| expires_at | TIMESTAMPTZ | |
| ip_address | TEXT | Nullable |
| user_agent | TEXT | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `accounts`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| user_id | UUID FK → users | CASCADE delete |
| account_id | TEXT | |
| provider_id | TEXT | |
| access_token | TEXT | Nullable |
| refresh_token | TEXT | Nullable |
| access_token_expires_at | TIMESTAMPTZ | Nullable |
| refresh_token_expires_at | TIMESTAMPTZ | Nullable |
| scope | TEXT | Nullable |
| id_token | TEXT | Nullable |
| password | TEXT | Nullable (hashed) |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `verifications`
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT PK | |
| identifier | TEXT | |
| value | TEXT | |
| expires_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

## Application Tables

### `user_preferences`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | UNIQUE, CASCADE delete |
| timezone | TEXT | Default 'UTC' |
| default_calendar_id | TEXT | Nullable |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `integrations`
Encrypted OAuth tokens. Backend-only access.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | UNIQUE(user_id, provider) |
| provider | TEXT | Default 'microsoft' |
| encrypted_access_token | TEXT | Fernet-encrypted |
| encrypted_refresh_token | TEXT | Fernet-encrypted |
| token_expiry | TIMESTAMPTZ | |
| scopes | TEXT[] | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique index:** `(user_id, provider)` for upsert support.

### `conversations`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | CASCADE delete |
| title | TEXT | Nullable, auto-generated |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `messages`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| conversation_id | UUID FK → conversations | CASCADE delete |
| user_id | UUID FK → users | CASCADE delete |
| role | TEXT | 'user', 'assistant', 'system' |
| content | TEXT | |
| metadata | JSONB | run_id, session_id, etc. |
| created_at | TIMESTAMPTZ | |

**Index:** `(conversation_id, created_at)` for chronological message loading.

### `activity_log`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | CASCADE delete |
| conversation_id | UUID FK → conversations | Nullable, SET NULL on delete |
| event_type | TEXT | 'tool_call', 'approval_required', etc. |
| event_data | JSONB | Event-specific payload |
| created_at | TIMESTAMPTZ | |

**Index:** `(user_id, created_at)` for reverse-chronological feed.

### `pending_approvals`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users | CASCADE delete |
| conversation_id | UUID FK → conversations | CASCADE delete |
| run_id | TEXT | Agno run identifier |
| session_id | TEXT | Agno session identifier — required to resume the paused run |
| tool_name | TEXT | e.g. 'send_email' |
| tool_args | JSONB | Tool arguments |
| tool_call_id | TEXT | |
| status | TEXT | 'pending', 'approved', 'rejected', 'expired' |
| created_at | TIMESTAMPTZ | |
| resolved_at | TIMESTAMPTZ | Nullable |

**Index:** `(user_id, status)` for quick pending lookups.
