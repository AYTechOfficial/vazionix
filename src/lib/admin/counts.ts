import 'server-only';

import type { NavCounts } from './nav';
import { countWhere } from '@/server/admin';

/* ============================================================================
   NAV BADGE COUNTS
   ----------------------------------------------------------------------------
   Real `count()` aggregates over the queues the badges point at, so a badge can
   never disagree with the table it links to — which is the fastest way to teach
   staff to ignore badges.

   `tk` counts tickets that are Open, not every ticket that is not Closed. An
   Answered ticket is waiting on the USER, and counting it as work makes the badge
   permanently non-zero and therefore meaningless.

   A missing collection yields 0 rather than throwing: a fresh project has no
   `kycRequests` and the console must still render.

   Cost: `count()` bills one read per 1000 documents matched, so six aggregates on
   every admin page render is cheap. A `.get()` to measure `.size` would bill every
   document in every queue.
   ========================================================================== */

const QUEUE_STATUSES = ['Pending', 'HeldForReview', 'Processing'];

export async function navCounts(): Promise<NavCounts> {
  const [wd, tk, kyc, fraud, cr, ads] = await Promise.all([
    countWhere('withdrawals', [['status', 'in', QUEUE_STATUSES]]),
    countWhere('tickets', [['status', '==', 'Open']]),
    countWhere('kycRequests', [['status', '==', 'pending']]),
    countWhere('fraudFlags', [['status', '==', 'review']]),
    countWhere('changeRequests', [['status', '==', 'pending']]),
    countWhere('adRequests', [['status', '==', 'pending']]),
  ]);

  return { kyc, fraud, cr, wd, ads, tk };
}
