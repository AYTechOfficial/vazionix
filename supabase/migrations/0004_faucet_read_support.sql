-- ============================================================================
-- VAZIONIX — FAUCET / DAILY-CAP READ SUPPORT (Phase B)
-- ----------------------------------------------------------------------------
-- The faucet path needs server state the 0001 schema did not carry:
--   • per-user, per-kind cooldowns (the faucet window timer is server state,
--     never client-side)
--   • a UTC day marker on claims so the daily cap (countToday) is one indexed
--     query instead of a `created_at <-> day` expression, which Postgres refuses
--     in a bare index expression.
--
-- The claim counter functions (countToday) and the faucet cooldown read/write are
-- wired to these in src/server/data-supabase.ts.
-- ============================================================================

-- Day-of-claim marker (UTC), populated by the credit/debit functions and read by
-- countToday for the daily cap. Indexed as a plain column so the count is cheap.
alter table public.claims add column if not exists day text;
create index if not exists claims_user_day_idx on public.claims(user_id, source, day);

-- Per-user, per-kind server-state cooldowns (faucet window, etc.).
create table if not exists public.user_cooldowns (
  user_id        uuid not null references public.users(id) on delete cascade,
  kind           text not null,
  next_at        timestamptz,
  last_claim_at  timestamptz,
  claims         int  not null default 0,
  updated_at     timestamptz not null default now(),
  primary key (user_id, kind)
);

-- The one grant an authenticated user needs: read their own cooldown state.
alter table public.user_cooldowns enable row level security;
drop policy if exists "user reads own cooldown" on public.user_cooldowns;
create policy "user reads own cooldown" on public.user_cooldowns
  for select using (auth.uid() = user_id);

-- Let the credit/debit functions stamp the UTC day on each claim, so countToday
-- and the daily cap work regardless of how the claim was written.
create or replace function public.set_claim_day()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.day is null then
    new.day := to_char(coalesce(new.created_at, now()) at time zone 'utc', 'YYYY-MM-DD');
  end if;
  return new;
end $$;

drop trigger if exists trg_claims_day on public.claims;
create trigger trg_claims_day
  before insert on public.claims
  for each row execute procedure public.set_claim_day();