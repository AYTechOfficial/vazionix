import type { Metadata } from 'next';
import Link from 'next/link';

import { cryptoAmount, dateTime, nf, shortAddr, tokens, usd } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listWithdrawalQueue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Reversals' };

/* ============================================================================
   /admin/reversals — payouts that did not end well
   ----------------------------------------------------------------------------
   Two statuses, and the difference is the whole screen:

   FAILED means the provider refused explicitly — bad address, insufficient merchant
   balance — and the locked tokens were refunded. Nothing is owed.

   REVERSED means we clawed a completed payout back. Only reachable through a
   deliberate operator action, and the tokens were debited again.

   A payout that timed out or answered ambiguously appears in NEITHER. Those stay
   Processing with the tokens still locked, because paying twice is unrecoverable and
   paying late is a support reply. If you are here looking for a stuck payout, it is
   in the queue under Processing.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function ReversalsPage() {
  await requirePermission('withdrawal.reverse');

  const [failed, reversed, processingCount, completed] = await Promise.all([
    listWithdrawalQueue({ status: 'Failed', limit: 40 }),
    listWithdrawalQueue({ status: 'Reversed', limit: 40 }),
    countWhere('withdrawals', [['status', '==', 'Processing']]),
    countWhere('withdrawals', [['status', '==', 'Completed']]),
  ]);

  const rows = [...failed.rows, ...reversed.rows].sort(
    (a, b) => Date.parse(b.at) - Date.parse(a.at),
  );

  const refunded = failed.rows.reduce((sum, row) => sum + row.tokenCost, 0);
  const clawed = reversed.rows.reduce((sum, row) => sum + row.tokenCost, 0);
  const failureRate = completed + failed.total ? (failed.total / (completed + failed.total)) * 100 : 0;

  return (
    <ScaffoldPage
      perm="withdrawal.reverse"
      title="Reversals"
      sub={`${nf(failed.total)} failed · ${nf(reversed.total)} reversed`}
      kpis={[
        {
          label: 'Failed',
          value: nf(failed.total),
          sub: 'provider refused — tokens refunded',
          tone: failed.total ? 'danger' : 'success',
        },
        { label: 'Reversed', value: nf(reversed.total), sub: 'clawed back after completing' },
        {
          label: 'Failure rate',
          value: `${failureRate.toFixed(1)}%`,
          sub: 'of settled attempts',
          tone: failureRate > 5 ? 'danger' : 'default',
        },
        {
          label: 'Stuck in Processing',
          value: nf(processingCount),
          sub: 'ambiguous provider answers — tokens still locked',
          tone: processingCount ? 'danger' : 'default',
        },
        {
          label: 'Tokens returned',
          value: tokens(refunded + clawed),
          sub: `${tokens(refunded)} refunded · ${tokens(clawed)} debited back`,
        },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Failed and reversed payouts</CardTitle>
              <CardSub>Newest first · both statuses in one list</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Failed and reversed withdrawals with reasons</caption>
              <thead>
                <tr>
                  <th scope="col">Requested</th>
                  <th scope="col">Member</th>
                  <th scope="col">Asset</th>
                  <th scope="col" className="th-num">
                    Amount
                  </th>
                  <th scope="col" className="th-num">
                    Tokens
                  </th>
                  <th scope="col">Destination</th>
                  <th scope="col">Status</th>
                  <th scope="col">Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="whitespace-nowrap text-text-3">{dateTime(row.at)}</td>
                    <td>
                      <Link href={`/admin/users/${row.uid}`} className="font-semibold hover:text-mint">
                        {row.username}
                      </Link>
                    </td>
                    <td className="text-text-2">
                      {row.coin} · {row.rail}
                    </td>
                    <td className="td-num tabular">
                      {cryptoAmount(Number(row.receiveAmount), row.coin)}
                    </td>
                    <td className="td-num tabular text-text-3">{tokens(row.tokenCost)}</td>
                    <td className="font-mono text-12 text-text-3" title={row.address}>
                      {shortAddr(row.address)}
                    </td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td className="max-w-[280px] text-text-3">{row.failureReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardBody className="border-t border-line text-12 leading-body text-text-3">
            A failed payout has already refunded its tokens — the member&apos;s balance is whole and no action is
            needed unless the address was wrong, in which case they resubmit. Value at risk across this list is{' '}
            {usd(rows.reduce((sum, row) => sum + row.usdValue, 0))}.
          </CardBody>
        </Card>
      ) : (
        <NotConfigured
          what="Failed and reversed payouts"
          collection="/withdrawals where status is Failed or Reversed"
          how="A row appears when a provider refuses a send, or when an operator reverses a completed payout. An empty list is the healthy state — but check Processing in the payout queue for anything stuck mid-send."
        />
      )}
    </ScaffoldPage>
  );
}
