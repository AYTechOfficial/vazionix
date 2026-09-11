# Operator scripts

Three commands, all talking to Supabase Postgres directly through the
`SUPABASE_DB_*` credentials in `.env.local` (direct Postgres connection, not
the service-role REST client — these run outside the app).

```bash
node --env-file=.env.local scripts/apply-supabase-migration.mjs
node --env-file=.env.local scripts/seed-supabase.mjs [--config-only|--catalogue-only]
node --env-file=.env.local scripts/grant-staff.mjs you@example.com [role] [--mfa]
```

`--env-file` needs Node 20.6 or newer. The migration script is idempotent: it
tracks applied files in a `schema_migrations` table and skips them, so re-running
after a release only applies what is new. The seed is also idempotent — every
write is an upsert, and values you tuned in the admin console are never
overwritten.

## `apply-supabase-migration.mjs`

Applies `supabase/migrations/*.sql` in filename order, once each. Run it after
pulling a release that adds a migration file.

## `seed-supabase.mjs`

Writes what a fresh project needs before any page has something to show: the
four `config` rows (economy, rates, site, ads), the opening lottery round, and
the starter earn catalogue (PTC ads, shortlinks, challenges, offerwall
providers). `--config-only` and `--catalogue-only` restrict it.

## `grant-staff.mjs`

Promotes an existing account to the admin console (the account must already
exist — sign up through the site first). Roles: `super_admin | admin | finance |
moderator | support`. Pass `--mfa` to mark the staff row as MFA-enrolled; the
admin guard refuses any staff row without it unless `STAFF_REQUIRE_MFA=false`
is set (use that only for the very first enrolment, then remove it).
