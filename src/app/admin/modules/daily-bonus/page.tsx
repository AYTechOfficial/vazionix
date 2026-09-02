import type { Metadata } from 'next';

import { nf, tokens } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getEconomy } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Daily bonus' };

/* ============================================================================
   /admin/modules/daily-bonus — the streak ladder and the level curve
   ----------------------------------------------------------------------------
   Two config groups on one screen because they are one mechanic: the ladder pays
   for coming back, and `levels.bonusBpsPerStreakDay` multiplies everything else the
   member earns for the same reason. Splitting them across two screens would hide
   that the streak is paid twice.

   THE LADDER ITSELF IS READ-ONLY HERE
   `daily.steps` is an array of objects. `ConfigEditor` writes scalars and number
   lists; a form that flattened eight rows of three fields into dotted paths would
   write `steps.0.tokens` and turn the array into a map, which the claim path reads
   as an empty ladder. Until there is a real array editor the ladder is shown as it
   stands and changed in `src/lib/config/economy.ts` or directly in the document.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'daily.cooldownHours',
    label: 'Cooldown between claims',
    kind: 'number',
    min: 1,
    max: 48,
    unit: 'hours',
    hint: 'Under 24 lets the claim drift earlier each day, which keeps a streak alive across time zones.',
  },
  {
    path: 'daily.breakAfterHours',
    label: 'Streak breaks after',
    kind: 'number',
    min: 2,
    max: 168,
    unit: 'hours',
    hint: 'Inactivity that resets the ladder to step one.',
  },
  { path: 'levels.base', label: 'EXP for level 1', kind: 'number', min: 1 },
  {
    path: 'levels.growth',
    label: 'Level growth multiplier',
    kind: 'number',
    min: 1,
    step: 0.01,
    hint: '1.18 means each level needs 18% more EXP than the one before.',
  },
  {
    path: 'levels.bonusBpsPerLevel',
    label: 'Earning bonus per level',
    kind: 'number',
    min: 0,
    unit: 'basis points',
  },
  {
    path: 'levels.bonusBpsPerStreakDay',
    label: 'Earning bonus per streak day',
    kind: 'number',
    min: 0,
    unit: 'basis points',
  },
  {
    path: 'levels.maxBonusBps',
    label: 'Combined bonus ceiling',
    kind: 'number',
    min: 0,
    unit: 'basis points',
    hint: '1500 bps is +15%. The ceiling is what stops a long-lived account earning double.',
  },
];

export default async function DailyBonusPage() {
  await requirePermission('earn.view');
  const economy = await getEconomy();

  const ladder = economy.daily.steps;
  const ladderTotal = ladder.reduce((sum, step) => sum + step.tokens, 0);

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Daily bonus"
      sub={`${ladder.length}-step ladder · resets after ${economy.daily.breakAfterHours} hours of inactivity`}
      kpis={[
        { label: 'Steps', value: nf(ladder.length), sub: 'one claim per step, in order' },
        {
          label: 'Full ladder',
          value: tokens(ladderTotal),
          sub: 'tokens for completing every step once',
        },
        {
          label: 'Cooldown',
          value: `${economy.daily.cooldownHours}h`,
          sub: 'between consecutive claims',
        },
        {
          label: 'Streak bonus',
          value: `+${(economy.levels.bonusBpsPerStreakDay / 100).toFixed(2)}%`,
          sub: 'per consecutive day, on every source',
        },
        {
          label: 'Bonus ceiling',
          value: `+${(economy.levels.maxBonusBps / 100).toFixed(0)}%`,
          sub: 'level and streak combined',
        },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>The ladder as it stands</CardTitle>
            <CardSub>Read-only — see the note in this file about array editing</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Daily bonus ladder steps</caption>
            <thead>
              <tr>
                <th scope="col">Step</th>
                <th scope="col" className="th-num">
                  Tokens
                </th>
                <th scope="col" className="th-num">
                  EXP
                </th>
                <th scope="col" className="th-num">
                  Bonus multiplier
                </th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((step, index) => (
                <tr key={index}>
                  <td className="text-text-2">Day {index + 1}</td>
                  <td className="td-num tabular">{nf(step.tokens)}</td>
                  <td className="td-num tabular text-text-3">{nf(step.exp)}</td>
                  <td className="td-num tabular text-text-3">{step.bonus.toFixed(1)}×</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfigEditor
        section="economy"
        title="Streak and level configuration"
        sub="Writes /config/economy — the daily and levels groups"
        fields={FIELDS}
        values={{ ...economy }}
        footnote={
          <>
            Level thresholds are recomputed from EXP on every read, so changing the growth multiplier moves
            every existing member&apos;s level immediately. Raising it demotes people. That is not a bug in the
            maths, it is what the setting means — treat it as a migration, not a tweak.
          </>
        }
      />
    </ScaffoldPage>
  );
}
