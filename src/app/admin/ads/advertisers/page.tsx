import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { listAdUnits } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Advertisers' };

/* ============================================================================
   /admin/ads/advertisers — direct advertiser accounts
   ----------------------------------------------------------------------------
   Separate from Inventory on purpose. Inventory is network inventory: you paste
   an Adsterra or AdsLab tag and the network fills it. This screen is for the
   other business — somebody paying you directly to run a campaign — which needs
   an account, a balance and an invoice trail.

   None of that exists: there is no advertiser signup, no billing, no
   advertisers table. The screen keeps its honest empty state for the day that
   changes, and meanwhile shows the network inventory it is NOT — so a visitor
   lands here once, understands the split, and works in the right place.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AdvertisersPage() {
  await requirePermission('advertiser.manage');
  const units = await listAdUnits();

  const networks = new Set(units.map((u) => u.network).filter(Boolean));

  return (
    <ScaffoldPage
      perm="advertiser.manage"
      title="Advertisers"
      sub="Direct advertiser accounts, as distinct from network inventory"
      kpis={[
        { label: 'Direct accounts', value: 'Not built', sub: 'no signup, billing or ledger exists' },
        { label: 'Network units', value: nf(units.length), sub: 'the inventory that exists today' },
        { label: 'Networks in play', value: nf(networks.size), sub: 'distinct network names on units' },
      ]}
    >
      <NotConfigured
        what="Advertiser accounts"
        collection="advertisers"
        how="Nothing creates one yet — there is no advertiser signup or billing flow in this build. When direct sales start, this screen gets an intake form and a balance ledger. Until then, the revenue comes from the network units managed under Ads → Inventory."
      />

      {units.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Network inventory today</CardTitle>
              <CardSub>What the site actually serves — context, not a second editor</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Network ad units currently configured</caption>
              <thead>
                <tr>
                  <th scope="col">Placement</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Network</th>
                  <th scope="col">State</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {units.map((u) => (
                  <tr key={u.placement}>
                    <td className="font-mono text-12 text-text-2">{u.placement}</td>
                    <td className="text-text-3">{u.kind}</td>
                    <td className="text-text-3">{u.network}</td>
                    <td className="text-text-3">{u.enabled ? 'enabled' : 'off'}</td>
                    <td className="text-text-3">{u.updatedAt ? relative(u.updatedAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </ScaffoldPage>
  );
}
