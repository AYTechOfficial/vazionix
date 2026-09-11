-- ============================================================================
-- VAZIONIX — 0020: CONTENT CATALOGUES
-- ----------------------------------------------------------------------------
-- The admin console's FAQ and Legal screens were read-only placeholders pointed
-- at collections nothing ever wrote. This gives them real backing tables and
-- adds them to the editable catalogue whitelist, so an operator can actually
-- manage FAQ entries and legal documents from the console.
--
-- FAQ rows feed the landing page's FAQ accordion (falls back to the shipped
-- markup when the table is empty). Legal rows hold per-document markdown-ish
-- bodies keyed by slug, which the terms/privacy routes read.
--
-- `broadcasts` gets the same treatment: a broadcast is written here by the
-- console and fanned out to notifications by the (future) send action; the row
-- is the record of what was sent even before the send action exists.
-- ============================================================================

create table if not exists public.faq (
  id uuid primary key default gen_random_uuid(),
  question text not null,
  answer text not null,
  category text not null default 'General',
  sort int not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  body text not null default '',
  version int not null default 1,
  effective_at timestamptz,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  tone text not null default 'info',
  audience text not null default 'all',
  status text not null default 'draft' check (status in ('draft', 'sent')),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.faq         enable row level security;
alter table public.legal       enable row level security;
alter table public.broadcasts  enable row level security;

-- FAQ and legal are public-read (the landing page and legal routes are
-- anonymous), broadcasts is service-role only.
create policy "faq public read"    on public.faq    for select using (true);
create policy "legal public read" on public.legal   for select using (true);

grant select, insert, update, delete on public.faq        to service_role;
grant select, insert, update, delete on public.legal      to service_role;
grant select, insert, update, delete on public.broadcasts to service_role;

-- Seed the two legal documents every faucet needs, so the legal page and any
-- terms route have something real to render from day one. Idempotent.
insert into public.legal (slug, title, body, effective_at)
select 'terms', 'Terms of Service',
   '## Terms of Service

By using this faucet you agree to: one account per person and per payment
address; no bots, emulators, or automated claiming; no VPN, proxy or datacentre
IP addresses; no claim sharing between accounts. Earnings have no cash value
until a withdrawal is completed. We may suspend accounts that break these rules
without a payout of the balance held.', now()
where not exists (select 1 from public.legal where slug = 'terms');

insert into public.legal (slug, title, body, effective_at)
select 'privacy', 'Privacy Policy',
   '## Privacy Policy

We store your email address, username, payout address, and a record of your
claims and withdrawals. We share the minimum necessary data with payout
processors (your address and the amount) and advertising partners (a
non-identifying conversion signal). You can request deletion of your account
and its data through a support ticket; financial records are retained as long
as the law requires.', now()
where not exists (select 1 from public.legal where slug = 'privacy');
