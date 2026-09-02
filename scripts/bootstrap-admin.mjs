/* ============================================================================
   BOOTSTRAP THE FIRST SUPER ADMIN
   ----------------------------------------------------------------------------
   Usage:
     npm run bootstrap:admin -- --email you@example.com
     npm run bootstrap:admin                      # uses BOOTSTRAP_ADMIN_EMAIL
     npm run bootstrap:admin -- --email you@example.com --role finance
     npm run bootstrap:admin -- --email you@example.com --revoke=false

   THE CHICKEN AND EGG THIS SOLVES
   Granting a staff role requires a super_admin, and a fresh project has none.
   The console cannot mint the first one, and it should not be able to: an
   endpoint that promotes an account to super_admin because no super_admin exists
   yet is an endpoint that is reachable for the whole window between deploy and
   first sign-up. This script closes that window by moving the operation
   off-network — it needs the service-account key, which means filesystem access
   to your deploy, which is a higher bar than any HTTP request.

   WHAT IT DOES, IN ORDER
     1. Looks the account up in Firebase Auth BY EMAIL. If there is no such user
        it refuses and tells you to sign up first — it will not create one,
        because an Auth account with no /users profile is a broken state the app
        has to repair on next sign-in, and because `getUserByEmail` failing is
        almost always a typo rather than a missing account.
     2. Sets custom claims { role, perms?, mfa: true }. `mfa` is hardcoded true
        to match `buildAdminClaims()` and `setStaffRole`; the web guard treats a
        staff token without it as not-staff, so a claim writer must never be able
        to switch it off.
     3. Mirrors to /staff/{uid} with the same field shape `setStaffRole` writes,
        so the console's staff table and the header name resolve immediately.
     4. Revokes refresh tokens, so an already-signed-in session picks the role up
        on its next request instead of in up to an hour.
     5. Writes an /auditLog row attributed to `bootstrap:<email>`. A role grant
        with no record is indistinguishable from an attack after the fact, and
        this one is the most privileged grant the system will ever make.

   The claim is what authorises. /staff/{uid} is a mirror for display and for the
   "does a super_admin already exist" check in `setStaffRole` — deleting it does
   not revoke anything.
   ========================================================================== */

import { auth, bail, banner, db, heading, line, now, parseArgs } from './_firebase.mjs';

/** The five roles in src/lib/admin/rbac.ts. Duplicated because a .mjs script
    cannot import a TypeScript module, and validated so a typo becomes a refusal
    rather than a token carrying a role nothing recognises — which reads as
    "signed in but not staff" and is confusing to debug. */
const ROLES = ['super_admin', 'admin', 'finance', 'moderator', 'support'];

/** Custom claims are capped at 1000 bytes for the whole object. A permission id
    averages ~18 bytes with JSON quoting and a comma. Matches MAX_PERM_CLAIMS in
    src/lib/admin/claims.ts. */
const MAX_PERM_CLAIMS = 24;

