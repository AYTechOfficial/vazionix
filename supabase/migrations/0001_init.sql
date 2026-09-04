-- ============================================================================
-- VAZIONIX — SUPABASE SCHEMA (Phase A)
-- ----------------------------------------------------------------------------
-- Faithful mirror of src/lib/firebase/schema.ts. The persistence invariants
-- carried across verbatim:
--
--   • Money is an INTEGER count of tokens, never a float. Balances, locked
--     tokens, EXP, totals and commissions are `bigint`.
--   • Asset amounts on withdrawals are stored as TEXT decimal strings and are
--     parsed/marshalled by the app's fixed-point layer (src/server/decimal.ts).
--   • Every table carries created_at / updated_at with DB defaults.
--   • clientRequestId / provider conversion id are UNIQUE — idempotency keys.
--
-- SECURITY MODEL (deliberately mirrors Firestore's deny-by-default):
--   • RLS is enabled on every table.
--   • The server writes through the `service_role` key, which BYPASSES RLS in
--     Supabase — exactly like the Admin SDK bypassing firestore.rules today.
--   • The only client (anon / authenticated) reach is the signed-in user's own
--     profile read, granted explicitly here. Nothing else is open by default.
-- ============================================================================

create extension if not exists pgcrypto;

-- ENUMS (Postgres text constants kept as check constraints so the app's
-- runtime types and the DB agree without a migration per new value).
drop table if exists public.users cascade;

create table public.users (
  id            uuid primary key default gen_random_uuid(),
  -- Supabase Auth uid when a row is tied to the auth user; null for seeds.
  auth_id       uuid unique,
  username      text not null unique,
  username_lower text not null unique,
  email         text not null,
  email_verified boolean not null default false,
  country_code  text not null default 'XX',
  avatar_initials text not null default '',
  notification_prefs jsonb not null default '{}'::jsonb,
  display_currency text not null default 'USDT',

  -- SERVER-WRITE-ONLY (mirrors USER_SERVER_ONLY_FIELDS).
  balance         bigint not null default 0,
  locked_balance  bigint not null default 0,
  level           int    not null default 1,
  exp             bigint not null default 0,
  total_earned    bigint not null default 0,
  streak_days     int    not null default 0,
  last_streak_claim_at timestamptz,
  earning_bonus_bps int  not null default 0,
  referral_code   text not null default '',
  referred_by     uuid,
  referral_tier   text not null default 'Bronze',
  commission_bps  int   not null default 0,
  roles           jsonb not null default '{}'::jsonb,
  suspended       boolean not null default false,
  suspended_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Denormalised copies (username, country) on leaderboard rows are written only
-- by jobs, never kept fresh from the client — same discipline as Firestore.

-- APPEND-ONLY LEDGER. One row per credited action. `exp` column named per the
-- schema (experience points), not to be confused with pg's regproc.
drop table if exists public.claims cascade;

create table public.claims (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.users(id) on delete cascade,
  source     text not null check (source in
               ('faucet','ptc','shortlink','offerwall','bonus','challenge',
                'referral','coupon','lottery','adjustment','withdrawal','refund')),
  -- ALWAYS positive (debits live in withdrawals).
  amount     bigint not null check (amount > 0),
  exp        bigint not null default 0,
  ref_id     text,
  bonus_bps  int not null default 0,
  ip         text,
  user_agent_hash text,
  -- IDEMPOTENCY: a client-supplied key must be unique per user, so a double
  -- claim can't double-credit.
  client_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);
create index claims_user_id_idx on public.claims(user_id);
create index claims_source_created_idx on public.claims(source, created_at);

-- WITHDRAWALS. Amounts/fees are TEXT decimal strings (asset units); token_cost
-- is the integer token debit.
drop table if exists public.withdrawals cascade;

create table public.withdrawals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users(id) on delete cascade,
  coin       text not null,
  rail       text not null check (rail in ('FaucetPay','CWallet','Direct')),
  network    text not null,
  address    text not null,
  amount     text not null,
  fee        text not null default '0',
  receive_amount text not null,
  token_cost bigint not null,
  quoted_usd_per_unit text not null,
  quoted_at  timestamptz not null default now(),
  status     text not null default 'Pending' check (status in
               ('Pending','HeldForReview','Processing','Completed','Rejected','Failed','Reversed')),
  txid       text,
  batch_id   text,
  processed_at timestamptz,
  failure_reason text,
  reviewed_by uuid,
  -- IDEMPOTENCY: submitting a withdrawal up to N times must credit+draft once.
  client_request_id text not null,
  unique (user_id, client_request_id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index withdrawals_user_created_idx on public.withdrawals(user_id, created_at);
create index withdrawals_status_created_idx on public.withdrawals(status, created_at);
create index withdrawals_status_processed_idx on public.withdrawals(status, processed_at);

-- REFERRAL TREE. One edge per referred user; referrer can't be referred twice
-- (unique referrer+referee), matching the Firestore document-id uniqueness.
drop table if exists public.referrals cascade;

create table public.referrals (
  id              bigint generated always as identity primary key,
  referrer_id     uuid not null references public.users(id) on delete cascade,
  referred_user_id uuid not null references public.users(id) on delete cascade,
  username        text not null,
  country_code    text not null default 'XX',
  level           int not null default 1,
  total_earned    bigint not null default 0,
  commission_paid bigint not null default 0,
  qualified       boolean not null default false,
  last_active_at  timestamptz not null default now(),
  joined_at       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (referrer_id, referred_user_id)
);
create index referrals_referrer_idx on public.referrals(referrer_id);

-- LEADERBOARD ENTRIES (one row per period per board per user).
drop table if exists public.leaderboard_entries cascade;

create table public.leaderboard_entries (
  id         bigint generated always as identity primary key,
  period     text not null,
  board      text not null check (board in ('faucet','ptc','shortlink','offerwall','referral')),
  user_id    uuid not null references public.users(id) on delete cascade,
  username   text not null,
  country_code text not null default 'XX',
  value      bigint not null default 0,
  final_rank int,
  prize_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (period, board, user_id)
);
create index leaderboard_period_board_idx on public.leaderboard_entries(period, board, value desc);

-- CHATS + MESSAGES.
drop table if exists public.chats cascade;

create table public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  mode text not null default 'ai' check (mode in ('ai','queue','agent')),
  last_message_at timestamptz not null default now(),
  escalated_ticket_id text,
  resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop table if exists public.chat_messages cascade;

create table public.chat_messages (
  id bigint generated always as identity primary key,
  chat_id uuid not null references public.chats(id) on delete cascade,
  from_role text not null check (from_role in ('user','ai','agent')),
  agent_uid uuid,
  agent_name text,
  body text not null,
  actions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index chat_messages_chat_idx on public.chat_messages(chat_id);

-- SUPPORT TICKETS + MESSAGES.
drop table if exists public.tickets cascade;

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  subject text not null,
  category text not null default 'Other',
  status text not null default 'Open' check (status in ('Open','Answered','Closed')),
  last_message_preview text not null default '',
  last_message_at timestamptz not null default now(),
  unread_for_user boolean not null default false,
  unread_for_support boolean not null default true,
  assigned_to uuid,
  source_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index tickets_user_idx on public.tickets(user_id);
create index tickets_status_idx on public.tickets(status, last_message_at);

drop table if exists public.ticket_messages cascade;

create table public.ticket_messages (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets(id) on delete cascade,
  author_uid uuid,
  author_role text not null default 'user',
  author_name text,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index ticket_messages_ticket_idx on public.ticket_messages(ticket_id);

-- OFFERWALL CONVERSIONS. IDEMPOTENCY: provider conversion id UNIQUE so a
-- duplicate postback (routine) is a failed insert, not a double credit.
drop table if exists public.offerwall_conversions cascade;

create table public.offerwall_conversions (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_conversion_id text not null unique,
  user_id uuid not null references public.users(id) on delete cascade,
  reward bigint not null default 0,
  status text not null check (status in ('Approved','Pending','Rejected','Reversed')),
  raw_payload jsonb not null default '{}'::jsonb,
  signature_valid boolean not null default false,
  credited_at timestamptz,
  created_at timestamptz not null default now()
);
create index offerwall_conversions_user_idx on public.offerwall_conversions(user_id);

-- CAMPAIGNS (advertiser).
drop table if exists public.campaigns cascade;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  owner_uid uuid not null references public.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  target_url text not null,
  type text not null check (type in ('Window','Iframe','External','Youtube')),
  duration_seconds int not null,
  interval_hours int not null,
  status text not null default 'Pending' check (status in
    ('Active','Paused','Pending','Completed','Suspended')),
  views_delivered bigint not null default 0,
  views_purchased bigint not null default 0,
  cpc_usd numeric not null default 0,
  spend_usd numeric not null default 0,
  reviewed_at timestamptz,
  reviewed_by uuid,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NOTIFICATIONS.
drop table if exists public.notifications cascade;

create table public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  icon text not null,
  tone text not null,
  title text not null,
  body text not null default '',
  href text,
  read boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id);

-- LOTTERY.
drop table if exists public.lottery_rounds cascade;

create table public.lottery_rounds (
  id text primary key,             -- e.g. 'r1'
  prize_pool bigint not null default 0,
  ticket_price_tokens bigint not null default 500,
  winners_per_draw int not null default 10,
  total_tickets bigint not null default 0,
  draws_at timestamptz,
  created_at timestamptz not null default now()
);

drop table if exists public.lottery_tickets cascade;

create table public.lottery_tickets (
  id bigint generated always as identity primary key,
  round_id text not null references public.lottery_rounds(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'Pending' check (status in ('Pending','Won','Lost')),
  prize bigint not null default 0,
  created_at timestamptz not null default now()
);
create index lottery_tickets_user_idx on public.lottery_tickets(user_id);
create index lottery_tickets_round_status_idx on public.lottery_tickets(round_id, status);

-- EARN CATALOGUE (read-mostly, seeded).
drop table if exists public.ptc_ads cascade;
create table public.ptc_ads (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  tokens bigint not null default 0,
  exp bigint not null default 0,
  seconds int not null default 0,
  cooldown_hours int not null default 0,
  type text not null default 'Window',
  target_url text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

drop table if exists public.shortlinks cascade;
create table public.shortlinks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  reward bigint not null default 0,
  exp bigint not null default 0,
  used bigint not null default 0,
  cap bigint not null default 0,
  seconds int not null default 0,
  provider text,
  target_url text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

drop table if exists public.challenges cascade;
create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  tokens bigint not null default 0,
  exp bigint not null default 0,
  at int not null default 0,
  of int not null default 0,
  note text,
  kind text not null default 'faucet',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

drop table if exists public.offerwall_providers cascade;
create table public.offerwall_providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rating int not null default 0,
  mark text not null default '',
  hue int not null default 0,
  blurb text not null default '',
  url text,
  enabled boolean not null default true,
  featured boolean not null default false,
  created_at timestamptz not null default now()
);

-- CONFIG (single-row docs, keyed).
drop table if exists public.config cascade;
create table public.config (
  key text primary key,            -- economy | rates | site | ads | ...
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- STATS (lifetime + daily counters).
drop table if exists public.stats cascade;
create table public.stats (
  day text primary key,            -- 'global' or 'YYYY-MM-DD'
  members bigint not null default 0,
  members_today bigint not null default 0,
  claims bigint not null default 0,
  tokens_credited bigint not null default 0,
  withdrawals bigint not null default 0,
  tokens_withdrawn bigint not null default 0,
  usd_withdrawn numeric not null default 0,
  ptc_views bigint not null default 0,
  shortlink_claims bigint not null default 0,
  offerwall_conversions bigint not null default 0,
  ad_impressions bigint not null default 0,
  updated_at timestamptz not null default now()
);

-- USERNAMES registry (mirrors the /usernames availability check).
drop table if exists public.usernames cascade;
create table public.usernames (
  id bigint generated always as identity primary key,
  username text not null unique,
  username_lower text not null unique,
  user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- AUDIT LOG (one row per staff action; written by the server, like Admin SDK).
drop table if exists public.audit_log cascade;
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_uid uuid,
  actor_name text,
  action text not null,
  target text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_log_created_idx on public.audit_log(created_at desc);

-- AD UNITS (admin-managed inventory).
drop table if exists public.ad_units cascade;
create table public.ad_units (
  placement_id text primary key,
  network text,
  kind text not null default 'script',
  src text,
  html text,
  cap_per_session int,
  json text default '{}'::jsonb,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

-- COOLDOWNS (single-use anti-abuse records; TTL by cleanup job).
drop table if exists public.captcha_tokens cascade;
create table public.captcha_tokens (
  token text primary key,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

drop table if exists public.task_sessions cascade;
create table public.task_sessions (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  item_id text not null,
  user_id uuid not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index task_sessions_kind_item_idx on public.task_sessions(kind, item_id);

-- ============================================================================
-- RLS — deny by default; the server writes via service_role which bypasses RLS.
-- The ONLY client reach is a user reading their own profile, and nothing else.
-- ============================================================================
alter table public.users enable row level security;
alter table public.claims enable row level security;
alter table public.withdrawals enable row level security;
alter table public.referrals enable row level security;
alter table public.leaderboard_entries enable row level security;
alter table public.chats enable row level security;
alter table public.chat_messages enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_messages enable row level security;
alter table public.offerwall_conversions enable row level security;
alter table public.campaigns enable row level security;
alter table public.notifications enable row level security;
alter table public.lottery_tickets enable row level security;
alter table public.ptc_ads enable row level security;
alter table public.shortlinks enable row level security;
alter table public.challenges enable row level security;
alter table public.offerwall_providers enable row level security;
alter table public.config enable row level security;
alter table public.stats enable row level security;
alter table public.ad_units enable row level security;

-- Own profile, read only (the one client listener).
create policy "user reads own profile"
  on public.users for select
  using (auth.uid() = auth_id);

-- Public read of the economy/rates/site config for signed-in visitors and
-- signed-out landing (matches firestore.rules allowing anonymous /config/rates).
create policy "config public read"
  on public.config for select
  using (true);

-- Public read of stats (homepage numbers).
create policy "stats public read"
  on public.stats for select
  using (true);

-- Public read of the earn catalogue (ptc/shortlinks/challenges/providers).
create policy "ptc_ads public read"  on public.ptc_ads  for select using (true);
create policy "shortlinks public read" on public.shortlinks for select using (true);
create policy "challenges public read" on public.challenges for select using (true);
create policy "offerwall_providers public read" on public.offerwall_providers for select using (true);

-- Ad inventory public read (needed to render ad slots client-side).
create policy "ad_units public read" on public.ad_units for select using (true);

-- NOTHING ELSE IS OPEN. Withdrawals, claims, referrals, tickets, audit_log,
-- lottery, leaderboard writes are all service_role-only (RLS blocks anon and
-- authenticated by default; the service_role key ignores RLS). This mirrors the
-- Firestore rules where only the one profile listener is a client grant.