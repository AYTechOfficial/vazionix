-- ============================================================================
-- VAZIONIX — 0019: INTEGRITY FIX PASS
-- ----------------------------------------------------------------------------
-- Fixes applied by the Supabase consolidation (Firebase removal):
--
--   1. SECURITY: revoke EXECUTE on the money RPCs from PUBLIC. Postgres grants
--      EXECUTE on new functions to PUBLIC by default, and PostgREST exposes
--      them through the public anon key — anyone could POST /rest/v1/rpc/credit
--      and mint balance. Restricted to service_role, which only the server
--      holds.
--
--   2. claims.label — the refund() function inserts a `label` column that never
--      existed, so every withdrawal failure/rejection refund raised
--      'column "label" of relation "claims" does not exist' and the tokens
--      stayed locked forever. Label is now persisted by credit/debit too, so
--      the user's transaction history shows what each row was for.
--
--   3. withdrawals.ip / usd_value — requestWithdrawal wrote an `email` column
--      that does not exist (insert failed -> every withdrawal attempt errored
--      and tripped the broken refund path). Replaced by the columns the console
--      and fraud screens actually read: ip and usd_value.
--
--   4. users.suspended_until / suspended_by / suspended_at — admin suspend/
--      unsuspend wrote all three; none existed, so the update failed silently
--      and suspending a user did nothing.
--
--   5. handle_new_user referral bug: the trigger copied the REFERRER'S code into
--      the new user's own referral_code (so every user shared a code or none),
--      never set referred_by, never created the referral edge, never paid the
--      signup bonus, never generated the new user's own unique code, and never
--      backfilled country/initials. Rewritten to do all of it.
--
--   6. Backfill referral codes for existing users (every account had '').
--
--   7. RLS on lottery_rounds / usernames / audit_log / captcha_tokens.
--
--   8. Grants for the now-used-by-app tables (audit_log was granted but never
--      written by the app; now it is).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. SECURITY: money RPCs are service_role only
-- ---------------------------------------------------------------------------
revoke execute on function public.credit(uuid, text, bigint, bigint, text, text, text, boolean, boolean, text, jsonb) from public;
revoke execute on function public.debit(uuid, bigint, text, text, text, text, boolean) from public;
revoke execute on function public.refund(uuid, bigint, text, text) from public;
grant execute on function public.credit(uuid, text, bigint, bigint, text, text, text, boolean, boolean, text, jsonb) to service_role;
grant execute on function public.debit(uuid, bigint, text, text, text, text, boolean) to service_role;

-- Also lock down the helper math functions: they are internal to the money path.
revoke execute on function public.level_from_exp(bigint, int, numeric) from public;
revoke execute on function public.earning_bonus_bps(int, int, int, int, int) from public;
revoke execute on function public.with_bonus(bigint, int) from public;

-- ---------------------------------------------------------------------------
-- 2. claims.label — the ledger's human-readable row title
-- ---------------------------------------------------------------------------
alter table public.claims add column if not exists label text not null default '';

-- ---------------------------------------------------------------------------
-- 3. withdrawals: real columns instead of the phantom `email`
-- ---------------------------------------------------------------------------
alter table public.withdrawals add column if not exists ip text;
alter table public.withdrawals add column if not exists usd_value numeric not null default 0;

-- ---------------------------------------------------------------------------
-- 4. users: suspension bookkeeping the admin console writes
-- ---------------------------------------------------------------------------
alter table public.users add column if not exists suspended_until timestamptz;
alter table public.users add column if not exists suspended_by uuid;
alter table public.users add column if not exists suspended_at timestamptz;
alter table public.users add column if not exists signup_ip text;

