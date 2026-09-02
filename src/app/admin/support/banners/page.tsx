import type { Metadata } from 'next';

import { requirePermission } from '@/lib/admin/guard';
import { getSiteConfig } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { ConfigEditor, type ConfigField } from '@/components/admin/ConfigEditor';
import { Alert } from '@/components/ui/Alert';

export const metadata: Metadata = { title: 'Announcement banner' };

/* ============================================================================
   /admin/support/banners — the one banner the product renders
   ----------------------------------------------------------------------------
   `announcement` and `announcementTone` in `/config/site`. One banner, sitewide, no
   targeting, no schedule — and that is the whole feature rather than a first slice
   of one.

   WHY NOT A BANNER COLLECTION WITH AUDIENCES AND DATES
   Because the app reads exactly one string. Storing five banners with segments and
   windows would need a resolver deciding which one wins, and nothing in the
   member-facing bundle asks that question. When the app grows a resolver this screen
   grows a table; until then a list would be a list of things that never render.

   The tone is not decoration: `warning` is how a degraded rail gets announced, and it
   is the difference between "we know" and "nobody noticed".
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: ConfigField[] = [
  {
    path: 'announcement',
    label: 'Banner text',
    kind: 'longtext',
    hint: 'Rendered across the member-facing app. Empty removes the banner entirely.',
  },
  {
    path: 'announcementTone',
    label: 'Tone',
    kind: 'select',
    options: [
      { value: 'info', label: 'Info — neutral news' },
      { value: 'warning', label: 'Warning — something is degraded' },
      { value: 'success', label: 'Success — something is fixed' },
    ],
    hint: 'Warning is for a known problem. Using info for an outage is how a banner stops being read.',
  },
];

export default async function BannersPage() {
  await requirePermission('content.edit');
  const site = await getSiteConfig();

  const length = (site.announcement ?? '').length;

  return (
    <ScaffoldPage
      perm="content.edit"
      title="Announcement banner"
      sub={site.announcement ? 'A banner is live right now' : 'No banner is showing'}
      kpis={[
        {
          label: 'State',
          value: site.announcement ? 'Live' : 'Off',
          sub: site.announcement ? `tone: ${site.announcementTone}` : 'nothing rendered',
          tone: site.announcement ? 'success' : 'default',
        },
        {
          label: 'Length',
          value: `${length}`,
          sub: length > 160 ? 'long — it will wrap on mobile' : 'characters',
        },
        { label: 'Targeting', value: 'Sitewide', sub: 'no audience or schedule exists' },
      ]}
    >
      {site.maintenance ? (
        <Alert tone="warning">
          Maintenance mode is on, so members see the maintenance message rather than this banner. Edit that on
          the Maintenance screen — the two are different fields in the same document.
        </Alert>
      ) : null}

      <ConfigEditor
        section="site"
        title="Banner"
        sub="Writes /config/site"
        fields={FIELDS}
        values={{ ...site }}
        footnote="Live for every visitor on their next page load. There is no preview because the banner is a single line of text — what you type is what renders."
      />
    </ScaffoldPage>
  );
}
