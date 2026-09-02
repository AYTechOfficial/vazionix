import type { Metadata } from 'next';

import { compact, dur, nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getEconomy } from '@/server/config';
import { getDailySeries } from '@/server/stats';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';

export const metadata: Metadata = { title: 'Faucet' };

/* ============================================================================
   /admin/modules/faucet — the reward that defines the product
   ----------------------------------------------------------------------------
   Edits `/config/economy.faucet` through the shared `ConfigEditor`. Every field
   below is a dotted path the server reads back verbatim, so nothing translates
   between the form and `EconomyConfig` — a rename in one place would be a compile
   error in the other rather than a silently ignored key.

   The claim counts are the measured consequence of these settings, taken from the
   daily counters. They are the only honest way to see what a reward change did:
   change the reward, watch the series.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  { path: 'faucet.reward', label: 'Reward per claim', kind: 'number', min: 0, unit: 'tokens' },
  { path: 'faucet.exp', label: 'EXP per claim', kind: 'number', min: 0 },
  {
    path: 'faucet.cooldownSeconds',
    label: 'Cooldown',
    kind: 'number',
    min: 30,
    step: 30,
    unit: 'seconds',
    hint: 'The wait between claims for one account.',
  },
  {
    path: 'faucet.dailyCap',
    label: 'Daily claim cap',
    kind: 'number',
    min: 1,
    hint: 'Per account, per UTC day. Reached, the button explains why rather than failing.',
  },
  {
    path: 'faucet.happyHourBonusPct',
    label: 'Happy hour uplift',
    kind: 'number',
    min: 0,
    max: 500,
    unit: 'percent',
  },
  {
    path: 'faucet.happyHourStartHoursUtc',
    label: 'Happy hour start hours (UTC)',
    kind: 'numberList',
    hint: 'Comma separated, 0–23. Empty disables the feature entirely.',
  },
  {
    path: 'faucet.happyHourLengthMinutes',
    label: 'Happy hour length',
    kind: 'number',
    min: 1,
    unit: 'minutes',
  },
  {
    path: 'faucet.requireCaptcha',
    label: 'Require a captcha to claim',
    kind: 'switch',
    hint: 'Off only if a provider is unconfigured; the faucet is the most automated surface on the site.',
  },
];

export default async function FaucetModulePage() {
  await requirePermission('earn.view');

  const [economy, series, claimDocs] = await Promise.all([
    getEconomy(),
    getDailySeries(30),
    countWhere('withdrawals'),
  ]);

  const claims30 = series.reduce((sum, row) => sum + row.claims, 0);
  const claimsToday = series[series.length - 1]?.claims ?? 0;
  const perDay = Math.floor(86_400 / Math.max(1, economy.faucet.cooldownSeconds));

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Faucet"
      sub={`${nf(economy.faucet.reward)} tokens every ${dur(economy.faucet.cooldownSeconds)}`}
      kpis={[
        {
          label: 'Reward',
          value: nf(economy.faucet.reward),
          sub: `tokens · ${economy.faucet.exp} exp per claim`,
        },
        { label: 'Cooldown', value: dur(economy.faucet.cooldownSeconds), sub: `${perDay} claims a day at most` },
        {
          label: 'Daily cap',
          value: nf(economy.faucet.dailyCap),
          sub: perDay < economy.faucet.dailyCap ? 'the cooldown binds first' : 'the cap binds first',
        },
        {
          label: 'Claims · 30d',
          value: compact(claims30),
          sub: 'every earning source, not just the faucet',
        },
        { label: 'Claims today', value: compact(claimsToday), sub: 'from the daily counter' },
        {
          label: 'Withdrawals ever',
          value: compact(claimDocs),
          sub: 'what the faucet ultimately funds',
        },
      ]}
    >
      <ConfigEditor
        section="economy"
        title="Faucet configuration"
        sub="Writes /config/economy. Live on the next read — no deploy, no restart."
        fields={FIELDS}
        values={{ ...economy }}
        footnote={
          <>
            Blast radius: every member, immediately. A reward rise applies to the next claim anyone makes, and
            the cost lands on the liability figure in Treasury rather than on a budget line. Nothing here is
            retroactive.
          </>
        }
      />
    </ScaffoldPage>
  );
}
