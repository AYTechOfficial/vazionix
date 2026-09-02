import { handler, ok } from '@/server/http';
import { getPlatformStats, getPayoutTicker } from '@/server/stats';

/* ============================================================================
   GET /api/stats
   ----------------------------------------------------------------------------
   Public, unauthenticated, and cached for a minute. This is what the landing
   page's live counters poll, and what any external status page can read.

   Cached rather than no-store: these are aggregate counters, identical for every
   visitor, and a homepage that issues a fresh Firestore read per visitor is the
   first thing to fall over under a traffic spike.
   ========================================================================== */

export const runtime = 'nodejs';
export const revalidate = 60;

export const GET = handler(async () => {
  const [stats, ticker] = await Promise.all([getPlatformStats(), getPayoutTicker(12)]);
  return ok({ stats, ticker });
});
