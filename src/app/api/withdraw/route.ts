import type { CoinTicker, PayoutRailName } from '@/lib/models';

import { handler, ok, optionalString, requireString } from '@/server/http';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';
import { listWithdrawals, quoteWithdrawal, requestWithdrawal } from '@/server/withdraw';
import { getPayoutRails } from '@/server/config';

/* ============================================================================
   GET  /api/withdraw — rails, history, and the viewer's spendable balance
   POST /api/withdraw — { action: 'quote' | 'request' }
   ----------------------------------------------------------------------------
   `quote` is priced entirely on the server and returned whole, so the amount,
   fee, token cost and USD value the user sees are the same numbers the request
   will be validated against. Pricing in the browser and trusting the result is
   the standard way a withdrawal page gets exploited.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  const [rails, history, profile] = await Promise.all([
    getPayoutRails(),
    listWithdrawals(claims.uid, 25),
    getProfile(claims.uid, claims.emailVerified),
  ]);
  return ok({ rails, history, balance: profile?.balance ?? 0, locked: profile?.lockedBalance ?? 0 });
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();
  const action = optionalString(body, 'action') ?? 'request';

  const profile = await getProfile(claims.uid, claims.emailVerified);
  const balance = profile?.balance ?? 0;

  if (action === 'quote') {
    const quote = await quoteWithdrawal({
      coin: requireString(body, 'coin', 10) as CoinTicker,
      rail: requireString(body, 'rail', 20) as PayoutRailName,
      amount: requireString(body, 'amount', 40),
      balance,
    });
    return ok({ ok: true, quote, balance });
  }

  const record = await requestWithdrawal({
    uid: claims.uid,
    coin: requireString(body, 'coin', 10) as CoinTicker,
    rail: requireString(body, 'rail', 20) as PayoutRailName,
    address: requireString(body, 'address', 200),
    amount: requireString(body, 'amount', 40),
    clientRequestId: requireString(body, 'clientRequestId', 64),
    captchaToken: optionalString(body, 'captchaToken'),
    saveAddress: body.saveAddress === true,
    addressLabel: optionalString(body, 'addressLabel') ?? undefined,
    ip: ctx.ip,
  });

  const [history, fresh] = await Promise.all([
    listWithdrawals(claims.uid, 25),
    getProfile(claims.uid, claims.emailVerified),
  ]);

  return ok({
    ok: true,
    withdrawal: record,
    history,
    balance: fresh?.balance ?? 0,
    locked: fresh?.lockedBalance ?? 0,
  });
});
