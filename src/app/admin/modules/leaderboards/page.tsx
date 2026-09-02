import type { Metadata } from 'next';

import { compact, nf, tokens } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getEconomy } from '@/server/config';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Leaderboards' };

/* ============================================================================
   /admin/modules/leaderboards — prize pools and the payout curve
   ----------------------------------------------------------------------------
   Five boards run on one configuration: pool size, curve, and how many rows are
   kept. The curve is a basis-point list, which `ConfigEditor` handles natively as
   a `numberList` — the one array on this screen that can be edited safely, because
   it is an array of numbers rather than of objects.

   THE CURVE IS VALIDATED BY ARITHMETIC, NOT BY THE FORM
   The sum of the curve against 10000 is shown below. Over 10000 pays out more than
   the pool every period, which mints tokens; under it silently keeps the remainder.
   Neither is wrong, but both should be deliberate, so the number is on screen
   rather than checked on save.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'leaderboard.prizePoolPerBoard',
    label: 'Prize pool per board, per period',
    kind: 'number',
    min: 0,
    unit: 'tokens',
  },
  {
    path: 'leaderboard.payoutCurveBps',
    label: 'Payout curve',
    kind: 'numberList',
    hint: 'Basis points by finishing position, first place first. 2500 is 25% of the pool.',
  },
  {
    path: 'leaderboard.size',
    label: 'Rows kept per board',
    kind: 'number',
    min: 10,
    max: 500,
    hint: 'Storage and read cost scale with this; the page shows the top slice regardless.',
  },
];

export default async function LeaderboardsPage() {
  await requirePermission('earn.view');

  const [economy, boards] = await Promise.all([getEconomy(), countWhere('leaderboards')]);
  const cfg = economy.leaderboard;

  const curveSum = cfg.payoutCurveBps.reduce((sum, bps) => sum + bps, 0);
  const paidPositions = cfg.payoutCurveBps.length;
  const firstPrize = Math.floor((cfg.prizePoolPerBoard * (cfg.payoutCurveBps[0] ?? 0)) / 10_000);

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Leaderboards"
      sub={`${tokens(cfg.prizePoolPerBoard)} tokens per board · ${paidPositions} paid positions`}
      kpis={[
        { label: 'Pool per board', value: compact(cfg.prizePoolPerBoard), sub: 'tokens per period' },
        { label: 'Paid positions', value: nf(paidPositions), sub: 'length of the curve' },
        { label: 'First prize', value: compact(firstPrize), sub: 'tokens at the current curve' },
        {
          label: 'Curve total',
          value: `${(curveSum / 100).toFixed(1)}%`,
          sub: curveSum > 10_000 ? 'over the pool — this mints tokens' : 'of the pool per period',
          tone: curveSum > 10_000 ? 'danger' : 'default',
        },
        { label: 'Boards stored', value: nf(boards), sub: 'documents in /leaderboards' },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>What the current curve pays</CardTitle>
            <CardSub>Per board, per period, at a pool of {tokens(cfg.prizePoolPerBoard)} tokens</CardSub>
          </div>
        </CardHead>
        <CardBody>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(112px,1fr))]">
            {cfg.payoutCurveBps.map((bps, index) => (
              <div key={index} className="rounded-sm border border-line bg-surface-2 px-3 py-2">
                <div className="text-11 uppercase tracking-wide text-text-3">
                  #{index + 1} · {(bps / 100).toFixed(1)}%
                </div>
                <div className="font-mono text-14 font-semibold tabular">
                  {compact(Math.floor((cfg.prizePoolPerBoard * bps) / 10_000))}
                </div>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <ConfigEditor
        section="economy"
        title="Leaderboard configuration"
        sub="Writes /config/economy.leaderboard"
        fields={FIELDS}
        values={{ ...economy }}
        footnote={
          <>
            Five boards run on this one configuration, so the real cost per period is five times the pool.
            Voiding an entry is a separate permission (<code className="font-mono">leaderboard.void</code>) and
            is not wired to a route in this build.
          </>
        }
      />
    </ScaffoldPage>
  );
}