async function main() {
  const { flags } = parseArgs();

  /* Help before `banner()`, which initialises the Admin SDK — usage should print
     on a machine that has no credentials configured yet. */
  if (flags.has('help')) {
    line();
    line('  --email <address>   the account to promote. Defaults to BOOTSTRAP_ADMIN_EMAIL.');
    line(`  --role <role>       one of ${ROLES.join(', ')}. Defaults to super_admin.`);
    line('  --perms a,b,c       optional per-user override. REPLACES the role grant.');
    line('  --revoke=false      skip revoking refresh tokens (not recommended).');
    line();
    return;
  }

  banner('bootstrap-admin');

  const email = (flags.get('email') ?? process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
  if (!email) {
    bail(
      'No email given.\n' +
        '  npm run bootstrap:admin -- --email you@example.com\n' +
        'or set BOOTSTRAP_ADMIN_EMAIL in .env.local.',
    );
  }

  const role = (flags.get('role') ?? 'super_admin').trim();
  if (!ROLES.includes(role)) {
    bail(`"${role}" is not a staff role. Pick one of: ${ROLES.join(', ')}.`);
  }

  const perms = (flags.get('perms') ?? '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  if (perms.length > MAX_PERM_CLAIMS) {
    bail(
      `A per-user override may hold at most ${MAX_PERM_CLAIMS} permissions — custom claims are ` +
        'capped at 1000 bytes across the whole object. Create a role instead.',
    );
  }

  /* ---- 1. The account must already exist ------------------------------- */
  let user;
  try {
    user = await auth().getUserByEmail(email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') {
      bail(
        `No Firebase Auth account has the email ${email}.\n\n` +
          'Sign up through the site first, then run this again:\n' +
          '  1. npm run dev\n' +
          '  2. open http://localhost:3000/register and create the account\n' +
          '  3. npm run bootstrap:admin -- --email ' + email + '\n\n' +
          'This script deliberately does not create the account. An Auth user with no\n' +
          '/users profile cannot earn, cannot withdraw, and has to be repaired on next\n' +
          'sign-in — and a missing account here is usually a typo in the address.',
      );
    }
    throw error;
  }

  const previous = user.customClaims ?? {};
  const previousRole = typeof previous.role === 'string' ? previous.role : 'none';

  /* ---- 2. Claims -------------------------------------------------------- */
  const claims = {
    role,
    ...(perms.length ? { perms: [...new Set(perms)].sort() } : {}),
    mfa: true,
  };
  await auth().setCustomUserClaims(user.uid, claims);

  /* ---- 3. Mirror to /staff/{uid} ---------------------------------------
     Same field shape `setStaffRole` in functions/src/index.ts writes, so the two
     writers cannot produce two different staff records. */
  const name = (user.displayName ?? '').trim() || email.split('@')[0] || user.uid;
  await db()
    .doc(`staff/${user.uid}`)
    .set(
      {
        uid: user.uid,
        email: user.email ?? email,
        name,
        role,
        perms: perms.length ? [...new Set(perms)].sort() : null,
        mfa: true,
        updatedAt: now(),
        updatedBy: `bootstrap:${email}`,
      },
      { merge: true },
    );

  /* ---- 4. Revoke refresh tokens ----------------------------------------- */
  const revoke = flags.get('revoke') !== 'false';
  if (revoke) await auth().revokeRefreshTokens(user.uid);

  /* ---- 5. Audit ---------------------------------------------------------
     Written last and never conditionally. The row shape matches `auditDoc()` in
     functions/src/ledger.ts and `writeAudit()` in src/server/admin.ts, so the
     console's audit table renders it without a special case. */
  await db()
    .collection('auditLog')
    .add({
      actorUid: 'system',
      actorName: `bootstrap:${email}`,
      action: 'roles.edit',
      target: `staff/${user.uid}`,
      detail: `role ${previousRole} -> ${role}${perms.length ? ` - perms ${perms.join(',')}` : ''} - scripts/bootstrap-admin.mjs`,
      createdAt: now(),
    });

  /* ---- Report ----------------------------------------------------------- */
  heading('Granted');
  line(`  email          ${user.email ?? email}`);
  line(`  uid            ${user.uid}`);
  line(`  role           ${previousRole} -> ${role}`);
  line(`  perms          ${perms.length ? perms.join(', ') : '(none — the role grant applies)'}`);
  line(`  mfa claim      true`);
  line(`  email verified ${user.emailVerified ? 'yes' : 'NO'}`);
  line(`  /staff/${user.uid} written`);
  line(`  /auditLog row written`);
  line(`  refresh tokens ${revoke ? 'revoked' : 'left alone (--revoke=false)'}`);

  heading('Next');
  if (!user.emailVerified) {
    line('  This account has an UNVERIFIED email. The staff console works, but the');
    line('  `claimFirstStaffRole` path in functions requires a verified address, and');
    line('  password recovery on an unverified address is not recoverable. Verify it.');
    line();
  }
  line('  1. Sign out and sign in again — the old ID token does not carry the role.');
  line('  2. Open /admin. The role hint cookie is set by the sign-in flow; if you');
  line('     land on /admin/403, your token is stale, so sign in once more.');
  line('  3. Enrol TOTP. Every staff session is refused without an mfa claim unless');
  line('     STAFF_REQUIRE_MFA=false, which should not survive first setup.');
  line('  4. Unset BOOTSTRAP_ADMIN_EMAIL. While it is set, the account holding that');
  line('     verified address can grant itself a role through the callable.');
  line();
}

main().catch((error) => {
  bail(`bootstrap-admin failed.\n${error?.stack ?? error}`);
});
