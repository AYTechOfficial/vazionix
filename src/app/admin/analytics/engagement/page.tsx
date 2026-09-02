import type { Metadata } from 'next';

import { compact, nf, shortDate } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere } from '@/server/admin';
import { getDailySeries, getPlatformStats } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Engagement' };

/* ============================================================================
   /admin/analytics/engagement — activity per day, per surface
   ----------------------------------------------------------------------------
   Everything here is a counter incremented inside the transaction that earned it,
   so the columns reconcile with the ledger by construction.

   THERE IS NO DAU, RETENTION CURVE OR COHORT TABLE
   Those need a per-member activity log — one row per member per day — and this
   build records only `lastSeenAt` on the user document plus platform-wide daily
   totals. "Online now" is a real count() over `lastSeenAt`; a 30-day retention
   curve would be a shape drawn from nothing. New members per day is the closest
   honest proxy and it is the first column below.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function EngagementPage() {
  await requirePermission('analytics.view');

  const [series, stats, members] = await Promise.all([
    getDailySeries(30),
    getPlatformStats(),
    countWhere('users'),
  ]);

  const claims = series.reduce((sum, r) => sum + r.claims, 0);
  const ptc = series.reduce((sum, r) => sum + r.ptcViews, 0);
  const links = series.reduce((sum, r) => sum + r.shortlinkClaims, 0);
  const offers = series.reduce((sum, r) => sum + r.offerwallConversions, 0);
  const joined = series.reduce((sum, r) => sum + r.members, 0);

  return (
    <ScaffoldPage
      perm="analytics.view"
      title="Engagement"
      sub="Counters per day, by earning surface. Thirty-day window."
      kpis={[
        { label: 'Online now', value: nf(stats.onlineNow), sub: 'seen in the last five minutes' },
        { label: 'Members', value: compact(members), sub: `${nf(joined)} joined in the window` },
        { label: 'Claims · 30d', value: compact(claims), sub: 'all sources combined' },
        { label: 'PTC views · 30d', value: compact(ptc), sub: 'completed views' },
        { label: 'Shortlinks · 30d', value: compact(links), sub: 'completed visits' },
        { label: 'Offerwall · 30d', value: compact(offers), sub: 'credited conversions' },
      ]}
    >
      <Alert tone="info">
        <strong>No retention or cohort analysis on this screen.</strong> That needs a per-member daily activity
        record, which this build does not write — only <code className="font-mono text-12">lastSeenAt</code> per
        account and these platform totals. New members per day is the honest proxy.
      </Alert>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Activity by day</CardTitle>
            <CardSub>
              From <code className="font-mono">/stats/daily/days</code> — newest first
            </CardSub>
          </div>
        </CardHead>
        {series.length ? (
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Daily engagement counters by earning surface</caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col" className="th-num">
                    New members
                  </th>
                  <th scope="col" className="th-num">
                    Claims
                  </th>
                  <th scope="col" className="th-num">
                    PTC
                  </th>
                  <th scope="col" className="th-num">
                    Shortlinks
                  </th>
                  <th scope="col" className="th-num">
                    Offerwall
                  </th>
                  <th scope="col" className="th-num">
                    Ad impressions
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((row) => (
                  <tr key={row.day}>
                    <td className="text-text-2">{shortDate(row.day)}</td>
                    <td className="td-num tabular">{nf(row.members)}</td>
                    <td className="td-num tabular">{nf(row.claims)}</td>
                    <td className="td-num tabular text-text-3">{nf(row.ptcViews)}</td>
                    <td className="td-num tabular text-text-3">{nf(row.shortlinkClaims)}</td>
                    <td className="td-num tabular text-text-3">{nf(row.offerwallConversions)}</td>
                    <td className="td-num tabular text-text-3">{nf(row.adImpressions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody className="text-13 leading-body text-text-3">
            No daily counters yet. <code className="font-mono">/stats/daily/days</code> gets its first document
            on the first claim, view or impression.
          </CardBody>
        )}
      </Card>
    </ScaffoldPage>
  );
}