-- ---------------------------------------------------------------------------
-- 5. credit/debit/refund: persist the label + return camelCase keys
--    The app contract (src/server/supabase.ts) reads bonusBps/levelUp/claimId/
--    referrerUid/refRefId; the functions returned snake_case, so referral
--    commissions and level-up notifications never fired. Both shapes are now
--    returned; keep the app contract on camelCase.
-- ---------------------------------------------------------------------------
create or replace function public.credit(
  p_uid             uuid,
  p_source          text,
  p_amount          bigint,
  p_exp             bigint     default 0,
  p_ref_id          text       default null,
  p_label           text       default '',
  p_idempotency_key text       default null,
  p_apply_bonus     boolean    default true,
  p_score           boolean    default true,
  p_ip              text       default null,
  p_meta            jsonb      default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user         public.users%rowtype;
  v_prior        public.claims%rowtype;
  v_base         bigint := greatest(floor(p_amount), 0);

  -- Economy defaults (overlaid by /config/economy below).
  v_base_lvl     int     := 100;
  v_growth       numeric := 1.18;
  v_per_level    int     := 20;
  v_per_streak   int     := 10;
  v_max_bps      int     := 1500;
  v_comm_bps     int     := 500;

  v_econ         jsonb;
  v_prior_total  bigint;
  v_prior_level  int;
  v_next_total   bigint;
  v_nlevel       int;
  v_level_exp    bigint;
  v_exp_next     bigint;
  v_level_up     boolean;
  v_bonus_bps    int;
  v_credited     bigint;
  v_exp_added    bigint := greatest(p_exp, 0);
  v_claim_id     bigint;
  v_referrer     uuid;
  v_commission   bigint;
  v_ref_comm_bps int;
begin
  if v_base = 0 then
    return jsonb_build_object('ok', false, 'error', 'zero_amount', 'credited', 0);
  end if;

  -- Economy from /config/economy (merged over defaults; malformed -> defaults).
  select value into v_econ from public.config where key = 'economy';
  if v_econ is not null then
    begin
      v_base_lvl    := coalesce((v_econ->'levels'->>'base')::int, v_base_lvl);
      v_growth      := coalesce((v_econ->'levels'->>'growth')::numeric, v_growth);
      v_per_level   := coalesce((v_econ->'levels'->>'bonusBpsPerLevel')::int, v_per_level);
      v_per_streak  := coalesce((v_econ->'levels'->>'bonusBpsPerStreakDay')::int, v_per_streak);
      v_max_bps     := coalesce((v_econ->'levels'->>'maxBonusBps')::int, v_max_bps);
      v_comm_bps    := coalesce((v_econ->'referrals'->>'commissionBps')::int, v_comm_bps);
    exception when others then null; end;
  end if;

  -- Lock the user row for the whole credit.
  select * into v_user from public.users where id = p_uid for update;
  if not found or v_user.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'credited', 0);
  end if;
  if v_user.suspended then
    return jsonb_build_object('ok', false, 'error', 'suspended',
      'message', coalesce(v_user.suspended_reason, 'This account is suspended.'), 'credited', 0);
  end if;

  -- Replay? A prior claim carrying this idempotency key (per user) is a replay.
  if p_idempotency_key is not null then
    select * into v_prior from public.claims
      where user_id = p_uid and client_request_id = p_idempotency_key;
    if found and v_prior.id is not null then
      -- Report the original credit, change nothing.
      return jsonb_build_object(
        'ok', true, 'credited', v_prior.amount, 'bonus_bps', v_prior.bonus_bps, 'bonusBps', v_prior.bonus_bps,
        'exp', v_prior.exp, 'balance', v_user.balance,
        'level', v_user.level, 'level_up', false, 'levelUp', false,
        'claim_id', v_prior.id, 'claimId', v_prior.id, 'replayed', true);
    end if;
  end if;

  v_prior_total := coalesce(v_user.total_exp, 0);
  v_prior_level := v_user.level;

  -- Bonus basis points: use the stored value, else recompute from economy.
  if p_apply_bonus = false then
    v_bonus_bps := 0;
  else
    v_bonus_bps := v_user.earning_bonus_bps;
    if v_bonus_bps is null or v_bonus_bps = 0 then
      v_bonus_bps := public.earning_bonus_bps(
        v_prior_level, v_user.streak_days, v_per_level, v_per_streak, v_max_bps);
    end if;
  end if;

  v_credited := public.with_bonus(v_base, v_bonus_bps);

  -- Level progress: add exp to lifetime, re-derive level + in-level exp.
  v_next_total := v_prior_total + v_exp_added;
  select lvl.level, lvl.exp, lvl.exp_next into v_nlevel, v_level_exp, v_exp_next
  from public.level_from_exp(v_next_total, v_base_lvl, v_growth) lvl;
  v_level_up := v_nlevel > v_prior_level;

  -- Insert the ledger row. A unique (user_id, client_request_id) collision here
  -- is a race on the same key; let it fail loudly.
  insert into public.claims (
    user_id, source, amount, exp, ref_id, label, bonus_bps, ip, user_agent_hash,
    client_request_id, created_at
  ) values (
    p_uid, p_source, v_credited, v_exp_added, p_ref_id, p_label, v_bonus_bps,
    p_ip, null, p_idempotency_key, now()
  ) returning id into v_claim_id;

  -- Update the user's money + level atomically.
  update public.users set
    balance         = balance + v_credited,
    total_earned    = total_earned + v_credited,
    total_exp       = v_next_total,
    exp             = v_level_exp,
    level           = v_nlevel,
    earning_bonus_bps = case when v_level_up then
        public.earning_bonus_bps(v_nlevel, streak_days, v_per_level, v_per_streak, v_max_bps)
      else earning_bonus_bps end,
    last_seen_at    = now(),
    updated_at      = now()
  where id = p_uid;

  -- Per-source claim counter.
  if p_source in ('faucet','ptc','shortlink','offerwall','bonus','challenge') then
    update public.users set claim_counts = jsonb_set(
      coalesce(claim_counts, '{}'::jsonb),
      array[p_source],
      to_jsonb(coalesce(((coalesce(claim_counts,'{}'::jsonb)->>p_source)::bigint), 0) + 1)
    ) where id = p_uid;
  end if;

  -- Leaderboard score (count per board; token total too).
  if p_score and p_source in ('faucet','ptc','shortlink','offerwall','referral') then
    insert into public.leaderboard_entries
      (period, board, user_id, username, country_code, value, tokens, final_rank, prize_tokens, updated_at)
    values
      ('current', p_source, p_uid, v_user.username, v_user.country_code, 1, v_credited, null, 0, now())
    on conflict (period, board, user_id) do update set
      value = leaderboard_entries.value + 1,
      tokens = leaderboard_entries.tokens + v_credited,
      username = excluded.username,
      country_code = excluded.country_code,
      updated_at = now();
  end if;

  -- Referral commission: the referrer's credit is issued in a SEPARATE rpc call
  -- by the app after this returns, so a commission failure never rolls back the
  -- earner's claim. Return the referrer info for that second call. The bps come
  -- from the REFERRER's own tier, not the earner's.
  v_referrer := v_user.referred_by;
  v_commission := 0;
  if v_referrer is not null and p_source not in ('referral','adjustment') then
    select coalesce(commission_bps, v_comm_bps) into v_ref_comm_bps
      from public.users where id = v_referrer;
    v_commission := floor((v_credited * coalesce(v_ref_comm_bps, v_comm_bps)) / 10000);
    if v_commission < 0 then v_commission := 0; end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'credited', v_credited,
    'bonus_bps', v_bonus_bps, 'bonusBps', v_bonus_bps,
    'exp', v_exp_added,
    'balance', v_user.balance + v_credited,
    'level', v_nlevel,
    'level_up', v_level_up, 'levelUp', v_level_up,
    'claim_id', v_claim_id, 'claimId', v_claim_id,
    'replayed', false,
    'referrer_uid', v_referrer, 'referrerUid', v_referrer,
    'commission', v_commission,
    'ref_ref_id', p_uid::text || ':' || v_claim_id, 'refRefId', p_uid::text || ':' || v_claim_id);
