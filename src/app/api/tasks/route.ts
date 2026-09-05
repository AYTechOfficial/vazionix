import { NextResponse } from 'next/server';

import { ADSLAB_PLACEMENTS, ADSLAB_TASK_TYPES, type AdslabTaskType } from '@/lib/adslab/config';
import { ADSLAB_SERVER, adslabServerReady } from '@/server/adslab';
import { badRequest } from '@/server/db';
import { handler, ok } from '@/server/http';
import { requireUser } from '@/server/session';

/* ============================================================================
   GET /api/tasks?type=…   —  AdsLab offerwall proxy
   ----------------------------------------------------------------------------
   WHY THIS IS A PROXY AND NOT A CLIENT FETCH
   AdsLab's task endpoint embeds the Publisher API Key IN THE URL PATH. Fetching
   it from the browser would publish the key to every visitor's devtools, and that
   key can read the whole account. So the browser calls us, and we call them.

   `type` is validated against a fixed allow-list rather than forwarded. Without
   that check this route would be an open proxy: anyone could make our server
   fetch an arbitrary adslab.me path with our key attached.

   THE TRACKING URL IS PASSED THROUGH UNTOUCHED
   `task.url` carries the conversion attribution. Rewriting, proxying, or
   appending to it breaks the postback, so the response is normalised in SHAPE
   only — no field on a task is modified.

   Wrapped in `handler()` so an unauthenticated call is a clean 401 from
   `requireUser()` rather than an unhandled 500.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (ctx) => {
  const claims = await requireUser();

  if (!adslabServerReady || !ADSLAB_PLACEMENTS.task) {
    return NextResponse.json(
      { ok: false, error: 'Tasks are not configured.', code: 'unconfigured', tasks: [] },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const requested = ctx.query('type') ?? 'all';
  if (!(ADSLAB_TASK_TYPES as readonly string[]).includes(requested)) {
    throw badRequest('Unknown task type.', 'bad_type');
  }
  const type = requested as AdslabTaskType;

  const ip = ctx.ip ?? '127.0.0.1';
  const country = (
    ctx.request.headers.get('cf-ipcountry') ??
    ctx.request.headers.get('x-vercel-ip-country') ??
    'US'
  )
    .toUpperCase()
    .slice(0, 2);
  const userAgent = ctx.userAgent ?? '';

  const url =
    `https://adslab.me/api/tasks-share/${ADSLAB_PLACEMENTS.task}/${ADSLAB_SERVER.apiKey}` +
    `/${country}/${encodeURIComponent(claims.uid)}/${ip}/${type}`;

  try {
    const response = await fetch(url, {
      headers: userAgent ? { 'User-Agent': userAgent } : undefined,
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    });

    if (!response.ok) {
      console.error('[adslab] tasks upstream failed', { status: response.status, type });
      return NextResponse.json(
        { ok: false, error: 'Task provider is unavailable.', code: 'upstream', tasks: [] },
        { status: 502, headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const data = (await response.json().catch(() => null)) as unknown;

    /* Offers return a BARE ARRAY; every other category wraps in
       { success, count, tasks }. Both shapes are real — normalise, do not assume. */
    const tasks = Array.isArray(data)
      ? data
      : ((data as { tasks?: unknown[] } | null)?.tasks ?? []);

    return ok({ ok: true, type, count: tasks.length, tasks });
  } catch (error) {
    console.error('[adslab] tasks proxy threw', error);
    return NextResponse.json(
      { ok: false, error: 'Task provider is unreachable.', code: 'unreachable', tasks: [] },
      { status: 502, headers: { 'Cache-Control': 'no-store' } },
    );
  }
});