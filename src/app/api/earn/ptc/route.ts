import { AppError } from '@/server/db';
import { handler, ok, optionalString, requireString } from '@/server/http';
import { requireUser } from '@/server/session';
import { completePtcView, startPtcView } from '@/server/earn/links';
import { getProfile } from '@/server/users';
import { qualifyReferral } from '@/server/social';

/* ============================================================================
   POST /api/earn/ptc
   ----------------------------------------------------------------------------
   Two actions on one route, because they are two halves of one protocol and
   splitting them across files hides that:

     { action: 'start',    adId }   → { token, targetUrl, requiredSeconds }
     { action: 'complete', token }  → credit

   The elapsed time is measured between the server timestamps recorded by these
   two calls. A client-side timer is a progress bar, not evidence.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();
  const action = requireString(body, 'action', 20);

  if (action === 'start') {
    const session = await startPtcView(claims.uid, requireString(body, 'adId', 200));
    return ok({ ok: true, ...session });
  }

  if (action === 'complete') {
    const result = await completePtcView({
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
