import { NextResponse, type NextRequest } from 'next/server';

import {
  creditFromAdslab,
  sourceForPlacement,
  verifyPostbackSignature,
} from '@/server/adslab';

/* ============================================================================
   GET /api/adslab/postback   —  the money endpoint
   ----------------------------------------------------------------------------
   Configure in AdsLab → Website Settings → Postback URL, BASE ONLY:

       https://vazionixfaucet.vercel.app/api/adslab/postback

   Do not append query parameters there; AdsLab adds them.

   UNAUTHENTICATED, AND THAT IS CORRECT
   The caller is AdsLab's server, not a signed-in user, so there is no session to
   check. The SIGNATURE is the authentication: sha256("<txid>-<key>") compared in
   constant time. An unsigned or wrongly-signed request is refused with 403 and
   credits nothing.

   THE 200 CONTRACT
   Any request with a VALID signature gets 200 "ok" — including duplicates, an
   unknown uid, and a zero payout. AdsLab retries a non-200 indefinitely, and a
   retry storm against a money endpoint is how double-credits happen. The only
   403 is a bad signature; the only 400 is missing parameters.

   Node runtime because signature verification needs `crypto`, and
   force-dynamic because a cached postback response would be a silent no-op.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams;

  const uid = q.get('uid') ?? '';
  const pid = q.get('pid') ?? '';
  const txid = q.get('txid') ?? '';
  const signature = q.get('signature') ?? '';
  const reward = Number.parseFloat(q.get('reward') ?? '0') || 0;
  const type = q.get('type') ?? '';
  const status = (q.get('status') ?? 'completed').toLowerCase();
  const ip = q.get('ip') ?? '';
  const country = q.get('country') ?? '';
  const name = q.get('name') ?? '';

  if (!uid || !txid || !signature) {
    return new NextResponse('missing params', { status: 400 });
  }

  const { valid, which } = verifyPostbackSignature(txid, signature);
  if (!valid) {
    console.warn('[adslab] invalid signature', { uid, pid, txid });
    return new NextResponse('invalid signature', { status: 403 });
  }

  const source = sourceForPlacement(pid);

  const result = await creditFromAdslab({
    txid,
    uid,
    placementId: pid || undefined,
    source,
    taskType: type || null,
    rewardUsd: reward,
    status,
    campaignName: name || null,
    ip: ip || null,
    country: country || null,
    rawQuery: request.nextUrl.search,
    signedWith: which,
  });

  console.log('[adslab] postback', { uid, pid, txid, source, status, reward, result, signedWith: which });

  return new NextResponse('ok', { status: 200 });
}

/** Some networks are configured with POST by mistake. Accept it rather than
    silently dropping conversions, and route it through the same verification. */
export async function POST(request: NextRequest) {
  return GET(request);
}