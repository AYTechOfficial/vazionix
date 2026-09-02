import type { Metadata } from 'next';

import { dur, nf, tokens, usd } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getEconomy, getRates } from '@/server/config';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Limits' };

/* ============================================================================
   /admin/limits — the withdrawal gate and the daily ceilings
   ----------------------------------------------------------------------------
   Everything on this screen exists to bound abuse without bothering legitimate
   members, and the two halves work at different ends:

   THE WITHDRAWAL GATE decides who may take money out at all — a minimum balance, a
   verified email, an account age, and a per-day count. These are the settings a
   multi-account farm has to defeat, so they are the cheapest fraud control in the
   product.

   THE REVIEW THRESHOLD is not a block. Above it a request is marked HeldForReview
   and waits for a human instead of being sent automatically. Set it low and the
   queue fills with legitimate payouts; set it high and the first large fraud goes
   out before anybody looks.

   THE DAILY CAPS bound earning per module. They interact with each module's own
   cooldown — whichever binds first wins — which is why both are shown next to each
   other rather than on separate screens.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'withdraw.minBalanceTokens',
    label: 'Minimum balance to withdraw',
    kind: 'number',
    min: 0,
    unit: 'tokens',
  },
  {
    path: 'withdraw.reviewThresholdUsd',
    label: 'Hold for review above',
    kind: 'number',
    min: 0,
    step: 0.5,
    unit: 'USD',
    hint: 'Not a block — the request queues for a human instead of sending automatically.',
  },
  {
    path: 'withdraw.dailyCount',
    label: 'Withdrawals per day, per member',
    kind: 'number',
    min: 1,
    max: 50,
  },
  {
    path: 'withdraw.quoteTtlSeconds',
    label: 'Quote lifetime',
    kind: 'number',
    min: 30,
    unit: 'seconds',
    hint: 'How long a quoted asset amount stays honourable. Longer means more exposure to a price move.',
  },
  {
    path: 'withdraw.minAccountAgeHours',
    label: 'Minimum account age',
    kind: 'number',
    min: 0,
    unit: 'hours',
    hint: 'Before the first withdrawal. The single most effective control against registration farms.',
  },
  {
    path: 'withdraw.requireEmailVerified',
    label: 'Require a verified email to withdraw',
    kind: 'switch',
  },
  { path: 'faucet.dailyCap', label: 'Faucet claims per day', kind: 'number', min: 1 },
  { path: 'ptc.dailyCap', label: 'PTC views per day', kind: 'number', min: 1 },
  { path: 'shortlinks.dailyCap', label: 'Shortlink visits per day', kind: 'number', min: 1 },
];

export default async function LimitsPage() {
  await requirePermission('limits.edit');

  const [economy, rates, held, unverified] = await Promise.all([
    getEconomy(),
    getRates(),
    countWhere('withdrawals', [['status', '==', 'HeldForReview']]),
    countWhere('users', [['emailVerified', '==', false]]),
  ]);

  const minUsd = economy.withdraw.minBalanceTokens * rates.usdPerToken;

  return (
    <ScaffoldPage
      perm="limits.edit"
      title="Limits"
      sub={`Withdraw from ${tokens(economy.withdraw.minBalanceTokens)} tokens · review above ${usd(
        economy.withdraw.reviewThresholdUsd,
      )}`}
      kpis={[
        {
          label: 'Minimum balance',
          value: tokens(economy.withdraw.minBalanceTokens),
          sub: `${usd(minUsd)} at the current rate`,
        },
        {
          label: 'Review threshold',
          value: usd(economy.withdraw.reviewThresholdUsd),
          sub: `${nf(held)} currently held`,
          tone: held ? 'danger' : 'default',
        },
        {
          label: 'Account age gate',
          value: `${economy.withdraw.minAccountAgeHours}h`,
          sub: 'before a first withdrawal',
        },
        {
          label: 'Quote lifetime',
          value: dur(economy.withdraw.quoteTtlSeconds),
          sub: 'price exposure per quote',
        },
        {
          label: 'Unverified emails',
          value: nf(unverified),
          sub: economy.withdraw.requireEmailVerified
            ? 'blocked from withdrawing'
            : 'able to withdraw — the gate is off',
          tone: economy.withdraw.requireEmailVerified ? 'default' : 'danger',
        },
      ]}
    >
      {!economy.withdraw.requireEmailVerified ? (
        <Alert tone="danger">
          <strong>Email verification is not required to withdraw.</strong> {nf(unverified)} accounts currently
          hold an unverified address. Registration costs nothing without it, which makes every other limit on
          this page easier to defeat by making more accounts.
        </Alert>
      ) : null}

      {minUsd < 0.01 ? (
        <Alert tone="warning">
          The minimum balance is worth {usd(minUsd)} at the current token rate. Below about a cent, the
          provider fee on a payout can exceed the payout, and each one still costs a queue slot and a database
          write.
        </Alert>
      ) : null}

      <ConfigEditor
        section="economy"
        title="Withdrawal gate and daily caps"
        sub="Writes /config/economy — the withdraw group plus the per-module caps"
        fields={FIELDS}
        values={{ ...economy }}
        footnote={
          <>
            These apply to the next request, not to anything already queued. Raising the review threshold does
            not release withdrawals already marked HeldForReview — those still need a decision in the queue.
          </>
        }
      />
    </ScaffoldPage>
  );
}
