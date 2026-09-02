import type { Metadata } from 'next';

import { compact, nf, shortDate, usd } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getFinanceSummary } from '@/server/admin';
import { getDailySeries } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Accounting' };

/* ============================================================================
   /admin/accounting — the numbers you would hand an accountant
   ----------------------------------------------------------------------------
   Two sides, and only one of them is knowable from inside this system.

   THE COST SIDE IS EXACT. Tokens credited per day, priced at the current rate, is
   an accrual: the liability created that day. Tokens withdrawn per day, in USD, is
   the cash that left. Both come from counters incremented inside the same
   transaction as the thing they count.

   THE REVENUE SIDE IS NOT HERE. Ad networks pay against their own reporting and
   nothing pushes those figures into this database, so there is no revenue column, no
   margin and no profit line. An accounting screen that invented one would be worse
   than useless — it would be citable.

   The accrual uses TODAY's token rate for every historical day, which is wrong for
   any day the rate differed. Nothing records the rate per day, so the alternative
   is to show nothing; the caveat is stated rather than buried.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AccountingPage() {
  await requirePermission('accounting.export');

  const [finance, series] = await Promise.all([getFinanceSummary(), getDailySeries(30)]);

  const accrued = series.reduce((sum, row) => sum + row.tokensCredited, 0);
  const accruedUsd = accrued * finance.usdPerToken;
  const paidUsd = series.reduce((sum, row) => sum + row.usdWithdrawn, 0);
  const withdrawals = series.reduce((sum, row) => sum + row.withdrawals, 0);

  return (
    <ScaffoldPage
      perm="accounting.export"
      title="Accounting"
      sub="Cost and cash movements for the last 30 days. Revenue lives in your ad networks' reports."
      kpis={[
        {
          label: 'Accrued · 30d',
          value: usd(accruedUsd),
          sub: `${compact(accrued)} tokens credited to members`,
        },
        { label: 'Cash out · 30d', value: usd(paidUsd), sub: `${nf(withdrawals)} withdrawals settled` },
        {
          label: 'Unsettled accrual',
          value: usd(finance.liabilityUsd),
          sub: 'earned but not yet withdrawn, all time',
        },
        { label: 'Queued', value: usd(finance.pending.usd), sub: 'committed, not yet sent' },
        {
          label: 'Revenue',
          value: 'Not recorded',
          sub: 'no network reporting is ingested',
        },
      ]}
    >
      <Alert tone="warning">
        <strong>Historical accruals are priced at today&apos;s token rate</strong> (
        ${finance.usdPerToken.toFixed(8)}), because no per-day rate is stored. If the rate has changed inside
        this window, the daily USD accrual below is indicative and the token column is the exact figure.
      </Alert>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Daily movements</CardTitle>
            <CardSub>
              From <code className="font-mono">/stats/daily/days</code> — newest first
            </CardSub>
          </div>
        </CardHead>
        {series.length ? (
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">
                Daily tokens credited, accrual in USD, withdrawals settled and cash paid out
              </caption>
              <thead>
                <tr>
                  <th scope="col">Day</th>
                  <th scope="col" className="th-num">
                    Tokens credited
                  </th>
                  <th scope="col" className="th-num">
                    Accrual
                  </th>
                  <th scope="col" className="th-num">
                    Withdrawals
                  </th>
                  <th scope="col" className="th-num">
                    Cash out
                  </th>
                  <th scope="col" className="th-num">
                    New members
                  </th>
                </tr>
              </thead>
              <tbody>
                {[...series].reverse().map((row) => (
                  <tr key={row.day}>
                    <td className="text-text-2">{shortDate(row.day)}</td>
                    <td className="td-num tabular">{nf(row.tokensCredited)}</td>
                    <td className="td-num tabular text-text-3">
                      {usd(row.tokensCredited * finance.usdPerToken)}
                    </td>
                    <td className="td-num tabular">{nf(row.withdrawals)}</td>
                    <td className="td-num tabular">{usd(row.usdWithdrawn)}</td>
                    <td className="td-num tabular text-text-3">{nf(row.members)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody className="text-13 leading-body text-text-3">
            No daily counters yet. <code className="font-mono">/stats/daily/days</code> gets its first document
            on the first credit or the first payout.
          </CardBody>
        )}
      </Card>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Exporting</CardTitle>
            <CardSub>
              Held by <code className="font-mono">accounting.export</code>
            </CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            There is no export endpoint in this build. The two sources an accountant needs are already
            queryable directly: <code className="font-mono text-12">/withdrawals</code> for cash movements
            with a txid per row, and <code className="font-mono text-12">/stats/daily/days</code> for the
            accrual series above. Both export cleanly from the Firebase console or with{' '}
            <code className="font-mono text-12">firebase firestore:export</code>.
          </p>
          <p className="mt-2">
            A browser-side CSV button here would produce a file with no audit row saying who took it, which for
            financial data is the wrong trade. When it is built it belongs behind a Route Handler that logs the
            export.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
