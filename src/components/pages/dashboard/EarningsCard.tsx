'use client';

import * as React from 'react';

import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Tabs } from '@/components/ui/Tabs';
import { StackedChart } from '@/components/charts/StackedChart';
import { EmptyState } from '@/components/ui/EmptyState';
import { ButtonLink } from '@/components/ui/Button';
import type { EarningDay, EarningSeries } from '@/lib/models';

/* ============================================================================
   EARNINGS BY DAY
   ----------------------------------------------------------------------------
   Real per-source daily totals from the ledger. The legend toggles, the total
   respects the toggles, and a day with no earnings is drawn as an explicit zero
   marker rather than left as an unexplained gap.

   The range switch slices the series the server already sent — 30 days of daily
   totals is a few hundred bytes, so fetching per range would be a round-trip for
   nothing.
   ========================================================================== */

export const EARNING_SERIES: EarningSeries[] = [
  { key: 'faucet', label: 'Faucet', color: '#00E5A0' },
  { key: 'ptc', label: 'PTC', color: '#6C5CE7' },
  { key: 'offerwall', label: 'Offerwall & links', color: '#2D5BFF' },
  { key: 'bonus', label: 'Bonus', color: '#F5A524' },
  { key: 'challenge', label: 'Challenge', color: '#37C2E0' },
];

type Range = '7D' | '14D' | '30D';

const WINDOW: Record<Range, number> = { '7D': 7, '14D': 14, '30D': 30 };

export function EarningsCard({ days }: { days: EarningDay[] }) {
  const [range, setRange] = React.useState<Range>('7D');

  const rows = React.useMemo(() => days.slice(-WINDOW[range]), [days, range]);
  const total = React.useMemo(
    () => rows.reduce((sum, r) => sum + EARNING_SERIES.reduce((s, k) => s + (r[k.key] || 0), 0), 0),
    [rows],
  );

  const available = React.useMemo(
    () => (['7D', '14D', '30D'] as Range[]).filter((r) => days.length >= WINDOW[r] || r === '7D'),
    [days.length],
  );

  return (
    <Card as="section">
      <CardHead>
        <div className="min-w-0">
          <CardTitle>Earnings by day</CardTitle>
          <CardSub>
            Stacked by source · {total.toLocaleString('en-US')} tokens over {rows.length} days
          </CardSub>
        </div>
        {available.length > 1 ? (
          <Tabs<Range>
            label="Chart range"
            value={range}
            onValueChange={setRange}
            items={available.map((r) => ({ value: r, label: r }))}
          />
        ) : null}
      </CardHead>
      <CardBody>
        {total === 0 ? (
          <EmptyState
            art="success"
            title="No earnings in this window"
            body="Claim the faucet or complete an offer and this chart fills in from your real transaction history."
            action={
              <ButtonLink href="/faucet" variant="primary" size="sm">
                Claim the faucet
              </ButtonLink>
            }
          />
        ) : (
          <StackedChart rows={rows} series={EARNING_SERIES} />
        )}
      </CardBody>
    </Card>
  );
}
