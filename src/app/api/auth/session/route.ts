import { getSessionClaims } from '@/server/session';
import { handler, ok, clientCountry } from '@/server/http';
import { ensureUser, touchUser } from '@/server/users';
import { noteReferralClick } from '@/server/social';

/* ============================================================================
   POST /api/auth/session   — complete sign-in server-side
   DELETE /api/auth/session — sign out everywhere
   ----------------------------------------------------------------------------
   On Supabase the browser client signs in and writes its own httpOnly auth
   cookies; there is no ID-token-for-cookie exchange to perform here. What the
   client CANNOT be allowed to do is create its own profile row, so this route
   is where the server-side profile verify/repair runs:

     • ensures `public.users` exists for the verified auth user (the DB trigger
       normally creates it at signup; this repairs a half-failed one),
     • resolves the referral CODE server-side — the client only ever sends a
       code, never a uid, so it cannot claim to have been referred by a uid it
       made up,
     • records country from the CDN's geo header, not from a form.

   The session credential itself is the Supabase cookie, verified by
   getSessionClaims() (supabase.auth.getUser() — a signature check).
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async (ctx) => {
  const body = await ctx.body();
  const referralCode = typeof body.referralCode === 'string' && body.referralCode.trim()
    ? body.referralCode.trim()
    : null;

  const claims = await getSessionClaims();
  if (!claims) {
    return ok({ ok: false, error: 'No session to complete. Sign in again.', code: 'unauthenticated' }, 401);
  }

  const username =
    claims.name ??
    claims.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 20) ??
    `user${claims.uid.replace(/-/g, '').slice(0, 8)}`;

  const country = clientCountry(ctx.request);

  const { created } = await ensureUser({
    uid: claims.uid,
    email: claims.email ?? '',
    username: username.length >= 3 ? username : `user${claims.uid.replace(/-/g, '').slice(0, 8)}`,
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
  });
});

export const DELETE = handler(async () => {
  const { destroySession } = await import('@/server/session');
  await destroySession();
  return ok({ ok: true });
});
