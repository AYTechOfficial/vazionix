-- ============================================================================
-- VAZIONIX — withdrawals ticker columns + read grants
-- ----------------------------------------------------------------------------
-- The payout ticker (landing + auth) reads completed withdrawals and shows
-- username / country_code, which the base table didn't carry. Also grant the
-- service_role SELECT on the tables the server read paths now touch
-- (withdrawals, claims, notifications, leaderboard, lottery).
-- ============================================================================

alter table public.withdrawals add column if not exists username text default null;
alter table public.withdrawals add column if not exists country_code text default null;

grant select on public.withdrawals to service_role;
grant select on public.claims to service_role;
grant select on public.notifications to service_role;
grant select on public.leaderboard_entries to service_role;
grant select on public.lottery_tickets to service_role;
grant select on public.lottery_rounds to service_role;
grant select on public.referrals to service_role;
grant select on public.tickets to service_role;
grant select on public.audit_log to service_role;
grant select on public.user_cooldowns to service_role;
grant select on public.offerwall_conversions to service_role;
grant select on public.campaigns to service_role;
grant select on public.chats to service_role;
grant select on public.chat_messages to service_role;
grant select on public.ticket_messages to service_role;
grant select on public.usernames to service_role;

-- Identity sequences for server INSERTs (notifications, etc.).
grant usage, select on all sequences in schema public to service_role;