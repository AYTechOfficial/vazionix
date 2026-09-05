-- ============================================================================
-- VAZIONIX — OFFERWALL POSTBACK COLUMNS
-- ----------------------------------------------------------------------------
-- The postback path records how much was actually credited (which can differ
-- from the provider's stated reward once the earning bonus applies) and the
-- reversal audit trail. It also needs the provider's signature mode + secret,
-- which decide whether a postback is trusted enough to credit from at all.
-- ============================================================================

alter table public.offerwall_conversions add column if not exists credited_tokens bigint;
alter table public.offerwall_conversions add column if not exists reversed_at timestamptz;
alter table public.offerwall_conversions add column if not exists reversed_by uuid;
alter table public.offerwall_conversions add column if not exists rejection_reason text;

-- Provider trust configuration. `secret` is server-only: RLS gives no policy to
-- anon/authenticated on this table's secret, and the public read policy from 0001
-- exposes the catalogue columns the grid needs — so keep secrets out of any
-- client-selected column list.
alter table public.offerwall_providers add column if not exists secret text;
alter table public.offerwall_providers add column if not exists signature_mode text not null default 'hmac_sha256_payload';

-- The 0001 public-read policy on offerwall_providers would expose `secret` to a
-- client that selects it. Replace it with a policy-free table: the grid is
-- rendered SERVER-side (listOfferProviders runs on the server), so no client
-- read is required at all.
drop policy if exists "offerwall_providers public read" on public.offerwall_providers;