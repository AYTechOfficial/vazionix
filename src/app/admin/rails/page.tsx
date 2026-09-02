import type { Metadata } from 'next';

import { cryptoAmount, nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getPayoutRails, getRates } from '@/server/config';
import { railStatus } from '@/server/payouts';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Alert } from '@/components/ui/Alert';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Payout rails' };

/* ============================================================================
   /admin/rails — what can actually send money, and what cannot
   ----------------------------------------------------------------------------
   Three adapters behind one interface, each enabled purely by the presence of its
   credentials. `railStatus()` reads the environment at request time, so this table
   answers "why did that payout refuse" without opening a log.

   THIS SCREEN IS READ-ONLY, DELIBERATELY
   `/config/rates.rails` is an ARRAY OF OBJECTS. The shared `ConfigEditor` writes
   scalars and number lists through dotted paths, and a path like `rails.0.min` sent
   through a merging `set()` converts the array into a map — at which point
   `getRates()` sees a non-array, discards it, and silently reverts every rail to
   the shipped defaults. That failure is invisible until a member is quoted the
   wrong minimum, so the editor is withheld rather than shipped broken. Change a
   minimum or a fee by writing the whole `rails` array to `/config/rates`, or add a
   real array editor to the console.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function RailsPage() {
  await requirePermission('withdrawal.view');

  const [rails, rates, queued] = await Promise.all([
    getPayoutRails(),
    getRates(),
    countWhere('withdrawals', [['status', 'in', ['Pending', 'HeldForReview', 'Processing']]]),
  ]);

  const status = railStatus();
  const configured = Object.values(status).filter((s) => s.configured).length;
  const byRail = new Map<string, number>();
  for (const rail of rails) byRail.set(rail.rail, (byRail.get(rail.rail) ?? 0) + 1);

  return (
    <ScaffoldPage
      perm="withdrawal.view"
      title="Payout rails"
      sub={`${nf(rails.length)} coin-and-rail combinations enabled · ${nf(configured)} of 3 rails can send`}
      kpis={[
        { label: 'Rails', value: '3', sub: 'FaucetPay · CWallet · Direct' },
        {
          label: 'Able to send',
          value: `${nf(configured)} / 3`,
          sub: 'credentials present in the environment',
          tone: configured === 3 ? 'success' : 'danger',
        },
        { label: 'Coin combinations', value: nf(rails.length), sub: 'enabled entries in /config/rates.rails' },
        { label: 'In the queue', value: nf(queued), sub: 'waiting on one of these rails' },
        {
          label: 'Rates written',
          value: rates.updatedAt ? relative(rates.updatedAt) : 'never',
          sub: rates.updatedAt ? '/config/rates' : 'running on shipped defaults',
        },
      ]}
    >
      <div className="grid gap-3 md:grid-cols-3">
        {Object.entries(status).map(([rail, state]) => (
          <Card key={rail} as="section" pad="md">
            <div className="flex items-center justify-between gap-3">
              <CardTitle>{rail}</CardTitle>
              <Pill tone={state.automated ? (state.configured ? 'success' : 'danger') : 'info'}>
                {state.automated ? (state.configured ? 'ready' : 'no key') : 'manual'}
              </Pill>
            </div>
            <p className="mt-2 text-12 leading-body text-text-3">
              {rail === 'Direct'
                ? 'On-chain, and deliberately not automated: signing keys do not belong in a web process. Approving marks it Processing; you broadcast from custody tooling and record the txid.'
                : state.configured
                  ? 'Automated. Approving a payout calls the provider immediately and settles in seconds.'
                  : `Automated, but no API key is set. Approve is withheld in the queue because the send would fail.`}
            </p>
            <p className="mt-2 font-mono text-11 tabular text-text-3">
              {nf(byRail.get(rail) ?? 0)} coin combinations enabled
            </p>
          </Card>
        ))}
      </div>

      <Alert tone="info">
        A rail with no credentials is not hidden from members — the coins it carries still appear in the
        withdraw form if they are enabled in <code className="font-mono text-12">/config/rates.rails</code>.
        Disable the entries instead of relying on the missing key, or members will queue requests nothing can
        send.
      </Alert>

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Enabled coin and rail combinations</CardTitle>
            <CardSub>Exactly what the withdraw form offers, in the order it offers it</CardSub>
          </div>
        </CardHead>
        {rails.length ? (
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Enabled payout rails with minimums, fees and settlement times</caption>
              <thead>
                <tr>
                  <th scope="col">Coin</th>
                  <th scope="col">Rail</th>
                  <th scope="col">Network</th>
                  <th scope="col" className="th-num">
                    Minimum
                  </th>
                  <th scope="col" className="th-num">
                    Fee
                  </th>
                  <th scope="col">Quoted time</th>
                  <th scope="col">Can send</th>
                </tr>
              </thead>
              <tbody>
                {rails.map((rail) => {
                  const state = status[rail.rail];
                  return (
                    <tr key={`${rail.coin}-${rail.rail}-${rail.network}`}>
                      <td className="font-semibold text-text">{rail.coin}</td>
                      <td className="text-text-2">{rail.rail}</td>
                      <td className="text-text-3">{rail.network}</td>
                      <td className="td-num tabular">{cryptoAmount(Number(rail.min), rail.coin)}</td>
                      <td className="td-num tabular text-text-3">
                        {cryptoAmount(Number(rail.fee), rail.coin)}
                      </td>
                      <td className="text-text-3">{rail.etaLabel}</td>
                      <td>
                        {state?.automated ? (
                          state.configured ? (
                            <Pill tone="success">automated</Pill>
                          ) : (
                            <Pill tone="danger">blocked</Pill>
                          )
                        ) : (
                          <Pill tone="info">manual</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <CardBody className="text-13 text-text-3">
            No rail is enabled, so the withdraw form has nothing to offer. Every entry in{' '}
            <code className="font-mono">/config/rates.rails</code> has{' '}
            <code className="font-mono">enabled: false</code>, or the array was overwritten with a non-array
            value and the defaults were discarded.
          </CardBody>
        )}
      </Card>
    </ScaffoldPage>
  );
}
