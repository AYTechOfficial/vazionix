import { handler, ok, optionalString } from '@/server/http';
import { requireUser } from '@/server/session';
import { claimFaucet, getFaucetState } from '@/server/earn/faucet';
import { getProfile } from '@/server/users';
import { qualifyReferral } from '@/server/social';

/* ============================================================================
   GET  /api/earn/faucet — current cooldown state
   POST /api/earn/faucet — claim
   ----------------------------------------------------------------------------
   The response of a claim carries the new balance and the next claim time, so
   the UI updates from the server's answer rather than optimistically guessing
   and then correcting. On a payouts product the number on screen has to be the
   number in the database.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok(await getFaucetState(claims.uid));
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();

  const result = await claimFaucet({
    uid: claims.uid,
    captchaToken: optionalString(body, 'captchaToken'),
    ip: ctx.ip,
  });

  /* A level-up can qualify this user as their referrer's referral, which pays a
     one-off bonus. Checked after the credit so the level is the new one. */
  if (result.levelUp) await qualifyReferral(claims.uid, result.level);

  const [state, profile] = await Promise.all([
    getFaucetState(claims.uid),
    getProfile(claims.uid, claims.emailVerified),
  ]);

  return ok({
    ok: true,
    credited: result.credited,
    exp: result.exp,
    bonusBps: result.bonusBps,
    balance: result.balance,
    level: result.level,
    levelUp: result.levelUp,
    happyHour: result.happyHour,
    replayed: result.replayed,
    state,
    profile,
  });
});
