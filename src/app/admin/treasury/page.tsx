import type { Metadata } from 'next';

import { compact, nf, usd } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getFinanceSummary } from '@/server/admin';
import { getLiabilityUsd } from '@/server/stats';
import { railStatus } from '@/server/payouts';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Treasury' };

/* ============================================================================
   /admin/treasury — what is owed, what is queued, what has gone out
   ----------------------------------------------------------------------------
   Three numbers this codebase can actually prove:

     LIABILITY  tokensCredited − tokensWithdrawn, priced at the current rate. What
                members could withdraw if they all withdrew today.
     QUEUED     the USD value of everything in the withdrawal queue right now.
     PAID       the lifetime usdWithdrawn counter.

   WHAT IS DELIBERATELY ABSENT: RESERVES AND COVERAGE
   A coverage ratio needs the balance on hand at FaucetPay, CWallet and each hot
   wallet. Nothing in this build reads a provider balance — there is no balance
   endpoint wired for either rail and no chain indexer. So this screen does not show
   a reserve, a coverage multiple or an "under-reserved" warning, because all three
   would be arithmetic over a number nobody measured. Check the provider dashboards
   for what is on hand and compare it against Queued below.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function TreasuryPage() {
  await requirePermission('treasury.view');

  const [finance, liability] = await Promise.all([getFinanceSummary(), getLiabilityUsd()]);
  const rails = railStatus();

  const settledSample = finance.byRail.reduce((sum, r) => sum + r.count, 0);

  return (
    <ScaffoldPage
      perm="treasury.view"
      title="Treasury"
      sub={`${usd(liability.usd)} owed to members · ${usd(finance.pending.usd)} queued to send`}
      kpis={[
        {
          label: 'Owed to members',
          value: usd(liability.usd),
          sub: `${compact(liability.tokens)} tokens outstanding`,
        },
        {
          label: 'Queued to send',
          value: usd(finance.pending.usd),
          sub: `${nf(finance.pending.count)} requests · ${compact(finance.pending.tokens)} tokens locked`,
          tone: finance.pending.count ? 'danger' : 'default',
        },
        { label: 'Paid out, all time', value: usd(finance.paidOutUsd), sub: 'lifetime counter' },
        {
          label: 'Token rate',
          value: `$${finance.usdPerToken.toFixed(8)}`,
          sub: 'the rate every figure here uses',
        },
        {
          label: 'Reserves on hand',
          value: 'Not measured',
          sub: 'no provider balance API is wired',
        },
      ]}
    >
      <Alert tone="info">
        <strong>Coverage is not computed here.</strong> It would need the live balance at each rail, and
        nothing in this build reads one. Compare <strong>{usd(finance.pending.usd)} queued</strong> against
        what the FaucetPay and CWallet dashboards say you hold before approving a batch.
      </Alert>

      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(rails).map(([rail, state]) => (
          <Card key={rail} as="section" pad="md">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{rail}</CardTitle>
              <Pill tone={state.automated ? (state.configured ? 'success' : 'danger') : 'info'}>
                {state.automated ? (state.configured ? 'ready' : 'no key') : 'manual'}
              </Pill>
            </div>
            <p className="mt-2 text-12 text-text-3">
              {(() => {
                const entry = finance.byRail.find((r) => r.rail === rail);
                return entry
                  ? `${usd(entry.usd)} settled across ${nf(entry.count)} completed payouts in the sample`
                  : 'Nothing settled through this rail yet';
              })()}
            </p>
          </Card>
        ))}
      </div>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Settled payouts by asset</CardTitle>
            <CardSub>
              Last 500 completed withdrawals · {nf(settledSample)} rows in this sample
            </CardSub>
          </div>
        </CardHead>
        {finance.byCoin.length ? (
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Completed payouts grouped by asset</caption>
              <thead>
                <tr>
                  <th scope="col">Asset</th>
                  <th scope="col" className="th-num">
                    Payouts
                  </th>
                  <th scope="col" className="th-num">
                    Value
                  </th>
                  <th scope="col" className="th-num">
                    Average
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...finance.byCoin]
                  .sort((a, b) => b.usd - a.usd)
                  .map((row) => (
                    <tr key={row.coin}>
                      <td className="font-semibold text-text">{row.coin}</td>
                      <td className="td-num tabular">{nf(row.count)}</td>
                      <td className="td-num tabular">{usd(row.usd)}</td>
                      <td className="td-num tabular text-text-3">
                        {row.count ? usd(row.usd / row.count) : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody>
            <NotConfigured
              what="Settled payouts"
              collection="/withdrawals where status == Completed"
              how="The first row appears when a withdrawal completes — either an automated rail confirming a send, or an operator recording a txid for a Direct payout."
            />
          </CardBody>
        )}
      </Card>
    </ScaffoldPage>
  );
}
