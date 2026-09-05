-- ============================================================================
-- VAZIONIX — ADSLAB TRANSACTION AUDIT TRAIL
-- ----------------------------------------------------------------------------
-- WHY A SEPARATE TABLE WHEN public.claims ALREADY EXISTS
-- `claims` is the MONEY ledger: integer tokens, and the invariant
-- balance == sum(claims) depends on it holding nothing else. AdsLab postbacks
-- carry provider-side facts that are not money — raw query string, campaign
-- name, task type, provider IP/country, chargeback status — which are needed to
-- settle a dispute months later but must not pollute the ledger.
--
-- So: this table is the AUDIT record (one row per provider txid), and the money
-- still moves through public.credit()/debit() exactly like every other earning
-- path. The two are written in the same request, and the UNIQUE txid here is the
-- duplicate-postback guard: providers retry constantly and a second delivery
-- must return 200 without crediting again.
--
-- `reward_usd` is what AdsLab said it paid. `tokens` is what we actually
-- credited after converting at config/rates.usdPerToken — recorded separately so
-- a later rate change cannot make an old payout look wrong.
-- ============================================================================

create table if not exists public.adslab_transactions (
  id            bigint generated always as identity primary key,
  -- IDEMPOTENCY KEY from AdsLab. A duplicate postback loses this insert.
  txid          text not null unique,
  user_id       uuid references public.users(id) on delete set null,
  -- Kept as text too: an unknown uid must still be recorded, not dropped.
  raw_uid       text,
  placement_id  text,
  source        text not null check (source in ('interstitial','rewarded','task','captcha')),
  task_type     text,
  reward_usd    numeric(18,8) not null default 0,
  tokens        bigint not null default 0,
  status        text not null,
  campaign_name text,
  ip            text,
  country       text,
  raw_query     text,
  -- Which key verified the signature, so the docs' ambiguity (spec section 8.1)
  -- can be resolved from real traffic and then locked down.
  signed_with   text,
  created_at    timestamptz not null default now()
);

create index if not exists adslab_tx_user_idx on public.adslab_transactions(user_id);
create index if not exists adslab_tx_created_idx on public.adslab_transactions(created_at desc);
create index if not exists adslab_tx_source_idx on public.adslab_transactions(source, status);

alter table public.adslab_transactions enable row level security;
-- Server-only: this table holds raw provider payloads and other users' payouts.
grant select, insert, update on public.adslab_transactions to service_role;