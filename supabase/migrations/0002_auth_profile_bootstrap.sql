-- ============================================================================
-- VAZIONIX — SUPABASE AUTH PROFILE BOOTSTRAP (Phase B)
-- ----------------------------------------------------------------------------
-- When a user signs up through Supabase Auth, the row landing in auth.users has
-- nobody in public.users yet. This trigger creates it — the exact replacement
-- for the retired Firebase `auth.user().onCreate` Cloud Function. No client can
-- insert into public.users (RLS denies it, and service_role is server-only), so
-- the balance/level/roles defaults can never be seeded by a browser.
--
-- username / referralCode come from the signup request's user_metadata, which
-- src/lib/supabase/auth.ts writes on registerWithEmail().
-- ============================================================================

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
  -- Username derives from metadata, else the email local part, else a fallback.
  uname := coalesce(
    uname_raw,
    split_part(coalesce(new.email, 'user'), '@', 1),
    'user' || substr(new.id::text, 1, 6)
  );
  uname := regexp_replace(left(uname, 20), '[^a-zA-Z0-9_.]', '', 'g');
  if uname = '' then uname := 'user' || substr(new.id::text, 1, 6); end if;

  insert into public.users (
    auth_id,
    username,
    username_lower,
    email,
    referral_code
  ) values (
    new.id,
    uname,
    lower(uname),
    coalesce(new.email, ''),
    coalesce(ref_code, '')
  )
  on conflict (auth_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();