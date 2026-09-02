import type { Metadata } from 'next';

import { compact, nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere } from '@/server/admin';
import { getPlatformStats } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/Progress';

export const metadata: Metadata = { title: 'Funnel' };

/* ============================================================================
   /admin/analytics/funnel — registration to first payout
   ----------------------------------------------------------------------------
   Four stages that are countable from documents that exist, and an honest gap
   where the interesting stages would be.

   WHAT IS COUNTABLE: accounts, verified emails, accounts that have withdrawn at
   least once (as a count of withdrawal documents, which over-counts repeat
   withdrawers), and accounts currently suspended.

   WHAT IS NOT: landing-page visits, registration starts, abandoned registrations,
   first-claim conversion. Every one of those is a page event, and this build records
   no analytics events — no `/events` collection, no third-party tag. Sending them
   somewhere is a decision with privacy consequences, so the gap is stated rather
   than filled with a plausible shape.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function FunnelPage() {
  await requirePermission('analytics.view');

  const [stats, members, verified, suspended, withdrawals, completed] = await Promise.all([
    getPlatformStats(),
    countWhere('users'),
    countWhere('users', [['emailVerified', '==', true]]),
    countWhere('users', [['suspended', '==', true]]),
    countWhere('withdrawals'),
    countWhere('withdrawals', [['status', '==', 'Completed']]),
  ]);

  const stages = [
    { label: 'Registered', value: members, note: 'documents in /users' },
    { label: 'Email verified', value: verified, note: 'required to withdraw by default' },
    {
      label: 'Requested a payout',
      value: withdrawals,
      note: 'withdrawal documents — repeat withdrawers count more than once',
    },
    { label: 'Payout completed', value: completed, note: 'status Completed' },
  ];

  const top = Math.max(1, members);

  return (
    <ScaffoldPage
      perm="analytics.view"
      title="Funnel"
      sub="Registration through to a settled payout, from document counts"
      kpis={[
        { label: 'Registered', value: compact(members), sub: 'all time' },
        {
          label: 'Verified',
          value: `${members ? ((verified / members) * 100).toFixed(1) : '0'}%`,
          sub: `${compact(verified)} accounts`,
        },
        {
          label: 'Reached a payout',
          value: `${members ? ((completed / members) * 100).toFixed(1) : '0'}%`,
          sub: `${compact(completed)} settled`,
        },
        {
          label: 'Suspended',
          value: compact(suspended),
          sub: 'removed from the funnel',
          tone: suspended ? 'danger' : 'default',
        },
        { label: 'Claims all time', value: compact(stats.claimsAllTime), sub: 'the activity between stages' },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Stages</CardTitle>
            <CardSub>Each bar is a share of registered accounts</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-col gap-4">
          {stages.map((stage) => (
            <div key={stage.label}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3">
                <span className="text-13 font-semibold text-text-2">{stage.label}</span>
                <span className="font-mono text-13 tabular">
                  {nf(stage.value)}
                  <span className="ml-2 text-11 text-text-3">
                    {((stage.value / top) * 100).toFixed(1)}%
                  </span>
                </span>
              </div>
              <ProgressBar value={stage.value} max={top} label={`${stage.label}: ${stage.value}`} />
              <p className="mt-1 text-11 text-text-3">{stage.note}</p>
            </div>
          ))}
        </CardBody>
      </Card>

      <NotConfigured
        what="Pre-registration funnel stages"
        collection="/events"
        how="Landing views, registration starts and abandonment need page events, and this build emits none — there is no events collection and no analytics tag. Adding one is a privacy decision as much as a technical one, so nothing here estimates those stages."
      />
    </ScaffoldPage>
  );
}
