import type { ClaimSource } from '@/lib/models';

import { handler, ok } from '@/server/http';
import { requireUser } from '@/server/session';
import { listLedger } from '@/server/ledger';

/* ============================================================================
   GET /api/transactions?cursor=&limit=&source=
   ----------------------------------------------------------------------------
   Cursor-paged ledger. The cursor is the last row's ISO timestamp rather than an
   offset, because Firestore bills `offset(n)` as n reads — paging deep into a
   ledger with offsets costs the whole ledger.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SOURCES = new Set<ClaimSource>([
  'faucet', 'ptc', 'shortlink', 'offerwall', 'bonus', 'challenge',
  'referral', 'coupon', 'lottery', 'adjustment', 'withdrawal', 'refund',
]);

export const GET = handler(async (ctx) => {
  const claims = await requireUser();

  const rawSource = ctx.query('source');
  const source = rawSource && SOURCES.has(rawSource as ClaimSource) ? (rawSource as ClaimSource) : undefined;

  const page = await listLedger(claims.uid, {
    limit: Number(ctx.query('limit') ?? 25),
    cursor: ctx.query('cursor'),
    ...(source ? { source } : {}),
  });

  return ok(page);
});
