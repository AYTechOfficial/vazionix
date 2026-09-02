import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { brand } from '@/lib/brand';
import { requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Knowledge base' };

/* ============================================================================
   /admin/support/kb — what the assistant is allowed to know
   ----------------------------------------------------------------------------
   The in-app assistant answers from these documents. That makes this collection a
   safety surface rather than a content one: an assistant with no grounding either
   refuses everything or invents an answer, and on a product that moves money the
   second failure mode is expensive — "yes, withdrawals are instant" is a support
   ticket and a complaint.

   Reads `/kb`. There is no editor because the catalogue write route whitelists five
   collections and this is not one of them; widening that whitelist is a deliberate
   change, not a convenience, because an unchecked collection name in a write path is a
   write primitive against any document in the database.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function KbPage() {
  await requirePermission('kb.edit');
  const rows = await listCatalogue('kb', 200);

  const published = rows.filter((r) => r.enabled);

  return (
    <ScaffoldPage
      perm="kb.edit"
      title="Knowledge base"
      sub={`${nf(published.length)} of ${nf(rows.length)} articles available to the assistant`}
      kpis={[
        { label: 'Articles', value: nf(rows.length), sub: 'documents in /kb' },
        {
          label: 'Published',
          value: nf(published.length),
          sub: published.length ? 'used for grounding' : 'the assistant has nothing to cite',
          tone: published.length ? 'default' : 'danger',
        },
      ]}
      actions={
        <ButtonLink href="/admin/content/faq" variant="secondary">
          Member-facing FAQ
        </ButtonLink>
      }
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Articles</CardTitle>
              <CardSub>Read-only — this collection is not on the catalogue write whitelist</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Knowledge base articles</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Title</th>
                  <th scope="col">Topic</th>
                  <th scope="col">State</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">
                      {String(row.fields['title'] ?? row.fields['question'] ?? '—')}
                    </td>
                    <td className="text-text-3">{String(row.fields['topic'] ?? '—')}</td>
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
          what="Knowledge base articles"
          collection="/kb"
          how="Nothing writes this collection yet. Create the first documents in the Firebase console — a title, a topic and a body — starting with the questions that actually arrive: when a payout lands, why a claim was refused, what a token is worth."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>What to write first</CardTitle>
            <CardSub>Ordered by how often the question arrives</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            Withdrawal timing per rail, the minimum balance and why it exists, what a token is worth, why a
            claim was refused (cooldown, daily cap, captcha), and how referral commission qualifies. Those five
            cover most of a faucet&apos;s inbox.
          </p>
          <p className="mt-2">
            Write the numbers as ranges or point at the screen that shows them rather than hardcoding a figure.
            An article saying &quot;withdrawals from 1,000 tokens&quot; becomes wrong the moment somebody edits
            the limit, and the assistant will keep quoting it. Support email: {brand.email.support}.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
