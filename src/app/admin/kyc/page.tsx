import type { Metadata } from 'next';

import { nf, relative, usd } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue } from '@/server/admin';
import { getEconomy } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'KYC review' };

/* ============================================================================
   /admin/kyc — identity verification
   ----------------------------------------------------------------------------
   Reads `/kycRequests`, the same collection the sidebar's KYC badge counts.

   THERE IS NO KYC FLOW IN THIS BUILD, AND THE REASON MATTERS
   Identity verification means accepting government documents, which means a
   retention policy, a lawful basis, a deletion path and a processor agreement before
   a single upload. None of that is in place, so nothing collects documents and this
   queue is empty by design rather than by omission.

   What stands in for it today is the withdrawal review threshold: requests above it
   are held for a human instead of sending automatically. That is a proportionate
   control for faucet-sized payouts, and it is shown below so this screen is not read
   as "nothing is checked".
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function KycPage() {
  await requirePermission('kyc.review');

  const [rows, pending, economy, held] = await Promise.all([
    listCatalogue('kycRequests', 100),
    countWhere('kycRequests', [['status', '==', 'pending']]),
    getEconomy(),
    countWhere('withdrawals', [['status', '==', 'HeldForReview']]),
  ]);

  return (
    <ScaffoldPage
      perm="kyc.review"
      title="KYC review"
      sub="Identity verification queue — not collected in this build"
      kpis={[
        {
          label: 'Pending',
          value: nf(pending),
          sub: 'the number the sidebar badge shows',
          tone: pending ? 'danger' : 'default',
        },
        { label: 'All submissions', value: nf(rows.length), sub: 'documents in /kycRequests' },
        {
          label: 'Review threshold',
          value: usd(economy.withdraw.reviewThresholdUsd),
          sub: 'the control actually in force',
        },
        {
          label: 'Held for review',
          value: nf(held),
          sub: 'withdrawals waiting on a human',
          tone: held ? 'danger' : 'success',
        },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Submissions</CardTitle>
              <CardSub>Read-only — no decision route exists</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">KYC submissions</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Member</th>
                  <th scope="col">Tier</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">{String(row.fields['username'] ?? row.fields['uid'] ?? '—')}</td>
                    <td className="text-text-3">{String(row.fields['tier'] ?? '—')}</td>
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
          what="KYC submissions"
          collection="/kycRequests"
          how="Nothing writes this collection. Accepting identity documents needs a retention policy, a lawful basis and a processor agreement in place first, so no upload path exists — the queue is empty by design."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>What is checked instead</CardTitle>
            <CardSub>The controls that exist today</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            Withdrawals above {usd(economy.withdraw.reviewThresholdUsd)} are held for a human decision. A first
            withdrawal also needs an account{' '}
            {economy.withdraw.minAccountAgeHours} hours old
            {economy.withdraw.requireEmailVerified ? ' and a verified email address' : ''}. Those are edited on
            the Limits screen.
          </p>
          <p className="mt-2">
            For faucet-sized payouts that is usually the proportionate control. Identity documents raise the
            stakes on a data breach considerably, and collecting them without the surrounding policy would trade
            a small fraud risk for a large compliance one.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