end $$;

create or replace function public.debit(
  p_uid             uuid,
  p_amount          bigint,
  p_source          text default 'withdrawal',
  p_ref_id          text default null,
  p_label           text default '',
  p_idempotency_key text default null,
  p_lock            boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user     public.users%rowtype;
  v_prior    public.claims%rowtype;
  v_amount   bigint := greatest(floor(p_amount), 0);
  v_claim_id bigint;
begin
  if v_amount = 0 then
    return jsonb_build_object('ok', false, 'error', 'zero_amount', 'debited', 0);
  end if;

  select * into v_user from public.users where id = p_uid for update;
  if not found or v_user.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found', 'debited', 0);
  end if;
  if v_user.suspended then
    return jsonb_build_object('ok', false, 'error', 'suspended',
      'message', coalesce(v_user.suspended_reason, 'This account is suspended.'), 'debited', 0);
  end if;

  -- Replay?
  if p_idempotency_key is not null then
    select * into v_prior from public.claims
      where user_id = p_uid and client_request_id = p_idempotency_key;
    if found and v_prior.id is not null then
      return jsonb_build_object('ok', true, 'debited', abs(v_prior.amount),
        'balance', v_user.balance, 'claim_id', v_prior.id, 'claimId', v_prior.id, 'replayed', true);
    end if;
  end if;

  if v_user.balance < v_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance',
      'balance', v_user.balance, 'debited', 0);
  end if;

  insert into public.claims (
    user_id, source, amount, exp, ref_id, label, bonus_bps, ip, user_agent_hash,
    client_request_id, created_at
  ) values (
    p_uid, p_source, -v_amount, 0, p_ref_id, p_label, 0, null, null, p_idempotency_key, now()
  ) returning id into v_claim_id;

  update public.users set
    balance        = balance - v_amount,
    locked_balance = locked_balance + case when p_lock then v_amount else 0 end,
    last_seen_at   = now(),
    updated_at     = now()
  where id = p_uid;

  return jsonb_build_object('ok', true, 'debited', v_amount,
    'balance', v_user.balance - v_amount, 'claim_id', v_claim_id, 'claimId', v_claim_id, 'replayed', false);
