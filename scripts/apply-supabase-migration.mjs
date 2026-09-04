/* ============================================================================
   APPLY SUPABASE MIGRATION (idempotent)
   ----------------------------------------------------------------------------
   Runs supabase/migrations/*.sql against Supabase Postgres, in order, but only
   applies each file ONCE, tracking applied migrations in a `schema_migrations`
   table. Re-running is therefore safe: already-applied files are skipped, so
   `create policy` / `drop trigger / create trigger` statements never collide.

   Usage:  node --env-file=.env.local scripts/apply-supabase-migration.mjs
   Reset:  (rare) delete rows from schema_migrations to force a re-apply.
   ========================================================================== */

import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const {
  SUPABASE_DB_HOST,
  SUPABASE_DB_PORT,
  SUPABASE_DB_NAME,
  SUPABASE_DB_USER,
  SUPABASE_DB_PASSWORD,
} = process.env;

if (!SUPABASE_DB_HOST || !SUPABASE_DB_PASSWORD) {
  console.error('[migrate] SUPABASE_DB_HOST / SUPABASE_DB_PASSWORD missing in env');
  process.exit(1);
}

const client = new Client({
  host: SUPABASE_DB_HOST,
  port: Number(SUPABASE_DB_PORT || 5432),
  database: SUPABASE_DB_NAME || 'postgres',
  user: SUPABASE_DB_USER,
  password: SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();
  console.log('[migrate] connected');

  await client.query(`
    create table if not exists public.schema_migrations (
      name text primary key,
      applied_at timestamptz not null default now()
    )
  `);

  const dir = resolve(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.error('[migrate] no .sql files found in', dir);
    await client.end();
    process.exit(1);
  }

  for (const file of files) {
    // Skip already-applied.
    const done = await client.query(
      'select 1 from public.schema_migrations where name = $1',
      [file],
    );
    if (done.rowCount && done.rowCount > 0) {
      console.log(`[migrate] skip ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(join(dir, file), 'utf8');
    console.log(`[migrate] applying ${file}...`);
    // Apply the migration and record it atomically (a failure rolls both back).
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public.schema_migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log(`[migrate] applied ${file}`);
    } catch (e) {
      await client.query('rollback');
      console.error(`[migrate] failed ${file}`);
      throw e;
    }
  }

  await client.end();
  console.log('[migrate] DONE');
}

main().catch((err) => {
  console.error('[migrate] FAILED', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});