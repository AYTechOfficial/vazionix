import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { getAdConfig, getSiteConfig } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Feature flags' };

/* ============================================================================
   /admin/content/flags — the flags that actually exist
   ----------------------------------------------------------------------------
   Three switches in `/config/site` gate whole capabilities, and this screen is the
   narrow view of them: what is on, what is off, nothing else.

   THERE IS NO GENERIC FLAG REGISTRY, AND THAT IS THE HONEST STATE
   A flag only means something if a code path reads it. Rendering a table of
   arbitrary key/value pairs from a `/flags` collection would let an operator create
   `newDashboard: true` and reasonably expect it to do something, when nothing reads
   it. So the flags listed here are exactly the ones with a consumer, and the same
   document is also edited on the Maintenance screen — deliberately, because the two
   screens are two views of one kill switch.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'signupsOpen',
    label: 'Registration',
    kind: 'switch',
    hint: 'Read by the register route and the auth pages.',
  },
  {
    path: 'withdrawalsOpen',
    label: 'Withdrawals',
    kind: 'switch',
    hint: 'Read by the withdraw route before a quote is issued.',
  },
  {
    path: 'earningOpen',
    label: 'Earning',
    kind: 'switch',
    hint: 'Read by every claim path — faucet, PTC, shortlinks, daily, challenges.',
  },
];

export default async function FlagsPage() {
  await requirePermission('flags.edit');

  const [site, ads] = await Promise.all([getSiteConfig(), getAdConfig()]);

  const on = [site.signupsOpen, site.withdrawalsOpen, site.earningOpen].filter(Boolean).length;

  return (
    <ScaffoldPage
      perm="flags.edit"
      title="Feature flags"
      sub={`${nf(on)} of 3 capability flags are on`}
      kpis={[
        {
          label: 'Registration',
          value: site.signupsOpen ? 'On' : 'Off',
          sub: 'new accounts',
          tone: site.signupsOpen ? 'success' : 'danger',
        },
        {
          label: 'Withdrawals',
          value: site.withdrawalsOpen ? 'On' : 'Off',
          sub: 'new payout requests',
          tone: site.withdrawalsOpen ? 'success' : 'danger',
        },
        {
          label: 'Earning',
          value: site.earningOpen ? 'On' : 'Off',
          sub: 'every claim path',
          tone: site.earningOpen ? 'success' : 'danger',
        },
        {
          label: 'Maintenance',
          value: site.maintenance ? 'ON' : 'Off',
          sub: 'the whole-platform switch',
          tone: site.maintenance ? 'danger' : 'default',
        },
      ]}
    >
      <ConfigEditor
        section="site"
        title="Capability flags"
        sub="Writes /config/site — the same document the Maintenance screen edits"
        fields={FIELDS}
        values={{ ...site }}
        footnote="Maintenance mode overrides all three: with it on, earning and withdrawals are closed whatever these say."
      />

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Flags owned by other screens</CardTitle>
            <CardSub>Listed so this screen is not mistaken for the whole picture</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-col gap-3 text-13 leading-body text-text-3">
          <div className="flex flex-wrap items-center gap-2">
            <Pill tone={ads.behaviour.enabled ? 'success' : 'danger'}>
              Advertising {ads.behaviour.enabled ? 'on' : 'off'}
            </Pill>
            <span>
              The master ad switch lives in <code className="font-mono text-12">/config/ads</code> and needs{' '}
              <code className="font-mono text-12">ads.edit</code>, so somebody who can pause the site cannot
              also blank its revenue.
            </span>
          </div>
          <p>
            Per-module availability — a paused PTC campaign, a disabled shortlink, a provider switched off — is
            a field on the record itself, edited under Modules. There is no flag for it here because a flag that
            duplicated the record&apos;s own `enabled` field would be a second source of truth.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
