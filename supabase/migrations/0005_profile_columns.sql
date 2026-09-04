-- ============================================================================
-- VAZIONIX — profile columns the read model needs (Phase B)
-- ----------------------------------------------------------------------------
-- Adds the columns src/server/users.ts#profileFrom reads that 0001 didn't carry,
-- and folds defaults into the auth-profile-bootstrap trigger.
-- ============================================================================

alter table public.users add column if not exists deposit_balance numeric not null default 0;
alter table public.users add column if not exists referral_qualified int not null default 0;
alter table public.users add column if not exists last_seen_at timestamptz;

-- Fold the new defaults + referral metadata into the auth bootstrap trigger so a
-- fresh signup row is complete for the profile read.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta         jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  uname_raw    text  := nullif(meta->>'username', '');
  uname        text;
  ref_code     text  := nullif(meta->>'referralCode', '');
begin
  uname := coalesce(
    uname_raw,
    split_part(coalesce(new.email, 'user'), '@', 1),
    'user' || substr(new.id::text, 1, 6)
  );
  uname := regexp_replace(left(uname, 20), '[^a-zA-Z0-9_.]', '', 'g');
  if uname = '' then uname := 'user' || substr(new.id::text, 1, 6); end if;

  insert into public.users (
    auth_id, username, username_lower, email,
    balance, locked_balance, deposit_balance, level, exp, total_exp, total_earned,
    streak_days, earning_bonus_bps, referral_code, referred_by, referral_tier,
    commission_bps, referral_qualified, claim_counts, roles, suspended, last_seen_at
  ) values (
    new.id, uname, lower(uname), coalesce(new.email, ''),
    0, 0, 0, 1, 0, 0, 0,
    0, 0, coalesce(ref_code, ''), null, 'Bronze',
    0, 0, '{}'::jsonb, '{}'::jsonb, false, now()
  )
  on conflict (auth_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();