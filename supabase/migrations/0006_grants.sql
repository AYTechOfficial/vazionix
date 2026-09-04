-- ============================================================================
-- VAZIONIX — GRANTS for the service_role client reads
-- ----------------------------------------------------------------------------
-- The service-role key bypasses RLS, but it still needs Postgres table grants.
-- The landing/faucet read config, ad units, stats and the earn catalogue through
-- the service-role client on the server; without SELECT grants those reads throw
-- `permission denied`. These grants make the server reads work.
-- (Writes via rpc() are SECURITY DEFINER functions owned by postgres, so they
-- need no table grant.)
-- ============================================================================

grant usage on schema public to service_role;

grant select on public.config to service_role;
grant select on public.ad_units to service_role;
grant select on public.stats to service_role;
grant select on public.ptc_ads to service_role;
grant select on public.shortlinks to service_role;
grant select on public.challenges to service_role;
grant select on public.offerwall_providers to service_role;

-- User/profile + cooldown + claims reads (server, via service_role).
grant select on public.users to service_role;
grant select on public.user_cooldowns to service_role;
grant select on public.claims to service_role;
grant select on public.withdrawals to service_role;
grant select on public.leaderboard_entries to service_role;
grant select on public.notifications to service_role;

-- Sequences used by identity columns (server reads/inserts of the numbers).
grant usage, select on all sequences in schema public to service_role;