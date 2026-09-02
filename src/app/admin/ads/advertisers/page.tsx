import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Advertisers' };

/* ============================================================================
   /admin/ads/advertisers — direct advertiser accounts
   ----------------------------------------------------------------------------
   Separate from Inventory on purpose. Inventory is network inventory: you paste an
   Adsterra or AdsLab tag and the network fills it. This screen is for the other
   business — somebody paying you directly to run a campaign — which needs an
   account, a balance and an invoice trail.

   None of that exists yet: there is no advertiser signup, no billing, and no
   `/advertisers` collection. The screen reads the collection anyway, so the day a
   record appears it is listed here rather than requiring a code change.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AdvertisersPage() {
  await requirePermission('advertiser.manage');
  const rows = await listCatalogue('advertisers', 100);

  return (
    <ScaffoldPage
      perm="advertiser.manage"
      title="Advertisers"
      sub="Direct advertiser accounts, as distinct from network inventory"
      kpis={[
        { label: 'Accounts', value: nf(rows.length), sub: 'documents in /advertisers' },
        {
          label: 'Enabled',
          value: nf(rows.filter((r) => r.enabled).length),
          sub: 'may run a campaign',
        },
        { label: 'Billing', value: 'Not built', sub: 'no invoicing or balance ledger exists' },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Accounts</CardTitle>
              <CardSub>Raw documents — this screen has no editor yet</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Advertiser accounts</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Name</th>
                  <th scope="col">State</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">
                      {String(row.fields['name'] ?? row.fields['company'] ?? '—')}
                    </td>
                    <td className="text-text-3">{row.enabled ? 'enabled' : 'off'}</td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Advertiser accounts"
          collection="/advertisers"
          how="Nothing creates one yet — there is no advertiser signup or billing flow in this build. Network inventory is managed under Ads → Inventory instead, which is where the revenue currently comes from."
        />
      )}
    </ScaffoldPage>
  );
}
