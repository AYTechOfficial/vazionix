import type { Metadata } from 'next';

import { compact, nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listUsers } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { CountryChip } from '@/components/ui/Avatar';

export const metadata: Metadata = { title: 'Geography' };

/* ============================================================================
   /admin/analytics/geo — where members are
   ----------------------------------------------------------------------------
   WHY THERE IS NO WORLD MAP OR TOP-COUNTRIES CHART
   Firestore cannot group by a field. A country breakdown is either one count()
   aggregate per country — 200 queries per page load — or a counter collection that
   nothing currently writes. Neither exists, so this screen does not draw a
   distribution.

   What it can do honestly is show the countries present in a sample of recent
   accounts, clearly labelled as a sample. That is enough to answer "is the traffic
   we just bought arriving from where we expected" without pretending to be a
   distribution over the whole base.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function GeoPage() {
  await requirePermission('analytics.view');

  const [page, members, unknown] = await Promise.all([
    listUsers({ limit: 100, sort: 'createdAt' }),
    countWhere('users'),
    countWhere('users', [['countryCode', '==', 'XX']]),
  ]);

  const counts = new Map<string, number>();
  for (const row of page.rows) counts.set(row.countryCode, (counts.get(row.countryCode) ?? 0) + 1);
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const sample = page.rows.length;

  return (
    <ScaffoldPage
      perm="analytics.view"
      title="Geography"
      sub={`Countries seen in the ${nf(sample)} most recent accounts`}
      kpis={[
        { label: 'Accounts', value: compact(members), sub: 'all time' },
        { label: 'Sample size', value: nf(sample), sub: 'newest accounts read for this page' },
        { label: 'Countries in sample', value: nf(ranked.length), sub: 'distinct codes' },
        {
          label: 'Unknown country',
          value: nf(unknown),
          sub: unknown ? 'accounts with no resolved country' : 'every account resolved',
          tone: unknown ? 'danger' : 'default',
        },
      ]}
    >
      {ranked.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Countries in the sample</CardTitle>
              <CardSub>
                A sample of the {nf(sample)} newest accounts — not a distribution over all {compact(members)}
              </CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Country codes present in the most recent accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Country</th>
                  <th scope="col" className="th-num">
                    Accounts in sample
                  </th>
                  <th scope="col" className="th-num">
                    Share of sample
                  </th>
                </tr>
              </thead>
              <tbody>
                {ranked.map(([code, count]) => (
                  <tr key={code}>
                    <td>
                      <CountryChip code={code} />
                    </td>
                    <td className="td-num tabular">{nf(count)}</td>
                    <td className="td-num tabular text-text-3">
                      {((count / Math.max(1, sample)) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <NotConfigured
        what="Country distribution over the whole base"
        collection="/stats/geo/{countryCode}"
        how="A real breakdown needs a counter document per country, bumped on registration — Firestore cannot group by a field, and one count() per country would be 200 queries a page load. Nothing writes those counters yet, so only the sample above is real."
      />
    </ScaffoldPage>
  );
}
