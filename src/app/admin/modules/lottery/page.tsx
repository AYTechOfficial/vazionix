import type { Metadata } from 'next';

import { nf, tokens } from '@/lib/format';
import { requirePermission, allowFor } from '@/lib/admin/guard';
import { getEconomy } from '@/server/config';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { ActionButton } from '@/components/admin/ActionButton';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Lottery' };

/* ============================================================================
   /admin/modules/lottery — the weekly draw
   ----------------------------------------------------------------------------
   Configuration plus the one destructive button in the earning modules: running a
   draw now rather than waiting for the schedule.

   THE DRAW BUTTON IS IDEMPOTENT AT THE LAYER BELOW, WHICH IS WHY IT EXISTS
   `drawLottery()` finds no Pending tickets on a round that has already closed and
   does nothing. That matters because the obvious operator response to a slow
   response is to click again, and a draw that ran twice would pay the pool twice.
   The typed confirmation is here because it is still a payout of the whole pool.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  { path: 'lottery.ticketPriceTokens', label: 'Ticket price', kind: 'number', min: 1, unit: 'tokens' },
  {
    path: 'lottery.maxTicketsPerUserPerRound',
    label: 'Ticket cap per member',
    kind: 'number',
    min: 1,
    hint: 'Per round. The cap is what stops one balance buying the whole pool.',
  },
  { path: 'lottery.winnersPerDraw', label: 'Winners per draw', kind: 'number', min: 1 },
  {
    path: 'lottery.payoutBps',
    label: 'Share of the pool paid out',
    kind: 'number',
    min: 0,
    max: 10000,
    unit: 'basis points',
    hint: '8000 pays 80% and rolls 20% into the next round.',
  },
  {
    path: 'lottery.drawDayUtc',
    label: 'Draw day (UTC weekday)',
    kind: 'number',
    min: 0,
    max: 6,
    hint: '0 Sunday, 1 Monday, through 6 Saturday. A number rather than a picker because the scheduler reads it as one — a select would write "0" as a string and the next draw would never fire.',
  },
  { path: 'lottery.drawHourUtc', label: 'Draw hour (UTC)', kind: 'number', min: 0, max: 23 },
  {
    path: 'lottery.seedPool',
    label: 'Seed pool',
    kind: 'number',
    min: 0,
    unit: 'tokens',
    hint: 'Tokens added to an empty pool so a first round is not worth nothing.',
  },
];

export default async function LotteryModulePage() {
  const session = await requirePermission('earn.view');
  const allow = allowFor(session);

  const [economy, rounds, tickets] = await Promise.all([
    getEconomy(),
    countWhere('lotteryRounds'),
    countWhere('lotteryTickets'),
  ]);

  const cfg = economy.lottery;

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Lottery"
      sub={`${tokens(cfg.ticketPriceTokens)} tokens a ticket · ${cfg.winnersPerDraw} winners · ${
        cfg.payoutBps / 100
      }% of the pool per draw`}
      kpis={[
        { label: 'Ticket price', value: tokens(cfg.ticketPriceTokens), sub: 'tokens, debited on purchase' },
        { label: 'Winners', value: String(cfg.winnersPerDraw), sub: 'per draw' },
        { label: 'Pool paid out', value: `${cfg.payoutBps / 100}%`, sub: 'remainder rolls forward' },
        { label: 'Rounds recorded', value: nf(rounds), sub: 'documents in /lotteryRounds' },
        { label: 'Tickets recorded', value: nf(tickets), sub: 'documents in /lotteryTickets' },
      ]}
      actions={
        allow('lottery.draw') ? (
          <ActionButton
            endpoint="/api/admin/actions/lottery-draw"
            variant="danger"
            size="md"
            confirmTitle="Run the lottery draw now"
            confirmWord="DRAW"
            success="Draw complete."
            confirmBody={
              <>
                <p>
                  This closes the open round immediately, picks {cfg.winnersPerDraw} winners from the Pending
                  tickets and credits {cfg.payoutBps / 100}% of the pool. Members are notified.
                </p>
                <p>
                  A second run on a closed round finds no Pending tickets and does nothing, so a double click
                  cannot pay twice — but the first one is not reversible.
                </p>
              </>
            }
          >
            Run the draw now
          </ActionButton>
        ) : null
      }
    >
      {!rounds ? (
        <Alert tone="info">
          No round has been recorded yet. <code className="font-mono">/lotteryRounds</code> gets its first
          document when the first ticket is bought or the first draw runs.
        </Alert>
      ) : null}

      <ConfigEditor
        section="economy"
        title="Lottery configuration"
        sub="Writes /config/economy.lottery"
        fields={FIELDS}
        values={{ ...economy }}
        footnote={
          <>
            The ticket price and the pool share together set the house edge. Paying out more than 100% of the
            pool is possible here and would mint tokens on every draw — the seed pool is the intended way to
            make an early round attractive instead.
          </>
        }
      />
    </ScaffoldPage>
  );
}
