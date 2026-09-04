-- ============================================================================
-- VAZIONIX — HARDEN THE AUTH PROFILE TRIGGER
-- ----------------------------------------------------------------------------
-- THE BUG THIS FIXES
-- `handle_new_user` derived a username from the email local part and inserted it
-- with `on conflict (auth_id) do nothing`. That guard only covers an auth_id
-- collision. If the derived username was already taken — which happens when a
-- previous signup left an ORPHANED profile row, or when two providers give the
-- same local part (john@gmail.com / john@outlook.com) — the insert violated the
-- UNIQUE constraint on username_lower, the trigger raised, and the whole
-- auth.users insert rolled back. Supabase surfaces that as:
--     "Database error saving new user"  (error_code=unexpected_failure)
-- i.e. sign-up was impossible for that email, permanently.
--
-- THREE CHANGES
-- 1. ADOPT an orphaned profile row for the same email (a prior half-failed
--    signup) by relinking its auth_id, instead of colliding with it.
-- 2. Pick a FREE username: if the derived one is taken, append a counter until
--    it is not. Uniqueness is now guaranteed before the insert, not hoped for.
-- 3. Never let profile creation block authentication: an unexpected failure logs
--    a warning and lets the auth row commit, so a user can always get in and the
--    profile is repairable, rather than the account being un-creatable.
-- ============================================================================

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
  /* ---- 1. Derive a base handle ---------------------------------------- */
  base := coalesce(
    uname_raw,
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'user' || substr(replace(new.id::text, '-', ''), 1, 8)
  );
  base := regexp_replace(left(base, 20), '[^a-zA-Z0-9_.]', '', 'g');
  if base is null or base = '' then
    base := 'user' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  /* ---- 2. Adopt an orphaned profile for this email --------------------
     A row whose auth_id no longer resolves to an auth.users record is the
     residue of a failed signup. Relink it rather than fighting its username. */
  if coalesce(new.email, '') <> '' then
    select u.id into orphan_id
      from public.users u
     where lower(u.email) = lower(new.email)
       and (u.auth_id is null
            or not exists (select 1 from auth.users a where a.id = u.auth_id))
     limit 1;

    if orphan_id is not null then
      update public.users
         set auth_id    = new.id,
             last_seen_at = now(),
             updated_at = now()
       where id = orphan_id;
      return new;
    end if;
  end if;

  /* ---- 3. Find a genuinely free username ------------------------------ */
  uname := base;
  while exists (select 1 from public.users where username_lower = lower(uname)) loop
    n := n + 1;
    uname := left(base, 14) || n::text;
    if n > 9999 then
      uname := 'user' || substr(replace(new.id::text, '-', ''), 1, 10);
      exit;
    end if;
  end loop;

  insert into public.users (
    auth_id, username, username_lower, email, referral_code, last_seen_at
  ) values (
    new.id, uname, lower(uname), coalesce(new.email, ''), coalesce(ref_code, ''), now()
  )
  on conflict (auth_id) do nothing;

  return new;

exception when others then
  /* A profile problem must never make an account un-creatable. Log it and let
     the auth row commit; the profile can be repaired, a blocked signup cannot. */
  raise warning '[handle_new_user] profile creation failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();