import { getAdminAuth } from '@/lib/firebase/admin';

import { AppError, isServerFirebaseReady } from '@/server/db';
import { clientCountry, handler, ok, optionalString, requireString } from '@/server/http';
import { destroySession, mintSession } from '@/server/session';
import { ensureUser, touchUser } from '@/server/users';
import { noteReferralClick } from '@/server/social';

/* ============================================================================
   POST /api/auth/session   — sign in
   DELETE /api/auth/session — sign out everywhere
   ----------------------------------------------------------------------------
   The client authenticates with Firebase Auth, gets an ID token, and posts it
   here exactly once. This route mints the httpOnly session cookie and, on a
   first sign-in, creates the `/users/{uid}` profile.

   PROFILE CREATION LIVES HERE, NOT IN THE CLIENT
   `/users/{uid}` holds `balance`, `level` and `referredBy`. A client able to
   create it could seed itself a balance and name its own referrer, so
   firestore.rules denies client creates outright and this route is the only
   writer. `ensureUser` is idempotent, which also repairs an account whose signup
   half-failed — it is created on the next sign-in instead of staying broken.

   The referral code arrives from the `?r=` parameter the browser captured before
   signup. It is resolved to a uid server-side; a client cannot claim to have
   been referred by a uid it made up, because it never sends a uid.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async (ctx) => {
  if (!isServerFirebaseReady()) {
    throw new AppError(
      'The server has no Firebase credentials. Set FIREBASE_SERVICE_ACCOUNT_KEY (see .env.example).',
      503,
      'server_unconfigured',
    );
  }

  const body = await ctx.body();
  const idToken = requireString(body, 'idToken', 4096);

  const { claims } = await mintSession(idToken);

  const username = optionalString(body, 'username');
  const referralCode = optionalString(body, 'referralCode');
  const country = clientCountry(ctx.request);

  /* A Google sign-in has no username field, so fall back to the OAuth display
     name and finally to the email local part. Never to a random string — the
     username is public and permanent-ish. */
  const record = await getAdminAuth().getUser(claims.uid);
  const resolvedName =
    username ??
    (record.displayName ? record.displayName.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 20) : null) ??
    claims.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 20) ??
    `user${claims.uid.slice(0, 6)}`;

  const { created } = await ensureUser({
    uid: claims.uid,
    email: claims.email ?? record.email ?? '',
    username: resolvedName.length >= 3 ? resolvedName : `user${claims.uid.slice(0, 6)}`,
    referralCode,
    countryCode: country,
    ip: ctx.ip,
  });

  if (created && referralCode) await noteReferralClick(referralCode);
  if (!created) await touchUser(claims.uid);

  return ok({
    ok: true,
    uid: claims.uid,
    created,
    emailVerified: claims.emailVerified,
    admin: claims.admin,
    adminRole: claims.adminRole,
  });
});

export const DELETE = handler(async () => {
  await destroySession();
  return ok({ ok: true });
});
