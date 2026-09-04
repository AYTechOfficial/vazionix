/* ============================================================================
   APPLY SUPABASE MIGRATION
   ----------------------------------------------------------------------------
   Runs supabase/migrations/*.sql against the Supabase Postgres instance using
   the direct connection details from .env.local. The password is read from env
   (never typed inline) because it contains a shell-sensitive `^`.

   Usage:  node --env-file=.env.local scripts/apply-supabase-migration.mjs
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

  const dir = resolve(process.cwd(), 'supabase', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    console.error('[migrate] no .sql files found in', dir);
    await client.end();
    process.exit(1);
  }

  for (const file of files) {
    const sql = readFileSync(join(dir, file), 'utf8');
    console.log(`[migrate] applying ${file}...`);
    await client.query(sql);
    console.log(`[migrate] applied ${file}`);
  }

  await client.end();
  console.log('[migrate] DONE');
}

main().catch((err) => {
  console.error('[migrate] FAILED', err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});