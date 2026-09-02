import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Creative approval' };

/* ============================================================================
   /admin/ads/queue — creative approval
   ----------------------------------------------------------------------------
   The review step between an advertiser submitting a creative and it going live.
   It reads `/adRequests`, which is also what the sidebar's `ads` badge counts — so
   the badge and this table can never disagree, which is the fastest way to teach
   staff to ignore a badge.

   Empty on a fresh install, and empty for as long as there is no advertiser
   submission flow. Network tags bypass this queue entirely: you paste those
   yourself under Inventory, and reviewing your own paste would be theatre.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AdQueuePage() {
  await requirePermission('ads.approve');

  const [rows, pending] = await Promise.all([
    listCatalogue('adRequests', 100),
    countWhere('adRequests', [['status', '==', 'pending']]),
  ]);

  return (
    <ScaffoldPage
      perm="ads.approve"
      title="Creative approval"
      sub="Submissions waiting on a decision before they can serve"
      kpis={[
        {
          label: 'Pending',
          value: nf(pending),
          sub: 'the number the sidebar badge shows',
          tone: pending ? 'danger' : 'success',
        },
        { label: 'All submissions', value: nf(rows.length), sub: 'documents in /adRequests' },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Submissions</CardTitle>
              <CardSub>Approve and reject are not wired — there is no decision route yet</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Ad creative submissions</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Advertiser</th>
                  <th scope="col">Placement</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">{String(row.fields['advertiser'] ?? '—')}</td>
                    <td className="font-mono text-12 text-text-3">
                      {String(row.fields['placement'] ?? '—')}
                    </td>
                    <td>
                      <Pill tone={row.fields['status'] === 'pending' ? 'warning' : 'neutral'}>
                        {String(row.fields['status'] ?? 'unknown')}
                      </Pill>
                    </td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Creative submissions"
          collection="/adRequests"
          how="A record appears when an advertiser submits a creative for review. Nothing does that yet, and network tags never enter this queue — those you paste yourself under Ads → Inventory."
        />
      )}
    </ScaffoldPage>
  );
}
