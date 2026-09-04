-- ============================================================================
-- VAZIONIX — DML GRANTS FOR THE SERVER (service_role)
-- ----------------------------------------------------------------------------
-- THE BUG THIS FIXES: faucet claim returned HTTP 500.
-- The credit itself succeeded (public.credit is SECURITY DEFINER, so it writes
-- as the function owner), but the faucet then writes the cooldown row DIRECTLY
-- through the service-role client — and service_role held only SELECT on these
-- tables, so the upsert failed with `permission denied` and the route 500'd.
--
-- WHY THE GRANTS WERE MISSING: the project was created with "Automatically
-- expose new tables" disabled, which is the right call for the Data API, but it
-- also means new tables get no default privileges. RLS still protects the
-- anon/authenticated roles; service_role bypasses RLS but STILL needs table
-- privileges, which is the distinction that bit here.
--
-- Everything below is a table the SERVER writes directly (not through an rpc).
-- ============================================================================

grant usage on schema public to service_role;

-- Faucet / PTC / shortlink cooldown windows (upserted on every claim).
grant select, insert, update, delete on public.user_cooldowns to service_role;

-- Profile writes: streak on daily bonus, last_seen_at, settings, username.
grant select, insert, update on public.users to service_role;

-- Ledger + score rows (written by rpc, but read/repaired by the server too).
grant select, insert, update on public.claims to service_role;
grant select, insert, update on public.leaderboard_entries to service_role;

-- Notifications (pushNotification / markNotificationsRead).
grant select, insert, update, delete on public.notifications to service_role;

-- Withdrawals + saved addresses (submit, approve, refund bookkeeping).
grant select, insert, update on public.withdrawals to service_role;
grant select, insert, update, delete on public.saved_addresses to service_role;

-- Referral tree, lottery, offerwall conversions, task sessions, captcha tokens.
grant select, insert, update on public.referrals to service_role;
grant select, insert, update on public.lottery_tickets to service_role;
grant select, insert, update on public.lottery_rounds to service_role;
grant select, insert, update on public.offerwall_conversions to service_role;
grant select, insert, update, delete on public.task_sessions to service_role;
grant select, insert, update, delete on public.captcha_tokens to service_role;

-- Support: tickets, messages, chats.
grant select, insert, update on public.tickets to service_role;
grant select, insert, update on public.ticket_messages to service_role;
grant select, insert, update on public.chats to service_role;
grant select, insert, update on public.chat_messages to service_role;

-- Admin-managed config, inventory and audit.
grant select, insert, update on public.config to service_role;
grant select, insert, update, delete on public.ad_units to service_role;
grant select, insert, update on public.stats to service_role;
grant select, insert on public.audit_log to service_role;
grant select, insert, update, delete on public.usernames to service_role;
grant select, insert, update on public.campaigns to service_role;
grant select, insert, update on public.ptc_ads to service_role;
grant select, insert, update on public.shortlinks to service_role;
grant select, insert, update on public.challenges to service_role;
grant select, insert, update on public.offerwall_providers to service_role;

-- Identity sequences behind the bigint primary keys.
grant usage, select on all sequences in schema public to service_role;

-- Future tables created in this schema get the same server privileges, so a new
-- table never silently 500s a route again.
alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to service_role;