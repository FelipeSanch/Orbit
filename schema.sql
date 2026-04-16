-- Orbit database schema for Supabase
-- Run this in the Supabase SQL editor

-- Enable pgvector for future semantic search
create extension if not exists vector;

-- ============================================================
-- User preferences
-- ============================================================
create table public.user_preferences (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    timezone text not null default 'UTC',
    default_calendar_id text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id)
);

alter table public.user_preferences enable row level security;

create policy "Users can CRUD own preferences"
    on public.user_preferences for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ============================================================
-- OAuth integrations (encrypted tokens — backend only)
-- ============================================================
create table public.integrations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    provider text not null default 'microsoft',
    encrypted_access_token text not null,
    encrypted_refresh_token text not null,
    token_expiry timestamptz not null,
    scopes text[] not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, provider)
);

alter table public.integrations enable row level security;

create policy "Service role only"
    on public.integrations for all
    using (auth.role() = 'service_role');

-- ============================================================
-- Conversations (chat sessions)
-- ============================================================
create table public.conversations (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    title text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

alter table public.conversations enable row level security;

create policy "Users can CRUD own conversations"
    on public.conversations for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- ============================================================
-- Messages
-- ============================================================
create table public.messages (
    id uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    role text not null check (role in ('user', 'assistant', 'system')),
    content text not null,
    metadata jsonb default '{}',
    created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

create policy "Users can CRUD own messages"
    on public.messages for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

create index idx_messages_conversation on public.messages(conversation_id, created_at);

-- ============================================================
-- Activity log
-- ============================================================
create table public.activity_log (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    conversation_id uuid references public.conversations(id) on delete set null,
    event_type text not null,
    event_data jsonb not null default '{}',
    created_at timestamptz not null default now()
);

alter table public.activity_log enable row level security;

create policy "Users can read own activity"
    on public.activity_log for select
    using (auth.uid() = user_id);

create policy "Service can insert activity"
    on public.activity_log for insert
    with check (auth.role() = 'service_role');

create index idx_activity_user_time on public.activity_log(user_id, created_at desc);

-- ============================================================
-- Pending approvals for write operations
-- ============================================================
create table public.pending_approvals (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    conversation_id uuid not null references public.conversations(id) on delete cascade,
    run_id text not null,
    tool_name text not null,
    tool_args jsonb not null,
    tool_call_id text not null,
    status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
    created_at timestamptz not null default now(),
    resolved_at timestamptz
);

alter table public.pending_approvals enable row level security;

create policy "Users can read own approvals"
    on public.pending_approvals for select
    using (auth.uid() = user_id);

create policy "Users can update own approvals"
    on public.pending_approvals for update
    using (auth.uid() = user_id);

create policy "Service can insert approvals"
    on public.pending_approvals for insert
    with check (auth.role() = 'service_role');

create index idx_approvals_pending
    on public.pending_approvals(user_id, status)
    where status = 'pending';
