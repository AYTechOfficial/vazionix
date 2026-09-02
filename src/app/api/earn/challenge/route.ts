import { handler, ok, requireString } from '@/server/http';
import { requireUser } from '@/server/session';
import { claimChallenge, listChallenges } from '@/server/earn/daily';
import { getProfile } from '@/server/users';

/* ============================================================================
   GET  /api/earn/challenge — the viewer's challenge list with live progress
   POST /api/earn/challenge — claim a completed one
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok({ challenges: await listChallenges(claims.uid) });
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();

  const result = await claimChallenge({
    uid: claims.uid,
    challengeId: requireString(body, 'challengeId', 200),
    ip: ctx.ip,
  });

  const [challenges, profile] = await Promise.all([
    listChallenges(claims.uid),
    getProfile(claims.uid, claims.emailVerified),
  ]);

  return ok({
    ok: true,
    credited: result.credited,
    exp: result.exp,
    balance: result.balance,
    challenges,
    profile,
  });
});
