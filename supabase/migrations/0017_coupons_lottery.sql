-- ============================================================================
-- VAZIONIX — COUPONS, LOTTERY ROUND FIELDS, TICKET IDENTITY
-- ----------------------------------------------------------------------------
-- Coupons were never created in 0001. The redemption marker is a SEPARATE table
-- with a unique (code, user_id): that is what makes "one redemption per user"
-- race-safe, exactly as the Firestore marker document did.
-- ============================================================================

create table if not exists public.coupons (
  code            text primary key,
  tokens          bigint not null default 0,
  exp             bigint not null default 0,
  max_redemptions int,
  expires_at      timestamptz,
  enabled         boolean not null default true,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.coupon_redemptions (
  code       text not null references public.coupons(code) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (code, user_id)
);
create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions(user_id);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
-- No client policy: a readable coupon table is a list of free money to farm.
grant select, insert, update, delete on public.coupons to service_role;
grant select, insert, delete on public.coupon_redemptions to service_role;

-- Lottery round bookkeeping the engine reads/writes.
alter table public.lottery_rounds add column if not exists pool bigint not null default 0;
alter table public.lottery_rounds add column if not exists closed boolean not null default false;
alter table public.lottery_rounds add column if not exists updated_at timestamptz not null default now();

-- Tickets carry a public-facing id so a user can reference one in support.
alter table public.lottery_tickets add column if not exists ticket_id text;
create index if not exists lottery_tickets_ticket_id_idx on public.lottery_tickets(ticket_id);