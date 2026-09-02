import type { Metadata } from 'next';

import { cryptoAmount, nf, usd } from '@/lib/format';
import { COIN_NAMES, COIN_TICKERS } from '@/lib/models';
import { requirePermission } from '@/lib/admin/guard';
import { getPayoutRails, getRates } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { Alert } from '@/components/ui/Alert';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Supported coins' };

/* ============================================================================
   /admin/content/coins — which assets a member can be paid in
   ----------------------------------------------------------------------------
   A coin is "supported" only if some rail carries it AND that entry is enabled. The
   ticker list is code (`COIN_TICKERS`), the spot price is configuration, and the
   availability is the rails array — so this screen joins all three and shows where a
   coin is missing one of them.

   ENABLING OR DISABLING A COIN HAPPENS IN THE RAILS ARRAY, NOT HERE
   `/config/rates.rails` is an array of objects and the console has no array editor
   for the reason spelled out on the Rails screen: a dotted-path write turns the array
   into a map and silently reverts every rail to defaults. So this is a read-only
   truth table, which is still the fastest way to answer "why can nobody withdraw
   TON".
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function CoinsPage() {
  await requirePermission('coins.manage');

  const [rates, rails] = await Promise.all([getRates(), getPayoutRails()]);

  const railsFor = new Map<string, string[]>();
  const minFor = new Map<string, string>();
  for (const rail of rails) {
    const list = railsFor.get(rail.coin) ?? [];
    list.push(rail.rail);
    railsFor.set(rail.coin, list);
    const current = minFor.get(rail.coin);
    if (!current || Number(rail.min) < Number(current)) minFor.set(rail.coin, rail.min);
  }

  const withdrawable = COIN_TICKERS.filter((coin) => (railsFor.get(coin)?.length ?? 0) > 0);
  const unpriced = COIN_TICKERS.filter((coin) => !rates.spot[coin]);

  return (
    <ScaffoldPage
      perm="coins.manage"
      title="Supported coins"
      sub={`${nf(withdrawable.length)} of ${nf(COIN_TICKERS.length)} assets can currently be withdrawn`}
      kpis={[
        { label: 'Assets known', value: nf(COIN_TICKERS.length), sub: 'the COIN_TICKERS list in code' },
        {
          label: 'Withdrawable',
          value: nf(withdrawable.length),
          sub: 'carried by at least one enabled rail',
        },
        {
          label: 'Unpriced',
          value: nf(unpriced.length),
          sub: unpriced.length ? unpriced.join(', ') : 'every asset has a spot price',
          tone: unpriced.length ? 'danger' : 'success',
        },
        {
          label: 'Token rate',
          value: `$${rates.usdPerToken.toFixed(8)}`,
          sub: 'divides into the spot price to size a payout',
        },
      ]}
    >
      {unpriced.length ? (
        <Alert tone="danger">
          <strong>{unpriced.join(', ')} has no spot price.</strong> A quote for it divides by zero and the
          withdraw form cannot size the payout. Set a price under Rates, or disable the rail entries carrying
          it.
        </Alert>
      ) : null}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Assets</CardTitle>
            <CardSub>Ticker from code · price from /config/rates · availability from the rails array</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">
              Supported coins with spot price, carrying rails and lowest minimum
            </caption>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                <th scope="col">Name</th>
                <th scope="col" className="th-num">
                  Spot price
                </th>
                <th scope="col">Rails</th>
                <th scope="col" className="th-num">
                  Lowest minimum
                </th>
                <th scope="col">Withdrawable</th>
              </tr>
            </thead>
            <tbody>
              {COIN_TICKERS.map((coin) => {
                const carrying = railsFor.get(coin) ?? [];
                const price = rates.spot[coin];
                const min = minFor.get(coin);
                return (
                  <tr key={coin}>
                    <td className="font-semibold text-text">{coin}</td>
                    <td className="text-text-3">{COIN_NAMES[coin]}</td>
                    <td className="td-num tabular">{price ? usd(price) : '—'}</td>
                    <td className="text-text-3">
                      {carrying.length ? [...new Set(carrying)].join(', ') : 'none'}
                    </td>
                    <td className="td-num tabular text-text-3">
                      {min ? cryptoAmount(Number(min), coin) : '—'}
                    </td>
                    <td>
                      {carrying.length && price ? (
                        <Pill tone="success">yes</Pill>
                      ) : (
                        <Pill tone="neutral">{carrying.length ? 'unpriced' : 'no rail'}</Pill>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </ScaffoldPage>
  );
}
