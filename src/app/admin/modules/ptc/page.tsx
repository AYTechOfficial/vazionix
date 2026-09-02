import type { Metadata } from 'next';

import { compact, nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { getEconomy } from '@/server/config';
import { listCatalogue } from '@/server/admin';
import { getDailySeries } from '@/server/stats';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';

export const metadata: Metadata = { title: 'PTC campaigns' };

/* ============================================================================
   /admin/modules/ptc — paid-to-click campaigns
   ----------------------------------------------------------------------------
   Two surfaces on one screen: the campaign catalogue (`/ptcAds`) and the module
   settings that apply to all of them (`/config/economy.ptc`).

   `seconds` is the dwell time the viewer must complete; `graceSeconds` in the
   config is how much longer they may take before the view is void. Both exist
   because a mobile browser backgrounding a tab for two seconds is not fraud, and a
   viewer who leaves the page open for an hour is not attention.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const CAMPAIGN_FIELDS: CatalogueField[] = [
  { key: 'title', label: 'Title', kind: 'text', column: true, required: true, placeholder: 'Try the new wallet' },
  {
    key: 'description',
    label: 'Description',
    kind: 'longtext',
    hint: 'Shown on the card before the click. One honest sentence outperforms three excited ones.',
  },
  {
    key: 'targetUrl',
    label: 'Target URL',
    kind: 'url',
    required: true,
    placeholder: 'https://advertiser.example/landing',
  },
  { key: 'tokens', label: 'Reward', kind: 'number', min: 0, column: true, defaultValue: 20 },
  { key: 'exp', label: 'EXP', kind: 'number', min: 0, defaultValue: 2 },
  {
    key: 'seconds',
    label: 'Required dwell time',
    kind: 'number',
    min: 5,
    column: true,
    defaultValue: 30,
    hint: 'Seconds the viewer must stay before the reward unlocks.',
  },
  {
    key: 'cooldownHours',
    label: 'Cooldown per member',
    kind: 'number',
    min: 0,
    defaultValue: 24,
    hint: 'Hours before the same member may view this campaign again. 0 allows one view only.',
  },
  {
    key: 'type',
    label: 'Presentation',
    kind: 'select',
    column: true,
    defaultValue: 'Window',
    options: [
      { value: 'Window', label: 'Window — opens a new tab' },
      { value: 'Iframe', label: 'Iframe — embedded, framing must be allowed' },
      { value: 'External', label: 'External — leaves the site' },
      { value: 'Youtube', label: 'Youtube — embedded player' },
    ],
    hint: 'Iframe fails silently on any site sending X-Frame-Options; use Window when unsure.',
  },
  { key: 'enabled', label: 'Enabled', kind: 'switch', defaultValue: true },
];

const CONFIG_FIELDS: ConfigField[] = [
  {
    path: 'ptc.graceSeconds',
    label: 'Grace period',
    kind: 'number',
    min: 0,
    unit: 'seconds',
    hint: 'Extra time a viewer may take beyond the dwell requirement before the view is void.',
  },
  { path: 'ptc.exp', label: 'Default EXP per view', kind: 'number', min: 0 },
  { path: 'ptc.dailyCap', label: 'Daily view cap per member', kind: 'number', min: 1 },
  { path: 'ptc.requireCaptcha', label: 'Require a captcha per view', kind: 'switch' },
];

export default async function PtcModulePage() {
  const session = await requirePermission('earn.view');
  const allow = allowFor(session);

  const [economy, campaigns, series] = await Promise.all([
    getEconomy(),
    listCatalogue('ptcAds', 200),
    getDailySeries(30),
  ]);

  const views30 = series.reduce((sum, row) => sum + row.ptcViews, 0);
  const live = campaigns.filter((c) => c.enabled);
  const payout = live.reduce((sum, c) => sum + (Number(c.fields['tokens']) || 0), 0);

  return (
    <ScaffoldPage
      perm="earn.view"
      title="PTC campaigns"
      sub={`${nf(live.length)} of ${nf(campaigns.length)} campaigns enabled`}
      kpis={[
        { label: 'Campaigns', value: nf(campaigns.length), sub: `${nf(live.length)} enabled` },
        {
          label: 'Full sweep',
          value: compact(payout),
          sub: 'tokens if one member views every enabled campaign',
        },
        { label: 'Views · 30d', value: compact(views30), sub: 'from the daily counters' },
        { label: 'Daily cap', value: nf(economy.ptc.dailyCap), sub: 'views per member per day' },
        { label: 'Grace', value: `${economy.ptc.graceSeconds}s`, sub: 'beyond the dwell requirement' },
      ]}
    >
      <CatalogueEditor
        collection="ptcAds"
        noun="Campaign"
        fields={CAMPAIGN_FIELDS}
        rows={campaigns}
        canEdit={allow('earn.edit')}
        titleKey="title"
      />

      <ConfigEditor
        section="economy"
        title="Module settings"
        sub="Writes /config/economy.ptc — applies to every campaign"
        fields={CONFIG_FIELDS}
        values={{ ...economy }}
        footnote="A campaign's own reward and dwell time win over these; the cap and the grace period are global."
      />
    </ScaffoldPage>
  );
}
