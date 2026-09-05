-- ============================================================================
-- VAZIONIX — CATALOGUE COLUMNS the earn engines read
-- ----------------------------------------------------------------------------
-- 0001 created ptc_ads / shortlinks / challenges / offerwall_providers from the
-- READ MODEL shape. The engines also read operational columns (per-item cooldown,
-- delivered views, daily cap, challenge target/repeat), which those tables did
-- not carry. Without them PTC/shortlink cooldowns silently fall back to defaults
-- and challenge progress cannot be evaluated.
-- ============================================================================

-- PTC campaigns.
alter table public.ptc_ads add column if not exists cooldown_hours numeric not null default 24;
alter table public.ptc_ads add column if not exists views_delivered bigint not null default 0;
alter table public.ptc_ads add column if not exists views_purchased bigint not null default 0;
alter table public.ptc_ads add column if not exists last_viewed_at timestamptz;
alter table public.ptc_ads add column if not exists daily_cap int;

-- Shortlinks: `cap` is per-day completions; cooldown spaces them out.
alter table public.shortlinks add column if not exists cooldown_hours numeric;

-- Challenges: progress target and whether it repeats weekly.
alter table public.challenges add column if not exists target int not null default 1;
alter table public.challenges add column if not exists repeat text not null default 'once';

-- Offerwall providers: the iframe URL template and ordering weight.
alter table public.offerwall_providers add column if not exists url_template text;
alter table public.offerwall_providers add column if not exists sort int not null default 0;