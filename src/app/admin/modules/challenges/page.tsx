import type { Metadata } from 'next';

import { compact, nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';

export const metadata: Metadata = { title: 'Challenges' };

/* ============================================================================
   /admin/modules/challenges — quests over the other modules
   ----------------------------------------------------------------------------
   A challenge is a counter with a prize: do `target` of `kind`, collect `tokens`.
   The counter it reads is the same `claimCounts` map the account page shows, so a
   challenge can never disagree with the member's own history.

   `repeat` is the setting that decides whether this is a one-off onboarding nudge
   or a recurring weekly habit. Weekly challenges reset with the leaderboard period,
   which is why the two screens quote the same period language.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: CatalogueField[] = [
  {
    key: 'title',
    label: 'Title',
    kind: 'text',
    column: true,
    required: true,
    placeholder: 'Claim the faucet ten times',
  },
  {
    key: 'note',
    label: 'Note',
    kind: 'longtext',
    hint: 'Shown under the title. Use it to say what counts, not to sell the reward.',
  },
  {
    key: 'kind',
    label: 'Counts',
    kind: 'select',
    column: true,
    defaultValue: 'faucet',
    options: [
      { value: 'faucet', label: 'Faucet claims' },
      { value: 'ptc', label: 'PTC views' },
      { value: 'shortlink', label: 'Shortlink visits' },
      { value: 'offerwall', label: 'Offerwall conversions' },
      { value: 'referral', label: 'Qualified referrals' },
    ],
  },
  {
    key: 'target',
    label: 'Target',
    kind: 'number',
    min: 1,
    column: true,
    defaultValue: 10,
    hint: 'How many of the counted action are needed.',
  },
  { key: 'tokens', label: 'Reward', kind: 'number', min: 0, column: true, defaultValue: 250 },
  { key: 'exp', label: 'EXP', kind: 'number', min: 0, defaultValue: 10 },
  {
    key: 'repeat',
    label: 'Repeat',
    kind: 'select',
    defaultValue: 'weekly',
    options: [
      { value: 'once', label: 'Once per account, ever' },
      { value: 'weekly', label: 'Weekly — resets with the leaderboard period' },
    ],
  },
  { key: 'enabled', label: 'Enabled', kind: 'switch', defaultValue: true },
];

export default async function ChallengesModulePage() {
  const session = await requirePermission('earn.view');
  const allow = allowFor(session);

  const rows = await listCatalogue('challenges', 200);
  const live = rows.filter((r) => r.enabled);
  const weekly = live.filter((r) => r.fields['repeat'] === 'weekly');
  const payout = live.reduce((sum, r) => sum + (Number(r.fields['tokens']) || 0), 0);
  const weeklyPayout = weekly.reduce((sum, r) => sum + (Number(r.fields['tokens']) || 0), 0);

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Challenges"
      sub={`${nf(live.length)} of ${nf(rows.length)} challenges enabled`}
      kpis={[
        { label: 'Challenges', value: nf(rows.length), sub: `${nf(live.length)} enabled` },
        { label: 'Weekly', value: nf(weekly.length), sub: 'reset every period' },
        {
          label: 'Full clear',
          value: compact(payout),
          sub: 'tokens if one member completes everything enabled',
        },
        {
          label: 'Recurring cost',
          value: compact(weeklyPayout),
          sub: 'tokens per member per week at a full clear',
        },
      ]}
    >
      <CatalogueEditor
        collection="challenges"
        noun="Challenge"
        fields={FIELDS}
        rows={rows}
        canEdit={allow('earn.edit')}
        titleKey="title"
      />
    </ScaffoldPage>
  );
}
