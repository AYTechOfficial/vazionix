import { handler, ok, requireNumber } from '@/server/http';
import { requireUser } from '@/server/session';
import { buyLotteryTickets, getLotteryState } from '@/server/earn/lottery';
import { getProfile } from '@/server/users';

/* ============================================================================
   GET  /api/earn/lottery — pool, draw time, the viewer's tickets
   POST /api/earn/lottery — buy tickets
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok(await getLotteryState(claims.uid));
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();

  const result = await buyLotteryTickets({
    uid: claims.uid,
    count: requireNumber(body, 'count'),
    ip: ctx.ip,
  });

  const [state, profile] = await Promise.all([
    getLotteryState(claims.uid),
    getProfile(claims.uid, claims.emailVerified),
  ]);

  return ok({ ok: true, ...result, state, profile });
});
