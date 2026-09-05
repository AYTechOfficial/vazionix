import { NextResponse } from 'next/server';

import { brand } from '@/lib/brand';
import { ADSLAB_SERVER, adslabServerReady } from '@/server/adslab';
import { getFaucetState } from '@/server/earn/faucet';
import { handler, ok } from '@/server/http';
import { requireUser } from '@/server/session';

/* ============================================================================
   POST /api/captcha/init   —  open an AdsLab captcha session
   ----------------------------------------------------------------------------
   AdsLab's captcha is a REDIRECT flow, not a widget: we ask their API for a
   token, send the user to solve it on adslab.me, and the reward arrives later on
   the signed webhook at /api/captcha/postback. The solve is what pays us, so the
   anti-abuse control and the monetisation are the same action.

   THE COOLDOWN IS CHECKED HERE, BEFORE A SESSION IS SPENT
   Without this a user on cooldown could burn captcha sessions that can never be
   credited — wasted AdsLab inventory and a dead end for them. The gate reads the
   same server-side faucet state the claim itself uses, so the two cannot disagree.

   AUTHENTICATED, unlike the postbacks: the caller here IS the signed-in user, and
   `sub_id` must be their canonical id or the conversion cannot be attributed.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADSLAB_CAPTCHA_INIT = 'https://adslab.me/api/v1/captcha/init';

export const POST = handler(async () => {
  const claims = await requireUser();

  if (!adslabServerReady) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Captcha is not configured. Set ADSLAB_API_KEY and ADSLAB_SECRET_KEY.',
        code: 'unconfigured',
      },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  /* Refuse while cooling down, so a session is never spent on a claim that would
     be rejected anyway. */
  const state = await getFaucetState(claims.uid);
  if (state.secondsRemaining > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Faucet is cooling down. ${Math.ceil(state.secondsRemaining / 60)} minute(s) to go.`,
        code: 'cooldown',
        secondsRemaining: state.secondsRemaining,
      },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }
  if (state.claimsToday >= state.dailyCap) {
    return NextResponse.json(
      {
        ok: false,
        error: `Daily limit reached (${state.dailyCap}). It resets at 00:00 UTC.`,
        code: 'daily_cap',
      },
      { status: 429, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  try {
    const response = await fetch(ADSLAB_CAPTCHA_INIT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ADSLAB_SERVER.apiKey },
      body: JSON.stringify({
        sub_id: claims.uid,
        return_url: `${brand.url}/faucet?captcha=done`,
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });

    const data = (await response.json().catch(() => null)) as
      | { success?: boolean; token?: string; solve_url?: string }
      | null;

    if (!response.ok || !data?.success || !data.token) {
      console.error('[captcha] adslab init failed', { status: response.status, data });
      return NextResponse.json(
        { ok: false, error: 'Could not open a captcha session. Try again.', code: 'init_failed' },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return ok({ ok: true, token: data.token, solveUrl: data.solve_url ?? null });
  } catch (error) {
    console.error('[captcha] adslab init threw', error);
    return NextResponse.json(
      { ok: false, error: 'Captcha service unreachable. Try again in a moment.', code: 'unreachable' },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
});