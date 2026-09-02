import type { Metadata } from 'next';

import { nf, relative, usd } from '@/lib/format';
import { COIN_TICKERS } from '@/lib/models';
import { requirePermission } from '@/lib/admin/guard';
import { getRates } from '@/server/config';
import { getLiabilityUsd } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Rates' };

/* ============================================================================
   /admin/rates — the token price and the spot table
   ----------------------------------------------------------------------------
   `usdPerToken` is the single most consequential number in the product. It decides
   what a withdrawal costs in tokens, what the liability figure in Treasury means,
   and what every "≈ $0.00042" on the member-facing side says. Editing it here
   re-prices every balance on the site on the next read.

   THE SPOT PRICES ARE INPUTS, NOT MARKET DATA
   Nothing in this build subscribes to a price feed. These are the values the
   withdraw quote divides by to turn tokens into an asset amount, and they are only
   as fresh as the last time somebody typed them or a pricing job wrote them. The
   "last written" line below is the honest measure of that staleness.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'usdPerToken',
    label: 'USD per token',
    kind: 'number',
    min: 0,
    step: 0.0000001,
    hint: 'The exchange rate between the internal token and real money. Everything downstream derives from it.',
  },
  ...COIN_TICKERS.map<ConfigField>((coin) => ({
    path: `spot.${coin}`,
    label: `${coin} spot price`,
    kind: 'number' as const,
    min: 0,
    step: 0.00000001,
    unit: 'USD',
  })),
];

export default async function RatesPage() {
  await requirePermission('rates.edit');

  const [rates, liability] = await Promise.all([getRates(), getLiabilityUsd()]);

  return (
    <ScaffoldPage
      perm="rates.edit"
      title="Rates"
      sub={
        rates.updatedAt
          ? `/config/rates last written ${relative(rates.updatedAt)}`
          : 'No /config/rates document yet — these are the shipped defaults'
      }
      kpis={[
        {
          label: 'USD per token',
          value: `$${rates.usdPerToken.toFixed(8)}`,
          sub: 'the rate every conversion uses',
        },
        {
          label: 'Outstanding liability',
          value: usd(liability.usd),
          sub: `${nf(liability.tokens)} tokens held by members`,
        },
        { label: 'Assets priced', value: nf(COIN_TICKERS.length), sub: 'entries in the spot table' },
        {
          label: 'Rails configured',
          value: nf(rates.rails.filter((r) => r.enabled !== false).length),
          sub: 'edited on the Rails screen',
        },
      ]}
    >
      <Alert tone="warning">
        <strong>Changing the token rate re-prices every balance on the site.</strong> At{' '}
        {nf(liability.tokens)} tokens outstanding, a 10% rise moves the liability by{' '}
        {usd(liability.usd * 0.1)}. Members see the new value on their next page load, and any withdrawal quote
        issued before the change stays honourable until it expires.
      </Alert>

      <ConfigEditor
        section="rates"
        title="Rate configuration"
        sub="Writes /config/rates"
        fields={FIELDS}
        values={{ usdPerToken: rates.usdPerToken, spot: rates.spot }}
        footnote={
          <>
            Spot prices are inputs to the withdraw quote, not observations of a market. Nothing here fetches a
            price feed, so a stale figure quietly overpays or underpays every payout in that asset until
            somebody notices.
          </>
        }
      />
    </ScaffoldPage>
  );
}
