-- Vazionix native PostgreSQL bootstrap.
-- This replaces the Supabase Auth service while retaining the existing public
-- schema and ledger migrations. The app never grants browser access to these
-- tables; all auth operations run through the Next.js server.
create extension if not exists pgcrypto;

create schema if not exists auth;

do $$ begin
  create role service_role noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated noinherit;
exception when duplicate_object then null; end $$;
do $$ begin
  create role anon noinherit;
exception when duplicate_object then null; end $$;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table if not exists public.auth_accounts (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  email_verified_at timestamptz,
  verification_token_hash text,
  verification_expires_at timestamptz,
  reset_token_hash text,
  reset_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.auth_sessions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.auth_accounts(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists auth_sessions_account_idx on public.auth_sessions(account_id);
create index if not exists auth_sessions_expiry_idx on public.auth_sessions(expires_at);

grant usage on schema auth, public to service_role;
grant all on auth.users, public.auth_accounts, public.auth_sessions to service_role;
grant usage, select on all sequences in schema public to service_role;
