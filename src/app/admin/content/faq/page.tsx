import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';

export const metadata: Metadata = { title: 'FAQ' };

/* ============================================================================
   /admin/content/faq — the member-facing help entries
   ----------------------------------------------------------------------------
   Rows live in the `faq` table (migration 0020) and are managed right here
   through the catalogue editor — question, answer, category, sort order. The
   enabled toggle decides whether an entry is published or a draft.

   The landing page's FAQ accordion falls back to its shipped markup while the
   table is empty, so seeding a few entries here is what makes this content
   database-driven rather than frozen into the build.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: CatalogueField[] = [
  {
    key: 'question',
    label: 'Question',
    kind: 'text',
    column: true,
    required: true,
    placeholder: 'How fast are withdrawals?',
  },
  {
    key: 'answer',
    label: 'Answer',
    kind: 'longtext',
    required: true,
    hint: 'Plain sentences. This is also the text a support agent links to.',
  },
  {
    key: 'category',
    label: 'Category',
    kind: 'select',
    column: true,
    defaultValue: 'General',
    options: [
      { value: 'General', label: 'General' },
      { value: 'Withdrawals', label: 'Withdrawals' },
      { value: 'Referrals', label: 'Referrals' },
      { value: 'Account', label: 'Account' },
      { value: 'Rules', label: 'Rules' },
    ],
  },
  {
    key: 'sort',
    label: 'Sort order',
    kind: 'number',
    defaultValue: 100,
    hint: 'Lower sorts first. Leave gaps (10, 20, 30…) so reordering needs no renumber.',
  },
];

export default async function FaqPage() {
  const session = await requirePermission('content.edit');
  const allow = allowFor(session);
  const rows = await listCatalogue('faq', 200);

  return (
    <ScaffoldPage
      perm="content.edit"
      title="FAQ"
      sub="Help entries shown to members"
      kpis={[
        { label: 'Entries', value: nf(rows.length), sub: 'rows in the faq table' },
        {
          label: 'Published',
          value: nf(rows.filter((r) => r.enabled).length),
          sub: 'visible to members',
        },
      ]}
    >
      <CatalogueEditor
        collection="faq"
        noun="FAQ entry"
        fields={FIELDS}
        rows={rows}
        canEdit={allow('content.edit')}
        titleKey="question"
      />
    </ScaffoldPage>
  );
}
