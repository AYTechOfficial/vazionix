-- ============================================================================
-- VAZIONIX — STAFF ROLES ON SUPABASE
-- ----------------------------------------------------------------------------
-- The admin console reads the caller's role from a VERIFIED credential. On the
-- Firebase backend that was a custom claim on the session cookie. On Supabase
-- the equivalent trusted store is a table only the server (service_role) can
-- read — a client can neither read nor write it, and RLS denies every other
-- role by default.
--
-- ROLES (mirrors src/lib/admin/rbac.ts)
--   super_admin | admin | finance | moderator | support
--
-- `mfa` is recorded per staff member so the guard's MFA requirement has
-- something real to check on this backend.
-- ============================================================================

create table if not exists public.staff (
  user_id    uuid primary key references public.users(id) on delete cascade,
  email      text,
  name       text,
  role       text not null check (role in ('super_admin','admin','finance','moderator','support')),
  -- Per-user permission grants layered over the role, matching canWithGrants().
  perms      jsonb,
  mfa        boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.staff enable row level security;
-- No policy for anon/authenticated: the staff table is server-only by design.
-- service_role bypasses RLS but still needs the table privilege.
grant select, insert, update, delete on public.staff to service_role;

create index if not exists staff_role_idx on public.staff(role);