import type { Metadata } from 'next';
import Link from 'next/link';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { listAdUnits } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Creative approval' };

/* ============================================================================
   /admin/ads/queue — creative approval
   ----------------------------------------------------------------------------
   There is no advertiser submission flow in this build — no intake, no
   adRequests table, nothing to approve. Network tags never enter a review
   queue either: you paste those yourself under Inventory, and reviewing your
   own paste would be theatre.

   So this screen cannot list submissions. What it shows instead is the one
   real pre-flight signal the inventory has: ad units that claim to be live
   but have no payload to serve — enabled without a tag or a src. Those rows
   render as dead inventory on member pages, which is exactly what a
   "needs a decision before it can serve" queue is for.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AdQueuePage() {
  await requirePermission('ads.approve');

  const units = await listAdUnits();
  const broken = units.filter((u) => u.enabled && !u.hasPayload);

  return (
    <ScaffoldPage
      perm="ads.approve"
      title="Creative approval"
      sub="Inventory that needs a decision before it can serve"
      kpis={[
        {
          label: 'Unfilled slots',
          value: nf(broken.length),
          sub: 'enabled units with nothing to serve',
          tone: broken.length ? 'danger' : 'success',
        },
        { label: 'Enabled units', value: nf(units.filter((u) => u.enabled).length), sub: 'in the ad_units table' },
        { label: 'Submissions', value: 'None', sub: 'no advertiser intake exists' },
      ]}
    >
      {broken.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Enabled but unfilled</CardTitle>
              <CardSub>
                These render as dead inventory on member pages — fix them on{' '}
                <Link href="/admin/ads/inventory" className="text-mint underline underline-offset-2">
                  Inventory
                </Link>
              </CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Ad units enabled without a creative payload</caption>
              <thead>
                <tr>
                  <th scope="col">Placement</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Network</th>
                  <th scope="col">Payload</th>
                  <th scope="col">Updated</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {broken.map((u) => (
                  <tr key={u.placement}>
                    <td className="font-mono text-12 text-text-2">{u.placement}</td>
                    <td className="text-text-3">{u.kind}</td>
                    <td className="text-text-3">{u.network}</td>
                    <td className="text-text-3">none</td>
                    <td className="text-text-3">{u.updatedAt ? relative(u.updatedAt) : '—'}</td>
                    <td>
                      <Pill tone="danger">unfilled</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Creative submissions"
          collection="ad_units"
          how="Nothing submits a creative for review — there is no advertiser intake, and network tags you paste yourself never enter a queue. Every enabled unit has a payload to serve, so there is nothing waiting on a decision."
        />
      )}
    </ScaffoldPage>
  );
}