end $$;

create or replace function public.refund(
  p_uid        uuid,
  p_tokens     bigint,
  p_ref_id     text,
  p_reason     text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_claim_id bigint;
  v_balance  bigint;
begin
  update public.users
    set balance        = balance + p_tokens,
        locked_balance = locked_balance - p_tokens,
        updated_at     = now()
  where id = p_uid
  returning balance into v_balance;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  insert into public.claims (user_id, source, amount, exp, ref_id, label, bonus_bps, ip, user_agent_hash, client_request_id, created_at)
  values (p_uid, 'refund', p_tokens, 0, p_ref_id, coalesce(nullif(p_reason,''), 'Withdrawal refunded'), 0, null, null, 'wdref_'||p_ref_id, now())
  returning id into v_claim_id;

  return jsonb_build_object('ok', true, 'balance', v_balance, 'claimId', v_claim_id, 'claim_id', v_claim_id);
end $$;

grant execute on function public.refund(uuid, bigint, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5b. stats bump function — the app's bumpStat() now maps onto this
-- ---------------------------------------------------------------------------
create or replace function public.bump_stats(
  p_members          bigint default 0,
  p_members_today    bigint default 0,
  p_claims           bigint default 0,
  p_tokens_credited  bigint default 0,
  p_withdrawals      bigint default 0,
  p_tokens_withdrawn bigint default 0,
  p_usd_withdrawn    numeric default 0,
  p_ptc_views        bigint default 0,
  p_shortlink_claims bigint default 0,
  p_offerwall_conversions bigint default 0,
  p_ad_impressions   bigint default 0
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_members = 0 and p_members_today = 0 and p_claims = 0 and p_tokens_credited = 0
     and p_withdrawals = 0 and p_tokens_withdrawn = 0 and p_usd_withdrawn = 0
     and p_ptc_views = 0 and p_shortlink_claims = 0 and p_offerwall_conversions = 0
     and p_ad_impressions = 0 then
    return;
  end if;

  insert into public.stats as s (day, members, members_today, claims, tokens_credited,
    withdrawals, tokens_withdrawn, usd_withdrawn, ptc_views, shortlink_claims,
    offerwall_conversions, ad_impressions, updated_at)
  values ('global', p_members, 0, p_claims, p_tokens_credited, p_withdrawals,
    p_tokens_withdrawn, p_usd_withdrawn, p_ptc_views, p_shortlink_claims,
    p_offerwall_conversions, p_ad_impressions, now())
  on conflict (day) do update set
    members        = s.members        + excluded.members,
    members_today  = s.members_today  + excluded.members_today,
    claims         = s.claims         + excluded.claims,
    tokens_credited = s.tokens_credited + excluded.tokens_credited,
    withdrawals    = s.withdrawals    + excluded.withdrawals,
    tokens_withdrawn = s.tokens_withdrawn + excluded.tokens_withdrawn,
    usd_withdrawn  = s.usd_withdrawn  + excluded.usd_withdrawn,
    ptc_views      = s.ptc_views      + excluded.ptc_views,
    shortlink_claims = s.shortlink_claims + excluded.shortlink_claims,
    offerwall_conversions = s.offerwall_conversions + excluded.offerwall_conversions,
    ad_impressions = s.ad_impressions + excluded.ad_impressions,
    updated_at     = now();

  insert into public.stats as s (day, members, members_today, claims, tokens_credited,
    withdrawals, tokens_withdrawn, usd_withdrawn, ptc_views, shortlink_claims,
    offerwall_conversions, ad_impressions, updated_at)
  values (to_char(now() at time zone 'utc', 'YYYY-MM-DD'), p_members, p_members_today,
    p_claims, p_tokens_credited, p_withdrawals, p_tokens_withdrawn, p_usd_withdrawn,
    p_ptc_views, p_shortlink_claims, p_offerwall_conversions, p_ad_impressions, now())
  on conflict (day) do update set
    members        = s.members        + excluded.members,
    members_today  = s.members_today  + excluded.members_today,
    claims         = s.claims         + excluded.claims,
    tokens_credited = s.tokens_credited + excluded.tokens_credited,
    withdrawals    = s.withdrawals    + excluded.withdrawals,
    tokens_withdrawn = s.tokens_withdrawn + excluded.tokens_withdrawn,
    usd_withdrawn  = s.usd_withdrawn  + excluded.usd_withdrawn,
    ptc_views      = s.ptc_views      + excluded.ptc_views,
    shortlink_claims = s.shortlink_claims + excluded.shortlink_claims,
    offerwall_conversions = s.offerwall_conversions + excluded.offerwall_conversions,
    ad_impressions = s.ad_impressions + excluded.ad_impressions,
    updated_at     = now();
end $$;

revoke execute on function public.bump_stats(
  bigint, bigint, bigint, bigint, bigint, bigint, numeric, bigint, bigint, bigint, bigint
) from public;
grant execute on function public.bump_stats(
  bigint, bigint, bigint, bigint, bigint, bigint, numeric, bigint, bigint, bigint, bigint
) to service_role;

-- ---------------------------------------------------------------------------
-- 5c. withdrawal status transition — claim-the-row semantics the console uses
--     (approve -> Processing -> send -> Completed), service_role only
-- ---------------------------------------------------------------------------
create or replace function public.set_withdrawal_status(
  p_id          uuid,
  p_status      text,
  p_actor       uuid,
  p_txid        text default null,
  p_failure     text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w public.withdrawals%rowtype;
begin
  select * into w from public.withdrawals where id = p_id for update;
  if not found or w.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if p_status = 'Completed' then
    update public.withdrawals set
      status = 'Completed', txid = coalesce(p_txid, txid), processed_at = now(),
      reviewed_by = coalesce(p_actor, reviewed_by), failure_reason = null, updated_at = now()
    where id = p_id;
    -- The locked tokens are now genuinely gone: they left the platform.
    update public.users set locked_balance = locked_balance - token_cost, updated_at = now()
      where id = w.user_id;
  elsif p_status = 'Rejected' or p_status = 'Reversed' then
    update public.withdrawals set
      status = p_status, failure_reason = coalesce(p_failure, failure_reason),
      processed_at = now(), reviewed_by = coalesce(p_actor, reviewed_by), updated_at = now()
    where id = p_id;
  else
    update public.withdrawals set
      status = p_status, reviewed_by = coalesce(p_actor, reviewed_by),
      failure_reason = p_failure, updated_at = now()
    where id = p_id;
  end if;

  return jsonb_build_object('ok', true, 'status', p_status);
end $$;

revoke execute on function public.set_withdrawal_status(uuid, text, uuid, text, text) from public;
grant execute on function public.set_withdrawal_status(uuid, text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. handle_new_user: fix the referral wiring + seed the fields the app reads
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta        jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname_raw   text  := nullif(meta->>'username', '');
  ref_code    text  := nullif(meta->>'referralCode', '');
  base        text;
  uname       text;
  n           int   := 0;
  orphan_id   uuid;
  referrer_id uuid;
  referrer    public.users%rowtype;
  signup_bonus bigint := 0;
  new_code    text;
  alphabet    text := 'abcdefghijkmnopqrstuvwxyz23456789';
  i           int;
  econ        jsonb;
begin
  base := coalesce(
    uname_raw,
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user' || substr(replace(new.id::text, '-', ''), 1, 8)
  );
  base := regexp_replace(left(base, 20), '[^a-zA-Z0-9_.]', '', 'g');
  if base is null or base = '' then
    base := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  /* Adopt an orphaned profile for this email (pre-0011 accounts, test imports):
     repoint its key to the new auth uuid so it becomes reachable. */
  if coalesce(new.email, '') <> '' then
    select u.id into orphan_id
      from public.users u
     where lower(u.email) = lower(new.email)
       and (u.auth_id is null
            or not exists (select 1 from auth.users a where a.id = u.auth_id))
     limit 1;

    if orphan_id is not null then
      if orphan_id <> new.id then
        update public.claims              set user_id = new.id where user_id = orphan_id;
        update public.withdrawals         set user_id = new.id where user_id = orphan_id;
        update public.leaderboard_entries set user_id = new.id where user_id = orphan_id;
        update public.notifications       set user_id = new.id where user_id = orphan_id;
        update public.user_cooldowns      set user_id = new.id where user_id = orphan_id;
        update public.saved_addresses     set user_id = new.id where user_id = orphan_id;
      end if;
      update public.users
         set id = new.id, auth_id = new.id, last_seen_at = now(), updated_at = now()
       where id = orphan_id;
      return new;
    end if;
  end if;

  uname := base;
  while exists (select 1 from public.users where username_lower = lower(uname)) loop
    n := n + 1;
    uname := left(base, 14) || n::text;
    if n > 9999 then
      uname := 'user' || substr(replace(new.id::text, '-', ''), 1, 10);
      exit;
    end if;
  end loop;

  -- The NEW USER'S OWN unique referral code (the old trigger copied the
  -- referrer's code here, so no user ever had their own).
  new_code := '';
  for i in 1..10 loop
    new_code := new_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;

  -- Resolve the REFERRER from the code (never trust a uid from the client).
  if ref_code is not null and ref_code <> '' then
    select * into referrer from public.users
     where referral_code = ref_code limit 1;
    if found and referrer.id is not null and referrer.id <> new.id then
      referrer_id := referrer.id;
    end if;
  end if;

  -- Signup bonus from the economy config.
  select value into econ from public.config where key = 'economy';
  if econ is not null then
    begin
      signup_bonus := coalesce(greatest((econ->'referrals'->>'signupBonusTokens')::bigint, 0), 0);
    exception when others then signup_bonus := 0; end;
  end if;

  -- id = auth uuid: ONE identifier for session, profile and every FK.
  insert into public.users (
    id, auth_id, username, username_lower, email, country_code, avatar_initials,
    balance, total_earned, referral_code, referred_by, referral_tier, commission_bps,
    claim_counts, roles, suspended, created_at, updated_at, last_seen_at
  ) values (
    new.id, new.id, uname, lower(uname), coalesce(new.email, ''),
    coalesce(nullif(meta->>'countryCode', ''), 'XX'),
    coalesce(nullif(meta->>'initials', ''), upper(substr(uname, 1, 2))),
    signup_bonus, signup_bonus, new_code, referrer_id,
    coalesce(econ->'referrals'->'tiers'->0->>'name', 'Bronze'),
    coalesce((econ->'referrals'->'tiers'->0->>'rate')::int, 5) * 100,
    '{"faucet":0,"ptc":0,"shortlink":0,"offerwall":0,"referrals":0,"bonus":0,"challenge":0}'::jsonb,
    '{}'::jsonb, false, now(), now(), now()
  )
  on conflict (id) do nothing;

  -- Signup bonus ledger row, so the invariant balance == sum(claims) holds.
  if signup_bonus > 0 then
    insert into public.claims (user_id, source, amount, exp, ref_id, label, bonus_bps, ip, user_agent_hash, client_request_id, created_at)
    values (new.id, 'bonus', signup_bonus, 0, 'signup', 'Welcome bonus', 0, null, null, 'signup_' || new.id::text, now());
  end if;

  -- The referral edge: unique by (referrer_id, referred_user_id). Qualified
  -- stays false until the referred user reaches the qualifying level.
  if referrer_id is not null then
    insert into public.referrals
      (referrer_id, referred_user_id, username, country_code, level, total_earned,
       commission_paid, qualified, joined_at, last_active_at, created_at, updated_at)
    values
      (referrer_id, new.id, uname, coalesce(nullif(meta->>'countryCode', ''), 'XX'), 1,
       0, 0, false, now(), now(), now(), now())
    on conflict (referrer_id, referred_user_id) do nothing;
  end if;

  return new;

exception when others then
  raise warning '[handle_new_user] profile creation failed for %: %', new.id, sqlerrm;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 7. RLS on the tables that had none
-- ---------------------------------------------------------------------------
alter table public.lottery_rounds enable row level security;
alter table public.usernames       enable row level security;
alter table public.audit_log       enable row level security;
alter table public.captcha_tokens enable row level security;

-- Backfill referral codes for every user who never got one (the old trigger
-- left them all ''). Collision-safe: loop until unique.
do $$
declare
  r record;
  alphabet text := 'abcdefghijkmnopqrstuvwxyz23456789';
  code text;
  i int;
begin
  for r in select id from public.users where referral_code is null or referral_code = ''
  loop
    loop
      code := '';
      for i in 1..10 loop
        code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
      end loop;
      exit when not exists (select 1 from public.users where referral_code = code);
    end loop;
    update public.users set referral_code = code, updated_at = now() where id = r.id;
  end loop;
end $$;

-- Backfill avatar initials for users whose trigger never set them.
update public.users
   set avatar_initials = upper(substr(username, 1, 2))
 where avatar_initials is null or avatar_initials = '';

-- Backfill commission_bps from the Bronze tier where the trigger never set it.
update public.users
   set commission_bps = 500
 where commission_bps is null or commission_bps = 0;

-- ---------------------------------------------------------------------------
-- 8. service_role grants for app-written tables
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.audit_log to service_role;
grant select, insert, update, delete on public.usernames to service_role;
grant select, insert, update, delete on public.lottery_rounds to service_role;
grant select, insert, update, delete on public.stats to service_role;
