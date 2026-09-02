import { handler, ok } from '@/server/http';
import { isServerFirebaseReady } from '@/server/db';
import { captchaEnabled, captchaProvider } from '@/lib/captcha/config';
import { railStatus } from '@/server/payouts';

/* ============================================================================
   GET /api/health
   ----------------------------------------------------------------------------
   A readiness probe that answers the questions an operator actually asks after a
   deploy: are the server credentials present, is a captcha provider configured,
   and can either automated payout rail send money.

   It reports CONFIGURATION, never secrets and never data. Booleans only: whether a
   key is set, not what it is. A health endpoint that leaks which provider key is
   present is a fingerprinting gift; one that leaks the key is worse.

   Unauthenticated on purpose, because a probe that needs a session cannot run from
   a load balancer. That is also why it does not touch Firestore — a health check
   that costs a document read per poll is a health check that shows up on the bill.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const rails = railStatus();

  const config = {
    firebaseAdmin: isServerFirebaseReady(),
    firebaseClient: Boolean(
      process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    ),
    captcha: { enabled: captchaEnabled, provider: captchaProvider, secret: Boolean(process.env.CAPTCHA_SECRET_KEY) },
    payouts: {
      faucetPay: rails.FaucetPay.configured,
      cWallet: rails.CWallet.configured,
      /* Direct is always "configured" because it is deliberately manual: signing
         keys do not belong in a web process. */
      direct: rails.Direct.configured,
    },
    siteUrl: Boolean(process.env.NEXT_PUBLIC_SITE_URL),
  };

  /* Degraded rather than unhealthy when a rail is missing: the site earns and the
     admin console works without a payout key, it just cannot send. Only missing
     Firebase credentials make it genuinely unusable. */
  const status = !config.firebaseAdmin || !config.firebaseClient ? 'unconfigured' : 'ok';

  return ok({ status, config, at: new Date().toISOString() });
});
