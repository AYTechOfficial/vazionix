import { handler, ok, requireString } from '@/server/http';
import { requireUser } from '@/server/session';
import { listRedemptions, redeemCoupon } from '@/server/earn/coupon';
import { getProfile } from '@/server/users';

/* ============================================================================
   GET  /api/coupon — the viewer's redemption history
   POST /api/coupon — redeem a code
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok({ redemptions: await listRedemptions(claims.uid, 25) });
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();

  const result = await redeemCoupon({
    uid: claims.uid,
    code: requireString(body, 'code', 40),
    ip: ctx.ip,
  });

  const [redemptions, profile] = await Promise.all([
    listRedemptions(claims.uid, 25),
    getProfile(claims.uid, claims.emailVerified),
  ]);

  return ok({ ok: true, ...result, redemptions, profile });
});
