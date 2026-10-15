# Deploying Vazionix to Vercel with Supabase

The application's data layer (`src/server/native-db.ts`) is a Postgres client —
it is not bound to BootKeep. Supabase *is* Postgres, so the same code runs on
Vercel against a Supabase project with zero code changes.

## What changes between BootKeep and Vercel/Supabase

| Environment variable | BootKeep (current) | Vercel + Supabase |
| --- | --- | --- |
| `DATABASE_URL` | *(unset — uses host/port vars)* | **Supabase connection string** (see below) |
| `BOOTKEEP_DB_*` / `SUPABASE_DB_*` | set | *(unset — ignored when `DATABASE_URL` exists)* |
| `DATABASE_SSL` | *(defaults to ssl on)* | leave unset (Supabase requires SSL) |
| `NEXT_PUBLIC_SITE_URL` | vazionix.bot-keep.xyz | your Vercel domain |

## 1. Apply the schema to Supabase

Run the same migrations file that built the BootKeep database. From the
Supabase SQL editor (or `psql` with the Supabase connection string):

```bash
psql "$SUPABASE_DATABASE_URL" -f vazionix-migrations.sql
```

The migrations are idempotent (`if not exists` throughout), so re-running is safe.

## 2. Set environment variables in Vercel

In Vercel → Project → Settings → Environment Variables, add:

- `DATABASE_URL` — the Supabase **connection pooling** string
  (Project → Settings → Database → Connection string → "Pooled"),
  e.g. `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres?sslmode=require`
- `NEXT_PUBLIC_SITE_URL` — e.g. `https://vazionix.vercel.app`

## 3. Deploy

Connect the GitHub repo (`AYTechOfficial/vazionix`, `main`) to a Vercel
project, or:

```bash
vercel --prod
```

`next build` runs the standard typecheck during build; no platform-specific
flags are needed (the `cpus: 1` / typecheck-off container settings in
`next.config.mjs` only apply inside the low-memory BootKeep container and are
harmless on Vercel).

## Notes

- Auth is HTTP-cookie based (`/api/auth/*`) and works on any origin; set
  `NEXT_PUBLIC_SITE_URL` so absolute links are correct.
- Ads: the `ad_units` table is read at request time. A fresh Supabase schema
  starts with no rows — slots render placeholders / AdsLab fallbacks until
  inventory is pasted via Admin → Ads → Inventory on the deployed domain.
