import { handler, ok } from '@/server/http';
import { requireUser } from '@/server/session';
import { claimDailyBonus, getDailyState } from '@/server/earn/daily';
import { getProfile } from '@/server/users';
import { qualifyReferral } from '@/server/social';

/* ============================================================================
   GET  /api/earn/daily — ladder state
   POST /api/earn/daily — claim today's step
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok(await getDailyState(claims.uid));
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const result = await claimDailyBonus({ uid: claims.uid, ip: ctx.ip });

  if (result.levelUp) await qualifyReferral(claims.uid, result.level);

  const [state, profile] = await Promise.all([
    getDailyState(claims.uid),
    getProfile(claims.uid, claims.emailVerified),
  ]);

  return ok({
    ok: true,
    credited: result.credited,
    exp: result.exp,
    step: result.step,
    streakDays: result.streakDays,
    balance: result.balance,
    levelUp: result.levelUp,
    state,
    profile,
  });
});
