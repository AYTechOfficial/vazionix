import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Backups and data requests' };

/* ============================================================================
   /admin/platform/backups — exports, and the GDPR queue
   ----------------------------------------------------------------------------
   NOTHING ON THIS SCREEN TRIGGERS A BACKUP, and the reason is worth stating: a
   Firestore export is a long-running Google Cloud operation writing to a bucket, not
   an HTTP request that finishes inside a page load. Starting one from a Route Handler
   would return before it completed and give an operator a success message for a job
   whose outcome nobody observed.

   The honest instruction is the gcloud command, which is below. Automated daily
   exports are a Cloud Scheduler job plus a lifecycle rule on the bucket, configured
   once outside this app.

   The GDPR side reads `/gdprRequests` — the queue an erasure or access request would
   land in. Nothing writes it yet, so requests arrive as support tickets.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function BackupsPage() {
  await requirePermission('backup.run');

  const [rows, pending, users] = await Promise.all([
    listCatalogue('gdprRequests', 100),
    countWhere('gdprRequests', [['status', '==', 'pending']]),
    countWhere('users'),
  ]);

  return (
    <ScaffoldPage
      perm="backup.run"
      title="Backups and data requests"
      sub="Exports are a Cloud operation, not a button here"
      kpis={[
        {
          label: 'Open data requests',
          value: nf(pending),
          sub: pending ? 'awaiting fulfilment' : 'none outstanding',
          tone: pending ? 'danger' : 'success',
        },
        { label: 'All requests', value: nf(rows.length), sub: 'documents in /gdprRequests' },
        { label: 'Accounts in scope', value: nf(users), sub: 'documents in /users' },
        { label: 'Scheduled exports', value: 'External', sub: 'Cloud Scheduler, not this app' },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Data requests</CardTitle>
              <CardSub>Read-only — fulfilment is a manual export</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">GDPR access and erasure requests</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Member</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">
                      {String(row.fields['username'] ?? row.fields['uid'] ?? '—')}
                    </td>
                    <td className="text-text-3">{String(row.fields['kind'] ?? '—')}</td>
                    <td>
                      <Pill tone={row.fields['status'] === 'pending' ? 'warning' : 'neutral'}>
                        {String(row.fields['status'] ?? 'unknown')}
                      </Pill>
                    </td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Data access and erasure requests"
          collection="/gdprRequests"
          how="A document would be written when a member exercises an access or erasure right. No member-facing flow creates one, so these arrive as support tickets and are fulfilled by hand."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Taking a backup</CardTitle>
            <CardSub>The command, rather than a button that lies about finishing</CardSub>
          </div>
        </CardHead>
        <CardBody className="flex flex-col gap-3 text-13 leading-body text-text-3">
          <pre className="overflow-x-auto rounded-sm border border-line bg-surface-inset p-3 font-mono text-12 text-text-2">
{`gcloud firestore export gs://YOUR_BUCKET/$(date +%F) \\
  --collection-ids=users,withdrawals,tickets,auditLog,config`}
          </pre>
          <p>
            Naming the collections keeps the export small and predictable; a full export includes every
            subcollection and grows with the claims history, which is the largest collection in the product.
          </p>
          <p>
            For an erasure, the ledger rows are anonymised rather than deleted. An erasure that destroys the
            books is not compliance — it is a different violation, and it makes the accounting series
            unreconcilable.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
