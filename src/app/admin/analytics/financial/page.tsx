import type { Metadata } from 'next';

import { compact, nf, usd } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getFinanceSummary } from '@/server/admin';
import { getDailySeries } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { RevenueChart } from '@/components/admin/RevenueChart';

export const metadata: Metadata = { title: 'Financial dashboard' };

/* ============================================================================
   /admin/analytics/financial — the money series
   ----------------------------------------------------------------------------
   The same two series as the command centre chart, over a longer window and with
   the totals stated: what was accrued to member balances, and what actually left as
   payouts. Those are the two halves of cost.

   THE MISSING THIRD SERIES IS REVENUE, AND IT IS MISSING ON PURPOSE. Ad networks
   report earnings in their own dashboards and nothing pushes those numbers here, so
   there is no margin figure on this screen. A margin computed from one measured
   number and one guessed one looks exactly like a real margin, which is what makes
   it dangerous.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function FinancialAnalyticsPage() {
  await requirePermission('analytics.view');

  const [finance, series] = await Promise.all([getFinanceSummary(), getDailySeries(30)]);

  const rows = series.map((row) => ({
    day: row.day,
    paidOutUsd: row.usdWithdrawn,
    accruedUsd: row.tokensCredited * finance.usdPerToken,
  }));

  const accruedUsd = rows.reduce((sum, r) => sum + r.accruedUsd, 0);
  const paidUsd = rows.reduce((sum, r) => sum + r.paidOutUsd, 0);
  const last7 = rows.slice(-7).reduce((sum, r) => sum + r.accruedUsd, 0);
  const prev7 = rows.slice(-14, -7).reduce((sum, r) => sum + r.accruedUsd, 0);
  const delta = prev7 ? ((last7 - prev7) / prev7) * 100 : null;
  const settleRate = accruedUsd ? (paidUsd / accruedUsd) * 100 : 0;

  return (
    <ScaffoldPage
      perm="analytics.view"
      title="Financial dashboard"
      sub="Accrued to balances against cash paid out, for the last 30 days"
      kpis={[
        {
          label: 'Accrued · 30d',
          value: usd(accruedUsd),
          ...(delta === null ? {} : { delta }),
          sub: 'tokens credited, at the current rate',
        },
        { label: 'Paid out · 30d', value: usd(paidUsd), sub: 'cash that left the platform' },
        {
          label: 'Settled share',
          value: `${settleRate.toFixed(1)}%`,
          sub: 'of what was accrued in the window',
        },
        {
          label: 'Unsettled, all time',
          value: usd(finance.liabilityUsd),
          sub: `${compact(finance.liabilityTokens)} tokens still on balances`,
        },
        {
          label: 'Queued now',
          value: usd(finance.pending.usd),
          sub: `${nf(finance.pending.count)} requests`,
        },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Accrued and paid, by day</CardTitle>
            <CardSub>Stacked · click a series in the legend to isolate it</CardSub>
          </div>
        </CardHead>
        <CardBody>
          <RevenueChart rows={rows} height={260} />
        </CardBody>
      </Card>

      <Alert tone="info">
        <strong>There is no revenue series and therefore no margin.</strong> Impressions are counted (Ads →
        Revenue) but what they earned is only in your network&apos;s reporting. Until a reporting import exists,
        margin has to be worked out against those dashboards by hand.
      </Alert>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Settled by rail</CardTitle>
              <CardSub>Last 500 completed payouts</CardSub>
            </div>
          </CardHead>
          {finance.byRail.length ? (
            <div className="w-full overflow-auto">
              <table className="vf-table">
                <caption className="sr-only">Completed payouts grouped by rail</caption>
                <thead>
                  <tr>
                    <th scope="col">Rail</th>
                    <th scope="col" className="th-num">
                      Payouts
                    </th>
                    <th scope="col" className="th-num">
                      Value
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...finance.byRail]
                    .sort((a, b) => b.usd - a.usd)
                    .map((row) => (
                      <tr key={row.rail}>
                        <td className="text-text-2">{row.rail}</td>
                        <td className="td-num tabular">{nf(row.count)}</td>
                        <td className="td-num tabular">{usd(row.usd)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardBody className="text-13 text-text-3">
              Nothing has settled yet, so there is no rail breakdown to show.
            </CardBody>
          )}
        </Card>

        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Settled by asset</CardTitle>
              <CardSub>Last 500 completed payouts</CardSub>
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
                  </tr>
                </thead>
                <tbody>
                  {[...finance.byCoin]
                    .sort((a, b) => b.usd - a.usd)
                    .map((row) => (
                      <tr key={row.coin}>
                        <td className="text-text-2">{row.coin}</td>
                        <td className="td-num tabular">{nf(row.count)}</td>
                        <td className="td-num tabular">{usd(row.usd)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <CardBody className="text-13 text-text-3">
              No completed withdrawals yet. The breakdown fills in as payouts settle.
            </CardBody>
          )}
        </Card>
      </div>
    </ScaffoldPage>
  );
}
