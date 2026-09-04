-- ============================================================================
-- VAZIONIX — MAKE public.users.id THE AUTH UUID
-- ----------------------------------------------------------------------------
-- THE BUG THIS FIXES ("nothing works after sign-up")
-- `handle_new_user` inserted the profile with `auth_id = new.id` but let the
-- primary key `id` default to a FRESH gen_random_uuid(). So:
--     public.users.id  <>  auth.users.id
-- Every server lookup keys off the session's uid, which IS the auth uuid:
--   • getProfile -> supabaseGetUser -> where id = uid      -> no row
--   • credit()/debit()/refund()      -> where id = p_uid   -> 'not_found'
--   • claims.user_id / withdrawals.user_id FKs             -> wrong subject
-- Result: sign-up and login both succeed, then (app)/layout.tsx finds no
-- profile and redirects to /login?repair=1 on every authenticated route, and no
-- claim could ever credit. The account existed but was unreachable.
--
-- FIX: the profile's primary key IS the auth uuid, for auth-created users. One
-- identifier end to end — session uid == users.id == auth.users.id.
-- ============================================================================

/* ---- 1. Backfill existing rows -------------------------------------------
   Repoint id to auth_id where they diverge. Dependent rows are repointed first
   so no foreign key is ever left dangling. Rows whose auth_id is null (pure
   orphans) are left alone; the hardened trigger adopts them on next sign-in. */
do $$
declare
  r record;
begin
  for r in
    select id, auth_id from public.users
     where auth_id is not null and id <> auth_id
  loop
    -- Move children onto the incoming key first.
    update public.claims              set user_id = r.auth_id where user_id = r.id;
    update public.withdrawals         set user_id = r.auth_id where user_id = r.id;
    update public.referrals           set referrer_id = r.auth_id where referrer_id = r.id;
    update public.referrals           set referred_user_id = r.auth_id where referred_user_id = r.id;
    update public.leaderboard_entries set user_id = r.auth_id where user_id = r.id;
    update public.notifications       set user_id = r.auth_id where user_id = r.id;
    update public.user_cooldowns      set user_id = r.auth_id where user_id = r.id;
    update public.saved_addresses     set user_id = r.auth_id where user_id = r.id;
    update public.lottery_tickets     set user_id = r.auth_id where user_id = r.id;
    update public.tickets             set user_id = r.auth_id where user_id = r.id;
    update public.chats               set user_id = r.auth_id where user_id = r.id;
    update public.offerwall_conversions set user_id = r.auth_id where user_id = r.id;
    update public.campaigns           set owner_uid = r.auth_id where owner_uid = r.id;
    update public.usernames           set user_id = r.auth_id where user_id = r.id;

    update public.users set id = r.auth_id where id = r.id;
  end loop;
end $$;

/* ---- 2. New signups get id = auth uuid ---------------------------------- */
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

  /* Adopt an orphaned profile for this email, and repoint its key to the new
     auth uuid so the adopted account is reachable by the session. */
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

  -- id = auth uuid: ONE identifier for session, profile and every FK.
  insert into public.users (
    id, auth_id, username, username_lower, email, referral_code, last_seen_at
  ) values (
    new.id, new.id, uname, lower(uname), coalesce(new.email, ''), coalesce(ref_code, ''), now()
  )
  on conflict (id) do nothing;

  return new;

exception when others then
  raise warning '[handle_new_user] profile creation failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();