import type { Metadata } from 'next';

import { nf, tokens } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getEconomy } from '@/server/config';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Referrals' };

/* ============================================================================
   /admin/modules/referrals — the commission programme
   ----------------------------------------------------------------------------
   Commission is the one earning mechanic that pays out of another member's
   activity, so the two settings that matter most are the qualifying bar and the
   one-off bonuses — those are what a referral farm optimises against.

   The tier table is read-only for the same reason as the daily ladder:
   `referrals.tiers` is an array of objects, and `ConfigEditor` writes scalars.
   Flattening it to dotted paths would convert the array into a map and the tier
   lookup would silently fall back to Bronze for everyone.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'referrals.qualifyingLevel',
    label: 'Qualifying level',
    kind: 'number',
    min: 1,
    hint: 'A referral only counts toward a tier once the invitee reaches this level. This is the anti-farm setting.',
  },
  {
    path: 'referrals.qualifyBonusTokens',
    label: 'Bonus when a referral qualifies',
    kind: 'number',
    min: 0,
    unit: 'tokens',
    hint: 'Paid to the referrer, once, on qualification.',
  },
  {
    path: 'referrals.signupBonusTokens',
    label: 'Signup bonus for the new member',
    kind: 'number',
    min: 0,
    unit: 'tokens',
  },
];

export default async function ReferralsModulePage() {
  await requirePermission('earn.view');

  const [economy, members] = await Promise.all([getEconomy(), countWhere('users')]);
  const tiers = economy.referrals.tiers;
  const top = tiers[tiers.length - 1];

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Referrals"
      sub={`${tiers.length} tiers · commission from ${tiers[0]?.rate ?? 0}% to ${top?.rate ?? 0}% of a referral's earnings`}
      kpis={[
        {
          label: 'Qualifying level',
          value: String(economy.referrals.qualifyingLevel),
          sub: 'before a referral counts',
        },
        {
          label: 'Qualify bonus',
          value: tokens(economy.referrals.qualifyBonusTokens),
          sub: 'tokens to the referrer',
        },
        {
          label: 'Signup bonus',
          value: tokens(economy.referrals.signupBonusTokens),
          sub: 'tokens to the new member',
        },
        { label: 'Tiers', value: nf(tiers.length), sub: `top tier at ${top?.at ?? 0} referrals` },
        { label: 'Accounts', value: nf(members), sub: 'the pool this programme grows' },
      ]}
    >
      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Tiers</CardTitle>
            <CardSub>Read-only here · lives in /config/economy.referrals.tiers</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Referral tiers, thresholds and commission rates</caption>
            <thead>
              <tr>
                <th scope="col">Tier</th>
                <th scope="col" className="th-num">
                  Qualified referrals
                </th>
                <th scope="col" className="th-num">
                  Commission
                </th>
                <th scope="col">Perk shown to members</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.name}>
                  <td>
                    <Pill tone="violet">{tier.name}</Pill>
                  </td>
                  <td className="td-num tabular">{nf(tier.at)}</td>
                  <td className="td-num tabular">{tier.rate}%</td>
                  <td className="text-text-3">{tier.perk}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <ConfigEditor
        section="economy"
        title="Referral configuration"
        sub="Writes /config/economy.referrals"
        fields={FIELDS}
        values={{ ...economy }}
        footnote={
          <>
            Commission is paid from platform funds, not deducted from the referred member — so a rate rise
            increases cost per active user directly. The qualifying level is the lever that decides whether
            that cost buys real members or registrations.
          </>
        }
      />
    </ScaffoldPage>
  );
}
