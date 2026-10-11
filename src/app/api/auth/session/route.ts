import { getSessionClaims, destroySession } from '@/server/session';
import { handler, ok, clientCountry } from '@/server/http';
import { ensureUser, touchUser } from '@/server/users';
import { noteReferralClick } from '@/server/social';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await getSessionClaims();
  return claims ? ok({ ok: true, user: { id: claims.uid, email: claims.email }, emailVerified: claims.emailVerified }) : ok({ ok: false, user: null }, 401);
});

export const POST = handler(async (ctx) => {
  const body = await ctx.body();
  const referralCode = typeof body.referralCode === 'string' && body.referralCode.trim() ? body.referralCode.trim() : null;
  const claims = await getSessionClaims();
  if (!claims) return ok({ ok: false, error: 'No session to complete. Sign in again.', code: 'unauthenticated' }, 401);
  const username = claims.name ?? claims.email?.split('@')[0]?.replace(/[^a-zA-Z0-9_.]/g, '').slice(0, 20) ?? `user${claims.uid.replace(/-/g, '').slice(0, 8)}`;
  const { created } = await ensureUser({ uid: claims.uid, email: claims.email ?? '', username: username.length >= 3 ? username : `user${claims.uid.replace(/-/g, '').slice(0, 8)}`, referralCode, countryCode: clientCountry(ctx.request), ip: ctx.ip });
  if (created && referralCode) await noteReferralClick(referralCode);
  if (!created) await touchUser(claims.uid);
  return ok({ ok: true, uid: claims.uid, created, emailVerified: claims.emailVerified });
});

export const DELETE = handler(async () => { await destroySession(); return ok({ ok: true }); });
