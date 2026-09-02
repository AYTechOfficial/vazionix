import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { brand } from '@/lib/brand';
import { requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Legal documents' };

/* ============================================================================
   /admin/content/legal — terms, privacy, cookies
   ----------------------------------------------------------------------------
   Reads `/legal`. Legal copy is versioned content: the version a member accepted at
   signup is the one that binds them, so a document store with a revision per change
   is the right shape and editing in place is the wrong one.

   Nothing in this build writes acceptance records, so there is no "who accepted
   which version" view. That is worth knowing before relying on these pages for
   anything contractual.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function LegalPage() {
  await requirePermission('content.edit');
  const rows = await listCatalogue('legal', 50);

  return (
    <ScaffoldPage
      perm="content.edit"
      title="Legal documents"
      sub={`Terms, privacy and cookie policy for ${brand.domain}`}
      kpis={[
        { label: 'Documents', value: nf(rows.length), sub: 'entries in /legal' },
        {
          label: 'Published',
          value: nf(rows.filter((r) => r.enabled).length),
          sub: 'reachable by members',
        },
        { label: 'Acceptance tracking', value: 'None', sub: 'no signup acceptance record is written' },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Documents</CardTitle>
              <CardSub>Read-only — this collection is not on the catalogue write whitelist</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Legal documents with version and last update</caption>
              <thead>
                <tr>
                  <th scope="col">Slug</th>
                  <th scope="col">Title</th>
                  <th scope="col">Version</th>
                  <th scope="col">State</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">{String(row.fields['title'] ?? '—')}</td>
                    <td className="font-mono text-12 text-text-3">
                      {String(row.fields['version'] ?? '—')}
                    </td>
                    <td className="text-text-3">{row.enabled ? 'published' : 'draft'}</td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Legal documents"
          collection="/legal"
          how="No document exists yet. Create one per policy with a slug, a title, a version string and the body; the member-facing legal route reads them by slug."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Before you rely on these</CardTitle>
            <CardSub>Two gaps worth stating plainly</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            No acceptance record is written at registration, so there is no way to show which version a given
            member agreed to. Adding it is a write on the user document at signup, not a change to this screen.
          </p>
          <p className="mt-2">
            Nothing here is legal advice and none of this copy ships with the project — the documents start
            empty on purpose.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
