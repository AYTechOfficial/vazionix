import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'FAQ' };

/* ============================================================================
   /admin/content/faq — the member-facing help entries
   ----------------------------------------------------------------------------
   Reads `/faq`. There is no editor because the catalogue write route whitelists five
   collections and this is not one of them — an unchecked collection name in a write
   path is a write primitive against any document in the database, including /users
   and /config, so the whitelist is not something to widen casually.

   The same records feed the AI support assistant's grounding, which is the argument
   for keeping them in Firestore rather than in code: an answer that changed needs to
   change for the assistant at the same moment it changes for the FAQ page.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function FaqPage() {
  await requirePermission('content.edit');
  const rows = await listCatalogue('faq', 200);

  return (
    <ScaffoldPage
      perm="content.edit"
      title="FAQ"
      sub="Help entries shown to members and used to ground the support assistant"
      kpis={[
        { label: 'Entries', value: nf(rows.length), sub: 'documents in /faq' },
        {
          label: 'Published',
          value: nf(rows.filter((r) => r.enabled).length),
          sub: 'visible to members',
        },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Entries</CardTitle>
              <CardSub>Read-only — no write route exists for this collection</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">FAQ entries</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Question</th>
                  <th scope="col">Category</th>
                  <th scope="col">State</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">
                      {String(row.fields['question'] ?? row.fields['title'] ?? '—')}
                    </td>
                    <td className="text-text-3">{String(row.fields['category'] ?? '—')}</td>
                    <td className="text-text-3">{row.enabled ? 'published' : 'draft'}</td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <CardBody className="border-t border-line text-12 text-text-3">
            Edit these in the Firebase console for now. Adding them to the catalogue whitelist in{' '}
            <code className="font-mono">/api/admin/catalogue/[collection]</code> is the one-line change that
            would make this screen editable.
          </CardBody>
        </Card>
      ) : (
        <NotConfigured
          what="FAQ entries"
          collection="/faq"
          how="Nothing writes this collection yet. Create the first document in the Firebase console — a question, an answer and a category — and it appears here and on the member-facing help page."
        />
      )}
    </ScaffoldPage>
  );
}
