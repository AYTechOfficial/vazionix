-- ============================================================================
-- VAZIONIX — saved addresses (withdraw page) and withdrawals.uid backfill
-- ----------------------------------------------------------------------------
-- The withdraw read path (listWithdrawals / listAddresses) maps the app's uid
-- to Postgres. Withdrawals are keyed by user_id; the code reads by the app uid,
-- which IS public.users.id. Saved addresses get their own table.
-- ============================================================================

create table if not exists public.saved_addresses (
  id           text primary key,   -- base64url(coin:address), as the app derives
  user_id      uuid not null references public.users(id) on delete cascade,
  label        text not null default 'Saved address',
  address      text not null,
  coin         text not null,
  rail         text not null default 'FaucetPay',
  last_used_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists saved_addresses_user_idx on public.saved_addresses(user_id);

alter table public.saved_addresses enable row level security;
drop policy if exists "user reads own saved addresses" on public.saved_addresses;
create policy "user reads own saved addresses" on public.saved_addresses
  for select using (auth.uid() = user_id);

grant select, insert, update, delete on public.saved_addresses to service_role;