import type { Metadata } from 'next';
import Link from 'next/link';

import { nf, relative, tokens, usd } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listWithdrawalQueue } from '@/server/admin';
import { getEconomy } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Review queue' };

/* ============================================================================
   /admin/kyc — the review queue that actually gates money
   ----------------------------------------------------------------------------
   This screen used to read a /kycRequests collection that nothing ever wrote.
   Identity verification is not built, and building it means accepting government
   documents — a retention policy, a lawful basis, a deletion path — none of
   which exist. A queue for it would be permanent theatre.

   What actually stands in for KYC in this build is the withdrawal review
   threshold: a request above it is held for a human instead of sent
   automatically. So THIS screen shows that held queue — the same rows the
   sidebar badge counts and the payouts screen acts on — read-only, with the
   decision itself left on /admin/payouts where approve and reject live.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function KycPage() {
  await requirePermission('kyc.review');

  const [held, pendingCount, economy] = await Promise.all([
    listWithdrawalQueue({ status: 'HeldForReview', limit: 25 }),
    countWhere('withdrawals', [['status', '==', 'HeldForReview']]),
    getEconomy(),
  ]);

  const heldUsd = held.rows.reduce((sum, row) => sum + row.usdValue, 0);

  return (
    <ScaffoldPage
      perm="kyc.review"
      title="Review queue"
      sub="Withdrawals held for a human decision before they can send"
      kpis={[
        {
          label: 'Held',
          value: nf(held.total),
          sub: 'the number the sidebar badge shows',
          tone: held.total ? 'danger' : 'success',
        },
        { label: 'Value held', value: usd(heldUsd), sub: 'in this view' },
        {
          label: 'Review threshold',
          value: usd(economy.withdraw.reviewThresholdUsd),
          sub: 'above this a request is held automatically',
        },
        {
          label: 'Also waiting',
          value: nf(pendingCount - held.rows.length),
          sub: 'held rows beyond the first 25',
        },
      ]}
    >
      {held.rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Held for review</CardTitle>
              <CardSub>
                Read-only here — approve, reject and record-txid live on{' '}
                <Link href="/admin/payouts?status=HeldForReview" className="text-mint underline underline-offset-2">
                  Withdrawal queue
                </Link>
              </CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Withdrawals held for review</caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Coin</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Value</th>
                  <th scope="col">Token cost</th>
                  <th scope="col">Address</th>
                  <th scope="col">Held since</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {held.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="text-text-2">
                      {row.username}
                      <span className="ml-2 font-mono text-11 text-text-3">{row.countryCode}</span>
                    </td>
                    <td className="font-mono text-12 text-text-3">{row.coin}</td>
                    <td className="td-num tabular text-text-2">{row.amount}</td>
                    <td className="td-num tabular text-text-3">{usd(row.usdValue)}</td>
                    <td className="td-num tabular text-text-3">{tokens(row.tokenCost)}</td>
                    <td className="max-w-[220px] truncate font-mono text-12 text-text-3">{row.address}</td>
                    <td className="text-text-3">{relative(row.at)}</td>
                    <td>
                      <Pill tone="warning">Held</Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Nothing held</CardTitle>
              <CardSub>No withdrawal is waiting on a human</CardSub>
            </div>
          </CardHead>
          <CardBody className="text-13 leading-body text-text-3">
            Requests above the review threshold land here automatically — the queue is empty because nothing has
            crossed it. The threshold itself is edited on the Limits screen.
          </CardBody>
        </Card>
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>What this queue is</CardTitle>
            <CardSub>The control that exists, not the one this URL implies</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            There is no identity-document flow in this build: accepting government documents needs a retention
            policy, a lawful basis and a processor agreement before a single upload, and none exist. What stands
            in for KYC is the review threshold — withdrawals above{' '}
            {usd(economy.withdraw.reviewThresholdUsd)} are held here automatically, a first withdrawal needs an
            account {economy.withdraw.minAccountAgeHours} hours old
            {economy.withdraw.requireEmailVerified ? ' and a verified email' : ''}, and the decision is made on
            the withdrawal queue.
          </p>
          <p className="mt-2">
            For faucet-sized payouts that is the proportionate control. Identity documents raise the stakes on a
            data breach considerably, and collecting them without the surrounding policy would trade a small
            fraud risk for a large compliance one.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
