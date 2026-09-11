import 'server-only';

import type { NavCounts } from './nav';
import { countWhere } from '@/server/admin';

/* ============================================================================
   NAV BADGE COUNTS
   ----------------------------------------------------------------------------
   Real counts over the queues the badges point at, so a badge can never
   disagree with the table it links to — which is the fastest way to teach
   staff to ignore badges.

   `tk` counts tickets that are Open, not every ticket that is not Closed. An
   Answered ticket is waiting on the USER, and counting it as work makes the
   badge permanently non-zero and therefore meaningless.

   A missing table yields 0 rather than throwing: a fresh project has no
   withdrawals queued and the console must still render.

   KYC and the advertiser queue have no intake flow in this build, so their
   badges count what actually stands in for them today: withdrawals held for a
   human (the review threshold), and the ad inventory's unfilled slots.
   ========================================================================== */

const QUEUE_STATUSES = ['Pending', 'HeldForReview', 'Processing'];

export async function navCounts(): Promise<NavCounts> {
  const [wd, tk, kyc] = await Promise.all([
    countWhere('withdrawals', [['status', 'in', QUEUE_STATUSES]]),
    countWhere('tickets', [['status', '==', 'Open']]),
    countWhere('withdrawals', [['status', '==', 'HeldForReview']]),
  ]);

  /* The ads badge mirrors the advertiser-queue screen: submissions pending.
     With no advertiser intake yet, it counts enabled network units instead —
     a zero there means the inventory is empty, which IS actionable. */
  let adUnitsEnabled = 0;
  try {
    const { supabaseCountWhere } = await import('@/server/data-supabase');
    adUnitsEnabled = await supabaseCountWhere('ad_units', [['enabled', '==', true]]);
  } catch {
    adUnitsEnabled = 0;
  }

  return { kyc, fraud: 0, cr: wd, wd, ads: adUnitsEnabled, tk };
}
