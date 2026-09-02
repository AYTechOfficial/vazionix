import type { Metadata } from 'next';

import { compact, dur, nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { getEconomy } from '@/server/config';
import { listCatalogue } from '@/server/admin';
import { getDailySeries } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Shortlinks' };

/* ============================================================================
   /admin/modules/shortlinks — the link-visit earner
   ----------------------------------------------------------------------------
   Each row sends a member through a monetised link and pays them for completing
   the countdown. The economics are the whole point: the reward must sit below what
   the smartlink pays per visit, and this screen is where that gets decided.

   `tokenTtlSeconds` in the config is the lifetime of the one-time token issued when
   a member starts a visit. It bounds how long a completion can be replayed, which is
   the entire anti-abuse surface for this module — a generous TTL is a free
   completion for anyone who saves the callback.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const LINK_FIELDS: CatalogueField[] = [
  { key: 'name', label: 'Name', kind: 'text', column: true, required: true, placeholder: 'Adsterra smartlink' },
  {
    key: 'targetUrl',
    label: 'Target URL',
    kind: 'url',
    required: true,
    placeholder: 'https://www.effectiveratecpm.com/…',
    hint: 'The monetised destination. This is the URL the network pays you for.',
  },
  { key: 'reward', label: 'Reward', kind: 'number', min: 0, column: true, defaultValue: 40 },
  { key: 'exp', label: 'EXP', kind: 'number', min: 0, defaultValue: 5 },
  {
    key: 'seconds',
    label: 'Countdown',
    kind: 'number',
    min: 5,
    column: true,
    defaultValue: 30,
    hint: 'Seconds before the reward unlocks.',
  },
  {
    key: 'cap',
    label: 'Daily cap for this link',
    kind: 'number',
    min: 0,
    column: true,
    defaultValue: 10,
    hint: 'Visits per member per day. 0 means unlimited for this row.',
  },
  { key: 'cooldownHours', label: 'Cooldown per member', kind: 'number', min: 0, defaultValue: 1 },
  {
    key: 'provider',
    label: 'Provider',
    kind: 'text',
    defaultValue: 'Adsterra',
    hint: 'Free text, for your own reconciliation against the network report.',
  },
  { key: 'enabled', label: 'Enabled', kind: 'switch', defaultValue: true },
];

const CONFIG_FIELDS: ConfigField[] = [
  { path: 'shortlinks.exp', label: 'Default EXP per visit', kind: 'number', min: 0 },
  { path: 'shortlinks.dailyCap', label: 'Daily cap across all links', kind: 'number', min: 1 },
  {
    path: 'shortlinks.tokenTtlSeconds',
    label: 'Visit token lifetime',
    kind: 'number',
    min: 60,
    unit: 'seconds',
    hint: 'How long a started visit may take to complete. Longer is friendlier and easier to replay.',
  },
  { path: 'shortlinks.requireCaptcha', label: 'Require a captcha per visit', kind: 'switch' },
];

export default async function ShortlinksModulePage() {
  const session = await requirePermission('earn.view');
  const allow = allowFor(session);

  const [economy, links, series] = await Promise.all([
    getEconomy(),
    listCatalogue('shortlinks', 200),
    getDailySeries(30),
  ]);

  const claims30 = series.reduce((sum, row) => sum + row.shortlinkClaims, 0);
  const live = links.filter((l) => l.enabled);

  return (
    <ScaffoldPage
      perm="earn.view"
      title="Shortlinks"
      sub={`${nf(live.length)} of ${nf(links.length)} links enabled · ${nf(
        economy.shortlinks.dailyCap,
      )} visits a day per member`}
      kpis={[
        { label: 'Links', value: nf(links.length), sub: `${nf(live.length)} enabled` },
        { label: 'Claims · 30d', value: compact(claims30), sub: 'completed visits' },
        { label: 'Daily cap', value: nf(economy.shortlinks.dailyCap), sub: 'across every link' },
        {
          label: 'Token lifetime',
          value: dur(economy.shortlinks.tokenTtlSeconds),
          sub: 'window to complete a started visit',
        },
        {
          label: 'Captcha',
          value: economy.shortlinks.requireCaptcha ? 'Required' : 'Off',
          sub: economy.shortlinks.requireCaptcha ? 'per visit' : 'visits are unverified',
          tone: economy.shortlinks.requireCaptcha ? 'default' : 'danger',
        },
      ]}
    >
      {!links.length ? (
        <Alert tone="info">
          No links configured. This module also has a matching ad placement —{' '}
          <code className="font-mono text-12">shortlink.directLink</code> under Ads → Inventory — which is the
          smartlink the engine sends members through when a row has no target of its own.
        </Alert>
      ) : null}

      <CatalogueEditor
        collection="shortlinks"
        noun="Link"
        fields={LINK_FIELDS}
        rows={links}
        canEdit={allow('earn.edit')}
        titleKey="name"
      />

      <ConfigEditor
        section="economy"
        title="Module settings"
        sub="Writes /config/economy.shortlinks"
        fields={CONFIG_FIELDS}
        values={{ ...economy }}
        footnote="Per-link caps stack under the global cap: a member hits whichever binds first."
      />
    </ScaffoldPage>
  );
}
