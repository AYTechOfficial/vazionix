import { NextResponse, type NextRequest } from 'next/server';

import { creditFromAdslab, verifyCaptchaSignature } from '@/server/adslab';
import { getEconomy } from '@/server/config';

/* ============================================================================
   POST /api/captcha/postback   —  AdsLab captcha solve webhook
   ----------------------------------------------------------------------------
   Configure in AdsLab → Website Settings → Captcha Postback:

       https://vazionixfaucet.vercel.app/api/captcha/postback

   SIGNATURE: hmac_sha256("<sub_id>:<timestamp>", secretKey) — an HMAC, NOT the
   plain sha256 the ad postback uses. The two schemes are verified by two separate
   functions on purpose; using the wrong one would accept forged traffic.

   REPLAY PROTECTION: the signature alone is replayable forever, because it covers
   a timestamp the attacker already holds. So a body older than ten minutes is
   refused, and the credit's idempotency key includes the timestamp — a replay
   inside the window still cannot pay twice.

   WHAT IT PAYS: the faucet reward, read from the live economy config, so the
   captcha claim and a normal faucet claim can never drift apart.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Seconds a webhook body stays acceptable. */
const MAX_SKEW_SECONDS = 600;

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return new NextResponse('bad body', { status: 400 });

  const subId = String(body.sub_id ?? '');
  const timestamp = String(body.timestamp ?? '');
  const signature = String(body.signature ?? '');
  const status = String(body.status ?? '').toLowerCase();

  if (!subId || !timestamp || !signature) {
    return new NextResponse('missing params', { status: 400 });
  }

  if (!verifyCaptchaSignature(subId, timestamp, signature)) {
    console.warn('[captcha] invalid webhook signature', { subId });
    return new NextResponse('Invalid Signature', { status: 403 });
  }

  const ts = Number(timestamp);
  const skew = Math.abs(Date.now() / 1000 - ts);
  if (!Number.isFinite(ts) || skew > MAX_SKEW_SECONDS) {
    console.warn('[captcha] stale webhook', { subId, timestamp, skew });
    return new NextResponse('stale', { status: 403 });
  }

  if (status !== 'success') {
    console.log('[captcha] webhook recorded non-success', { subId, status });
    return new NextResponse('OK', { status: 200 });
  }

  const economy = await getEconomy();

  const result = await creditFromAdslab({
    /* The timestamp is part of the key, so the same solve replayed inside the
       ten-minute window is still a duplicate rather than a second payout. */
    txid: `captcha:${subId}:${timestamp}`,
    uid: subId,
    source: 'captcha',
    status: 'completed',
    rawQuery: JSON.stringify(body),
    tokensOverride: economy.faucet.reward,
  });

  console.log('[captcha] webhook', { subId, status, result });
  return new NextResponse('OK', { status: 200 });
}