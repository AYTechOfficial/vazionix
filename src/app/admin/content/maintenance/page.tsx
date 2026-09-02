import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getSiteConfig } from '@/server/config';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Maintenance' };

/* ============================================================================
   /admin/content/maintenance — the kill switch
   ----------------------------------------------------------------------------
   One document, `/config/site`, and it is the most consequential screen in the
   console. `maintenance: true` stops earning and withdrawals for members AND
   freezes staff money actions — one switch rather than two that can disagree about
   whether the platform is open.

   THE THREE NARROWER SWITCHES EXIST BECAUSE FULL MAINTENANCE IS USUALLY TOO BLUNT
   A rail outage does not justify blocking earning; a bot wave does not justify
   trapping withdrawals. `signupsOpen`, `withdrawalsOpen` and `earningOpen` close one
   door each and leave the rest of the product working, which is almost always the
   proportionate response.

   The announcement is not a maintenance notice — it renders while the site is up.
   Use it to say what is happening before you use the switch that stops it.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'maintenance',
    label: 'Maintenance mode',
    kind: 'switch',
    hint: 'Stops earning and withdrawals for members, and freezes staff money actions. The whole-platform switch.',
  },
  {
    path: 'maintenanceMessage',
    label: 'Maintenance message',
    kind: 'longtext',
    hint: 'Shown to every member while maintenance is on. Say what is happening and when you expect it back.',
  },
  {
    path: 'signupsOpen',
    label: 'Registration open',
    kind: 'switch',
    hint: 'Off blocks new accounts only. The first response to a registration flood.',
  },
  {
    path: 'withdrawalsOpen',
    label: 'Withdrawals open',
    kind: 'switch',
    hint: 'Off stops new requests. Anything already queued still needs a decision in the payout queue.',
  },
  {
    path: 'earningOpen',
    label: 'Earning open',
    kind: 'switch',
    hint: 'Off stops every claim path while leaving accounts, history and withdrawals reachable.',
  },
  {
    path: 'announcement',
    label: 'Announcement banner',
    kind: 'longtext',
    hint: 'Rendered across the member-facing app while the site is up. Empty hides the banner.',
  },
  {
    path: 'announcementTone',
    label: 'Announcement tone',
    kind: 'select',
    options: [
      { value: 'info', label: 'Info — neutral' },
      { value: 'warning', label: 'Warning — something is degraded' },
      { value: 'success', label: 'Success — something is fixed' },
    ],
  },
];

export default async function MaintenancePage() {
  await requirePermission('maintenance.toggle');

  const [site, queued] = await Promise.all([
    getSiteConfig(),
    countWhere('withdrawals', [['status', 'in', ['Pending', 'HeldForReview', 'Processing']]]),
  ]);

  const closed = [
    !site.signupsOpen && 'registration',
    !site.withdrawalsOpen && 'withdrawals',
    !site.earningOpen && 'earning',
  ].filter((x): x is string => Boolean(x));

  return (
    <ScaffoldPage
      perm="maintenance.toggle"
      title="Maintenance"
      sub={
        site.maintenance
          ? 'Maintenance mode is ON — the platform is closed to members'
          : closed.length
            ? `Open, with ${closed.join(' and ')} closed`
            : 'Everything is open'
      }
      kpis={[
        {
          label: 'Maintenance',
          value: site.maintenance ? 'ON' : 'Off',
          sub: site.maintenance ? 'earning and withdrawals frozen' : 'platform open',
          tone: site.maintenance ? 'danger' : 'success',
        },
        {
          label: 'Registration',
          value: site.signupsOpen ? 'Open' : 'Closed',
          sub: 'new accounts',
          tone: site.signupsOpen ? 'default' : 'danger',
        },
        {
          label: 'Withdrawals',
          value: site.withdrawalsOpen ? 'Open' : 'Closed',
          sub: `${nf(queued)} already queued`,
          tone: site.withdrawalsOpen ? 'default' : 'danger',
        },
        {
          label: 'Earning',
          value: site.earningOpen ? 'Open' : 'Closed',
          sub: 'every claim path',
          tone: site.earningOpen ? 'default' : 'danger',
        },
        {
          label: 'Announcement',
          value: site.announcement ? 'Showing' : 'None',
          sub: site.announcement ? `tone: ${site.announcementTone}` : 'no banner',
        },
      ]}
    >
      {site.maintenance ? (
        <Alert tone="danger">
          <strong>Maintenance mode is currently on.</strong> Members cannot earn or withdraw, and staff money
          actions are refused across the console. {nf(queued)} withdrawal
          {queued === 1 ? '' : 's'} sit queued and will stay queued until it is lifted.
        </Alert>
      ) : null}

      <Alert tone="warning">
        <strong>This screen takes effect immediately for every visitor.</strong> There is no staged rollout and
        no confirmation step beyond the save button. Prefer the narrow switch that closes the one door you
        need: full maintenance is the blunt instrument.
      </Alert>

      <ConfigEditor
        section="site"
        title="Site availability"
        sub="Writes /config/site — read on every request by the member-facing app"
        fields={FIELDS}
        values={{ ...site }}
        footnote={
          <>
            Queued withdrawals are not cancelled by closing withdrawals — they still need approval or rejection
            in the payout queue. Closing earning does not reverse anything already credited.
          </>
        }
      />
    </ScaffoldPage>
  );
}
