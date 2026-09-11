import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { allowFor, requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { CatalogueEditor, type CatalogueField } from '@/components/admin/CatalogueEditor';

export const metadata: Metadata = { title: 'Legal documents' };

/* ============================================================================
   /admin/content/legal — terms, privacy, and any other binding document
   ----------------------------------------------------------------------------
   Each document lives as a row in the `legal` table (migration 0020) keyed by
   a unique slug. The public route resolves a slug to the latest enabled row,
   so editing here IS publication. Bump `version` and set `effectiveAt` when a
   change is materially binding — the member-facing page shows both.

   Body is plain text with blank-line paragraphs. No markdown is parsed, so
   what is typed here is what a member reads, minus any HTML.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FIELDS: CatalogueField[] = [
  {
    key: 'slug',
    label: 'Slug',
    kind: 'text',
    column: true,
    required: true,
    placeholder: 'terms',
    hint: 'URL segment: /legal/terms. Lowercase, hyphens, unique — changing it breaks old links.',
  },
  {
    key: 'title',
    label: 'Title',
    kind: 'text',
    column: true,
    required: true,
    placeholder: 'Terms of Service',
  },
  {
    key: 'body',
    label: 'Body',
    kind: 'longtext',
    required: true,
    hint: 'Plain paragraphs separated by blank lines. What is typed is what is served.',
  },
  {
    key: 'version',
    label: 'Version',
    kind: 'number',
    column: true,
    defaultValue: 1,
    min: 1,
    hint: 'Bump when a change is materially binding, not for typo fixes.',
  },
  {
    key: 'effectiveAt',
    label: 'Effective from',
    kind: 'date',
    hint: 'Shown to members as the date the current version takes effect.',
  },
];

export default async function LegalAdminPage() {
  const session = await requirePermission('content.edit');
  const allow = allowFor(session);
  const rows = await listCatalogue('legal', 100);

  return (
    <ScaffoldPage
      perm="content.edit"
      title="Legal documents"
      sub="Terms, privacy, and other binding pages"
      kpis={[
        { label: 'Documents', value: nf(rows.length), sub: 'rows in the legal table' },
        {
          label: 'Published',
          value: nf(rows.filter((r) => r.enabled).length),
          sub: 'resolvable on /legal/[slug]',
        },
      ]}
    >
      <CatalogueEditor
        collection="legal"
        noun="Legal document"
        fields={FIELDS}
        rows={rows}
        canEdit={allow('content.edit')}
        titleKey="title"
        detailTemplate="{id}"
        detailLabel="id"
      />
    </ScaffoldPage>
  );
}
