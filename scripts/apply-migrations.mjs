/* Applies vazionix-migrations.sql to the ecospark Postgres.
   The file is a psql script whose blocks are separated by `\echo APPLY <name>`
   lines. Each block is idempotent where the schema allows it, but a few
   statements (CREATE POLICY) are not, and the managed `botkeep` user cannot
   CREATE ROLE. So this runner:

     1. splits the file into blocks, then each block into individual
        statements (dollar-quote, string, and comment aware);
     2. drops statements that build the retired Supabase role model
        (create role / grant|revoke|alter ... to|from service_role, authenticated, anon);
     3. executes every remaining statement on its own, tolerating
        "already exists" duplicates so a re-run is a no-op.

   Reads the same env vars the app reads. Never prints credentials. */
import { readFileSync } from 'node:fs';
import pg from 'pg';

const env = { ...process.env };
for (const line of readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(line);
  if (m && !(m[1] in env)) env[m[1]] = m[2].trim();
}

const host = env.BOOTKEEP_DB_HOST ?? env.SUPABASE_DB_HOST;
const port = Number(env.BOOTKEEP_DB_PORT ?? env.SUPABASE_DB_PORT ?? 5432);
const database = env.BOOTKEEP_DB_NAME ?? env.SUPABASE_DB_NAME ?? 'postgres';
const user = env.BOOTKEEP_DB_USER ?? env.SUPABASE_DB_USER ?? 'postgres';
const password = env.BOOTKEEP_DB_PASSWORD ?? env.SUPABASE_DB_PASSWORD;
if (!host || !password) {
  console.error('missing DB config');
  process.exit(1);
}

const SENSITIVE_ROLES = new Set(['service_role', 'authenticated', 'anon']);

/* --- statement splitter: dollar quotes, quotes, comments aware ------------- */
function splitStatements(sql) {
  const out = [];
  let stmt = '';
  let i = 0;
  let state = 'default'; // default | line-comment | block-comment | string | dollar
  let dollarTag = '';
  while (i < sql.length) {
    const c = sql[i];
    const next = sql[i + 1];
    if (state === 'default') {
      if (c === '-' && next === '-') { state = 'line-comment'; stmt += c; i++; continue; }
      if (c === '/' && next === '*') { state = 'block-comment'; stmt += c; i++; continue; }
      if (c === "'") { state = 'string'; stmt += c; i++; continue; }
      if (c === '$') {
        const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
        if (m) { state = 'dollar'; dollarTag = m[0]; stmt += m[0]; i += m[0].length; continue; }
      }
      if (c === ';') { out.push(stmt.trim()); stmt = ''; i++; continue; }
      stmt += c; i++; continue;
    }
    if (state === 'line-comment') {
      stmt += c;
      if (c === '\n') state = 'default';
      i++; continue;
    }
    if (state === 'block-comment') {
      stmt += c;
      if (c === '*' && next === '/') { stmt += next; i += 2; state = 'default'; continue; }
      i++; continue;
    }
    if (state === 'string') {
      stmt += c;
      if (c === "'") {
        if (next === "'") { stmt += next; i += 2; continue; }
        state = 'default';
      }
      i++; continue;
    }
    if (state === 'dollar') {
      stmt += c;
      if (c === '$' && sql.startsWith(dollarTag, i)) {
        stmt += dollarTag.slice(1); /* rest of the closing tag beyond this char */
        i += dollarTag.length;
        state = 'default';
        continue;
      }
      i++; continue;
    }
  }
  if (stmt.trim()) out.push(stmt.trim());
  return out;
}

/* True when the statement only makes sense for the retired Supabase role model. */
function isRoleStatement(s) {
  /* Leading comments merge into the statement during splitting; drop them so
     anchors match the real SQL (a comment saying "grant ... to service_role"
     must not decide the statement's fate either way). */
  const withoutComments = s
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n')
    .toLowerCase();
  const low = withoutComments.replace(/\s+/g, ' ').trim();
  if (/^create role /.test(low) || /^drop role /.test(low) || /^alter role /.test(low)) return true;
  /* Inline do-blocks that create roles: do $$ begin create role ... end $$ */
  if (/^do \$\$/.test(low) && /create role/.test(low)) return true;
  const target = /\b(?:to|from)\s+((?:public\.)?(service_role|authenticated|anon))\b/.exec(low);
  if (!target) return false;
  if (!SENSITIVE_ROLES.has(target[2])) return false;
  return /^(grant|revoke|alter)/.test(low);
}

/* Statement error codes that are safe to ignore on a re-run. */
const DUP_CODES = new Set(['42P07', '42710', '42723', '42701', '42712', '42P06', '42P16']);
function isDuplicateError(e) {
  if (DUP_CODES.has(e.code)) return true;
  return /already exists/i.test(e.message ?? '');
}

/* --- build the migration blocks -------------------------------------------- */
const raw = readFileSync(new URL('../vazionix-migrations.sql', import.meta.url), 'utf8');
const blocks = [];
let current = null;
for (const line of raw.split(/\r?\n/)) {
  const m = /^\\echo APPLY (.+)$/.exec(line.trim());
  if (m) {
    if (current) blocks.push(current);
    current = { name: m[1], sql: '' };
  } else if (current) {
    current.sql += line + '\n';
  }
}
if (current) blocks.push(current);

/* --- run -------------------------------------------------------------------- */
const pool = new pg.Pool({ host, port, database, user, password, ssl: env.DATABASE_SSL === 'disable' ? false : { rejectUnauthorized: false }, max: 1 });
console.log(`applying migrations to ${host}:${port}/${database} as ${user}`);
let failed = 0;
for (const block of blocks) {
  const stmts = splitStatements(block.sql);
  const client = await pool.connect();
  let applied = 0, skipped = 0, dup = 0;
  const errors = [];
  try {
    for (const s of stmts) {
      if (!s || isRoleStatement(s)) { skipped++; continue; }
      try {
        await client.query(s);
        applied++;
      } catch (e) {
        if (isDuplicateError(e)) { dup++; continue; }
        errors.push(e);
        break; /* stop at the first real failure in this block */
      }
    }
  } finally {
    client.release();
  }
  if (errors.length) {
    failed++;
    console.error(`FAIL ${block.name}: ${errors[0].message} (applied=${applied} before failure)`);
  } else {
    console.log(`OK   ${block.name} (applied=${applied} dupTolerated=${dup} roleSkipped=${skipped})`);
  }
}
const counts = await pool.query(`SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema='public'`);
console.log(`public tables after migration: ${counts.rows[0].n}`);
await pool.end();
if (failed > 0) {
  console.error(`${failed} block(s) failed`);
  process.exit(1);
}
console.log('ALL MIGRATIONS APPLIED');
