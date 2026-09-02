import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { brand } from '@/lib/brand';
import { requirePermission } from '@/lib/admin/guard';
import { listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';

export const metadata: Metadata = { title: 'Email templates' };

/* ============================================================================
   /admin/support/emails — transactional email
   ----------------------------------------------------------------------------
   No email is sent by this application. Verification and password reset are handled
   by Firebase Auth using ITS OWN templates, edited in the Firebase console — not here
   and not in Firestore. Everything else the product needs to tell a member happens
   in-app: a notification row, or the announcement banner.

   That is a deliberate position rather than an omission. Adding transactional email
   means a provider, a sending domain with SPF and DKIM, bounce handling and an
   unsubscribe path for anything non-transactional. Half of that shipped is worse than
   none: mail that silently lands in spam looks identical to mail that was never sent.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function EmailsPage() {
  await requirePermission('content.edit');
  const rows = await listCatalogue('emailTemplates', 50);

  const firebaseManaged = [
    ['Email address verification', 'Firebase Auth', 'Sent on registration and on address change'],
    ['Password reset', 'Firebase Auth', 'Sent from the sign-in screen'],
    ['Email address change notice', 'Firebase Auth', 'Sent to the previous address'],
  ];

  return (
    <ScaffoldPage
      perm="content.edit"
      title="Email templates"
      sub="Auth email is Firebase's; the product sends none of its own"
      kpis={[
        { label: 'Templates stored', value: nf(rows.length), sub: 'documents in /emailTemplates' },
        { label: 'Firebase-managed', value: '3', sub: 'verification, reset, address change' },
        { label: 'Sent by this app', value: '0', sub: 'no provider is configured' },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Stored templates</CardTitle>
              <CardSub>Read-only — nothing sends these</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Stored email templates</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">{String(row.fields['subject'] ?? '—')}</td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Email templates"
          collection="/emailTemplates"
          how="Nothing reads or writes this collection. Adding product email means choosing a provider, authenticating a sending domain with SPF and DKIM, and handling bounces — until then a template here would be a document nothing sends."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Email Firebase already sends</CardTitle>
            <CardSub>Edited in the Firebase console under Authentication → Templates</CardSub>
          </div>
        </CardHead>
        <div className="w-full overflow-auto">
          <table className="vf-table">
            <caption className="sr-only">Authentication emails and where they are configured</caption>
            <thead>
              <tr>
                <th scope="col">Email</th>
                <th scope="col">Sent by</th>
                <th scope="col">When</th>
              </tr>
            </thead>
            <tbody>
              {firebaseManaged.map(([label, sender, when]) => (
                <tr key={label}>
                  <td className="text-text-2">{label}</td>
                  <td className="text-text-3">{sender}</td>
                  <td className="text-text-3">{when}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <CardBody className="border-t border-line text-12 leading-body text-text-3">
          Set the reply-to on those templates to {brand.email.support} so a member replying to a verification
          mail reaches somebody. The default is a no-reply address on a Google-owned domain, and replies to it
          disappear.
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
