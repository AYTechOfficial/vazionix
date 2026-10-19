-- ============================================================================
-- 0021 — LIVE LIABILITY
-- -----------------------------------------------------------------------------
-- The admin "Outstanding liability" figure previously came from
--   stats.global.tokens_credited - stats.global.tokens_withdrawn,
-- which drifts the moment a balance is adjusted, a test account is removed or
-- anything touches balances outside the normal signup/claim/withdraw path.
-- The liability IS the sum of member balances; compute it from the rows.
-- ============================================================================

create or replace function public.sum_user_balances()
returns bigint
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(sum(balance), 0)::bigint from public.users;
$$;

revoke execute on function public.sum_user_balances() from public, anon, authenticated;
grant execute on function public.sum_user_balances() to service_role;
