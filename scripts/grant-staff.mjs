/* ============================================================================
   GRANT A STAFF ROLE (Supabase backend)
   ----------------------------------------------------------------------------
   Promotes an existing account to the admin console. The account must already
   exist — sign up through the site first, then run this.

   Usage:
     node --env-file=.env.local scripts/grant-staff.mjs you@example.com
     node --env-file=.env.local scripts/grant-staff.mjs you@example.com admin
     node --env-file=.env.local scripts/grant-staff.mjs you@example.com super_admin --mfa

   Roles: super_admin | admin | finance | moderator | support   (default: super_admin)

   MFA: the guard requires `mfa` on a staff record unless STAFF_REQUIRE_MFA=false.
   Pass --mfa to set it now, or set STAFF_REQUIRE_MFA=false in Vercel for the very
   first enrolment and remove it afterwards.
   ========================================================================== */

import pg from 'pg';

const { Client } = pg;
const ROLES = ['super_admin', 'admin', 'finance', 'moderator', 'support'];

const [emailArg, roleArg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const withMfa = process.argv.includes('--mfa');
const email = (emailArg ?? '').trim().toLowerCase();
const role = (roleArg ?? 'super_admin').trim();

if (!email) {
  console.error('Usage: node --env-file=.env.local scripts/grant-staff.mjs <email> [role] [--mfa]');
  process.exit(1);
}
if (!ROLES.includes(role)) {
  console.error(`Unknown role "${role}". One of: ${ROLES.join(', ')}`);
  process.exit(1);
}

const client = new Client({
  host: process.env.SUPABASE_DB_HOST,
  port: Number(process.env.SUPABASE_DB_PORT || 5432),
  database: process.env.SUPABASE_DB_NAME || 'postgres',
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await client.connect();

  const found = await client.query(
    'select id, email, username from public.users where lower(email) = $1 limit 1',
    [email],
  );
  if (found.rowCount === 0) {
    console.error(`No account with email ${email}. Sign up on the site first, then re-run.`);
    await client.end();
    process.exit(1);
  }

  const user = found.rows[0];

  await client.query(
    `insert into public.staff (user_id, email, name, role, mfa, updated_at)
     values ($1, $2, $3, $4, $5, now())
     on conflict (user_id) do update
        set role = excluded.role,
            email = excluded.email,
            name = coalesce(public.staff.name, excluded.name),
            mfa = excluded.mfa,
            updated_at = now()`,
    [user.id, user.email, user.username, role, withMfa],
  );

  const check = await client.query(
    'select s.role, s.mfa, u.email, u.username from public.staff s join public.users u on u.id = s.user_id where s.user_id = $1',
    [user.id],
  );
  const row = check.rows[0];
  console.log(`Granted: ${row.email} (${row.username}) -> role=${row.role} mfa=${row.mfa}`);
  if (!row.mfa) {
    console.log('NOTE: mfa=false. The guard refuses staff without MFA unless');
    console.log('      STAFF_REQUIRE_MFA=false is set. Either re-run with --mfa or');
    console.log('      set that env var for the first enrolment and remove it after.');
  }
  console.log('Open /admin/login, sign in with this account, then /admin.');

  await client.end();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});