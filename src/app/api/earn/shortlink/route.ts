import { AppError } from '@/server/db';
import { handler, ok, optionalString, requireString } from '@/server/http';
import { requireUser } from '@/server/session';
import { completeShortlink, startShortlink } from '@/server/earn/links';
import { getProfile } from '@/server/users';
import { qualifyReferral } from '@/server/social';

/* ============================================================================
   POST /api/earn/shortlink
     { action: 'start',    linkId }  → { token, targetUrl, requiredSeconds }
     { action: 'complete', token }   → credit

   The `targetUrl` returned by `start` is your monetised destination — the AdsLab
   or Adsterra direct link configured on that shortlink document. The user goes
   through it, comes back, and the credit is gated on the server-measured dwell.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();
  const action = requireString(body, 'action', 20);

  if (action === 'start') {
    const session = await startShortlink(claims.uid, requireString(body, 'linkId', 200));
    return ok({ ok: true, ...session });
  }

  if (action === 'complete') {
    const result = await completeShortlink({
      uid: claims.uid,
      token: requireString(body, 'token', 200),
      captchaToken: optionalString(body, 'captchaToken'),
      ip: ctx.ip,
    });

    if (result.levelUp) await qualifyReferral(claims.uid, result.level);

    return ok({
      ok: true,
      credited: result.credited,
      exp: result.exp,
      balance: result.balance,
      level: result.level,
      levelUp: result.levelUp,
      availableAt: result.availableAt,
      profile: await getProfile(claims.uid, claims.emailVerified),
    });
  }

  throw new AppError(`Unknown action "${action}".`, 400, 'bad_action');
});
