import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';

export const metadata: Metadata = { title: 'Broadcasts' };

/* ============================================================================
   /admin/support/broadcasts — messages pushed to members
   ----------------------------------------------------------------------------
   A broadcast is a row in the `broadcasts` table (migration 0020): title, body,
   tone, audience, status. `status` is the whole lifecycle — a row stays a
   `draft` until it is flipped to `sent`, at which point `sentAt` is stamped by
   the upsert and the row is what the member-facing badge reads.

   SENDING IS NOT AUTOMATIC — marking a row sent here records the message and
   its timestamp; delivery is the notification fan-out in the support module,
   which picks up `sent` rows. Compose carefully: a sent broadcast cannot be
   unsent, only superseded.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: CatalogueField[] = [
  {
    key: 'title',
    label: 'Title',
    kind: 'text',
    column: true,
    required: true,
    placeholder: 'Scheduled maintenance',
  },
  {
    key: 'body',
    label: 'Body',
    kind: 'longtext',
    required: true,
    hint: 'Short, plain sentences. This text lands in the member notification feed.',
  },
  {
    key: 'tone',
    label: 'Tone',
    kind: 'select',
    column: true,
    defaultValue: 'info',
    options: [
      { value: 'info', label: 'Info' },
      { value: 'success', label: 'Success' },
      { value: 'warning', label: 'Warning' },
      { value: 'danger', label: 'Danger' },
    ],
  },
  {
    key: 'audience',
    label: 'Audience',
    kind: 'select',
    column: true,
    defaultValue: 'all',
    options: [
      { value: 'all', label: 'All members' },
      { value: 'verified', label: 'Verified members' },
      { value: 'suspended', label: 'Suspended members' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    kind: 'select',
    column: true,
    defaultValue: 'draft',
    options: [
      { value: 'draft', label: 'Draft' },
      { value: 'sent', label: 'Sent' },
    ],
    hint: 'Sent stamps sentAt and queues the fan-out. Cannot be unsent — edit only drafts.',
  },
];

export default async function BroadcastsPage() {
  const session = await requirePermission('broadcast.send');
  const allow = allowFor(session);
  const rows = await listCatalogue('broadcasts', 100);

  const drafts = rows.filter((r) => (r.fields.status as string) !== 'sent');

  return (
    <ScaffoldPage
      perm="broadcast.send"
      title="Broadcasts"
      sub="Messages pushed to member notification feeds"
      kpis={[
        { label: 'All broadcasts', value: nf(rows.length), sub: 'rows in the broadcasts table' },
        { label: 'Drafts', value: nf(drafts.length), sub: 'not yet visible to members' },
      ]}
    >
      <CatalogueEditor
        collection="broadcasts"
        noun="Broadcast"
        fields={FIELDS}
        rows={rows}
        canEdit={allow('broadcast.send')}
        titleKey="title"
      />
    </ScaffoldPage>
  );
}
