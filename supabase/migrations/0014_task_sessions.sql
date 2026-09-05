-- ============================================================================
-- VAZIONIX — TASK SESSIONS + PER-ITEM COOLDOWNS (PTC / shortlinks)
-- ----------------------------------------------------------------------------
-- The timed-task protocol (start -> wait N seconds -> complete) needs two pieces
-- of SERVER state, because the elapsed time must be measured between two server
-- timestamps rather than trusted from the client:
--
--   task_sessions      one open session per (user, kind, item); the token is
--                      single-use and deleted on completion, so a replay pays
--                      nothing.
--   user_cooldowns     already exists for the faucet; PTC/shortlinks reuse it
--                      with kind = 'ptc_<itemId>' / 'shortlink_<itemId>', and
--                      carry item_id/task_kind so one query can answer "when is
--                      each catalogue item available again for this user".
--
-- The 0001 task_sessions table had no token/user columns the engine needs, so it
-- is reshaped here rather than worked around.
-- ============================================================================

drop table if exists public.task_sessions cascade;

create table public.task_sessions (
  token            text primary key,
  user_id          uuid not null references public.users(id) on delete cascade,
  kind             text not null check (kind in ('ptc','shortlink')),
  item_id          text not null,
  required_seconds int  not null,
  started_at       timestamptz not null default now(),
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now()
);
create index task_sessions_user_item_idx on public.task_sessions(user_id, kind, item_id);
create index task_sessions_expires_idx on public.task_sessions(expires_at);

alter table public.task_sessions enable row level security;
-- Server-only: a client must never read another user's token.
grant select, insert, update, delete on public.task_sessions to service_role;

-- Per-item cooldowns ride on the existing user_cooldowns table. These columns let
-- the catalogue resolve every item's availability in ONE query.
alter table public.user_cooldowns add column if not exists task_kind text;
alter table public.user_cooldowns add column if not exists item_id text;
alter table public.user_cooldowns add column if not exists last_completed_at timestamptz;
create index if not exists user_cooldowns_kind_item_idx
  on public.user_cooldowns(user_id, task_kind);