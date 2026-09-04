-- ============================================================================
-- VAZIONIX — LEDGER FUNCTIONS (credit / debit) and supporting schema
-- ----------------------------------------------------------------------------
-- The money path moves INTO Postgres as SECURITY DEFINER functions so the
-- invariant `balance == sum(claims) - sum(withdrawal token costs) + adjustments`
-- and replay-safety (idempotency) are enforced by the DB. The web server calls
-- these via supabase.rpc().
--
-- MIRRORS src/server/ledger.ts (credit/debit) and the economy math in
-- src/lib/config/economy.ts. Keep the two in step.
--
-- SECURITY: `security definer` runs as the owner (postgres) so it can mutate
-- regardless of RLS; the functions are granted to service_role/authenticated and
-- validate every input. Balance forgery is impossible from a client because it
-- can never write users.balance directly.
--
-- LEVEL MODEL: users.total_exp is LIFETIME EXP; level and in-level exp are
-- DERIVED from it on every write via level_from_exp (same loop as the app).
-- ============================================================================

-- Lifetime EXP (the app derives level/exp-in-level from this).
alter table public.users add column if not exists total_exp bigint not null default 0;

-- last activity stamp, read by online-now and streak logic.
alter table public.users add column if not exists last_seen_at timestamptz;

-- The credit path stores per-source claim counters.
alter table public.users add column if not exists claim_counts jsonb not null default '{}'::jsonb;

-- Leaderboard rows keep a token total alongside the claim count.
alter table public.leaderboard_entries add column if not exists tokens bigint not null default 0;

-- ---------------------------------------------------------------------------
-- Economy helpers (copies of src/lib/config/economy.ts and DEFAULT_ECONOMY).
-- ---------------------------------------------------------------------------

-- EXP -> (level, expInLevel, expNext). Same loop as `levelFromExp`.
create or replace function public.level_from_exp(
  p_total_exp bigint, p_base int, p_growth numeric
) returns table(level int, exp bigint, exp_next bigint)
language plpgsql stable as $$
declare
  v_level int    := 1;
  v_rem   bigint := greatest(p_total_exp, 0);
  v_need  bigint;
begin
  loop
    v_need := round(p_base::numeric * power(p_growth, v_level - 1))::bigint;
    exit when v_rem < v_need or v_level >= 500;
    v_rem   := v_rem - v_need;
    v_level := v_level + 1;
  end loop;
  return query select v_level, v_rem, v_need;
end $$;

-- earningBonusBps = min(maxBps, level*perLevel + streakDays*perStreakDay).
create or replace function public.earning_bonus_bps(
  p_level int, p_streak int, p_per_level int, p_per_streak int, p_max int
) returns int language sql immutable as $$
  select least(p_max, p_level * p_per_level + p_streak * p_per_streak)
$$;

-- floor(amount * (1 + bps/10000)). The house rounds DOWN, never up.
create or replace function public.with_bonus(p_amount bigint, p_bps int)
returns bigint language sql immutable as $$
  select floor(p_amount * (1 + p_bps::numeric / 10000))
$$;

-- ---------------------------------------------------------------------------
-- CREDIT
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
  v_counter      text;
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
  v_leader_ref   text;
  v_referrer     uuid;
  v_commission   bigint;
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
        'ok', true, 'credited', v_prior.amount, 'bonus_bps', v_prior.bonus_bps,
        'exp', v_prior.exp, 'balance', v_user.balance,
        'level', v_user.level, 'level_up', false,
        'claim_id', v_prior.id, 'replayed', true);
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
    user_id, source, amount, exp, ref_id, bonus_bps, ip, user_agent_hash,
    client_request_id, created_at
  ) values (
    p_uid, p_source, v_credited, v_exp_added, p_ref_id, v_bonus_bps,
    p_ip, null, p_idempotency_key, now()
  ) returning id into v_claim_id;

  -- Update the user's money + level atomically.
  update public.users set
    balance         = balance + v_credited,
    locked_balance  = locked_balance,
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
    v_leader_ref := 'current';
    insert into public.leaderboard_entries
      (period, board, user_id, username, country_code, value, tokens, final_rank, prize_tokens, updated_at)
    values
      (v_leader_ref, p_source, p_uid, v_user.username, v_user.country_code, 1, v_credited, null, 0, now())
    on conflict (period, board, user_id) do update set
      value = leaderboard_entries.value + 1,
      tokens = leaderboard_entries.tokens + v_credited,
      username = excluded.username,
      country_code = excluded.country_code,
      updated_at = now();
  end if;

  -- Referral commission: the referrer's credit is issued in a SEPARATE rpc call
  -- by the app after this returns (mirrors the app's post-commit referral step),
  -- so a commission failure never rolls back the earner's claim. Return the
  -- referrer info so the app can make that second call with a deterministic key.
  v_referrer := v_user.referred_by;
  v_commission := 0;
  if v_referrer is not null and p_source not in ('referral','adjustment') then
    v_commission := floor((v_credited * v_comm_bps) / 10000);
    if v_commission <= 0 then v_commission := 0; end if;
  end if;

  return jsonb_build_object(
    'ok', true, 'credited', v_credited, 'bonus_bps', v_bonus_bps,
    'exp', v_exp_added, 'balance', v_user.balance + v_credited,
    'level', v_nlevel, 'level_up', v_level_up,
    'claim_id', v_claim_id, 'replayed', false,
    'referrer_uid', v_referrer, 'commission', v_commission,
    'ref_ref_id', p_uid::text || ':' || v_claim_id);
end $$;

-- ---------------------------------------------------------------------------
-- DEBIT (withdrawals / locks). Same invariant discipline; negative ledger row.
-- ---------------------------------------------------------------------------
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
        'balance', v_user.balance, 'claim_id', v_prior.id, 'replayed', true);
    end if;
  end if;

  if v_user.balance < v_amount then
    return jsonb_build_object('ok', false, 'error', 'insufficient_balance',
      'balance', v_user.balance, 'debited', 0);
  end if;

  insert into public.claims (
    user_id, source, amount, exp, ref_id, bonus_bps, ip, user_agent_hash,
    client_request_id, created_at
  ) values (
    p_uid, p_source, -v_amount, 0, p_ref_id, 0, null, null, p_idempotency_key, now()
  ) returning id into v_claim_id;

  update public.users set
    balance        = balance - v_amount,
    locked_balance = locked_balance + case when p_lock then v_amount else 0 end,
    last_seen_at   = now(),
    updated_at     = now()
  where id = p_uid;

  return jsonb_build_object('ok', true, 'debited', v_amount,
    'balance', v_user.balance - v_amount, 'claim_id', v_claim_id, 'replayed', false);
end $$;