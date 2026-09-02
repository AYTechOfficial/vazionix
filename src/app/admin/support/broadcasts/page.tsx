import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue } from '@/server/admin';
import { getSiteConfig } from '@/server/config';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Broadcasts' };

/* ============================================================================
   /admin/support/broadcasts — messaging every member at once
   ----------------------------------------------------------------------------
   A broadcast is a fan-out write: one row per recipient in
   `/users/{uid}/notifications`, batched, rate-limited, and resumable if it fails
   halfway. At any real member count that is a Cloud Function with a queue, not a
   Route Handler — a handler that tried it would exceed the request timeout partway
   through and leave half the base notified with no record of where it stopped.

   So there is no send button, and the honest alternative is already available: the
   announcement banner in `/config/site` reaches every member on their next page load,
   costs one document write, and can be taken down as fast as it went up. For anything
   short of a legal notice it is the better tool anyway.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function BroadcastsPage() {
  await requirePermission('broadcast.send');

  const [rows, site, members] = await Promise.all([
    listCatalogue('broadcasts', 50),
    getSiteConfig(),
    countWhere('users'),
  ]);

  return (
    <ScaffoldPage
      perm="broadcast.send"
      title="Broadcasts"
      sub="Not wired — the announcement banner does the same job for less risk"
      kpis={[
        { label: 'Recorded broadcasts', value: nf(rows.length), sub: 'documents in /broadcasts' },
        { label: 'Recipients per send', value: nf(members), sub: 'one notification write each' },
        {
          label: 'Banner',
          value: site.announcement ? 'Live' : 'Off',
          sub: site.announcement ? `tone: ${site.announcementTone}` : 'nothing showing',
          tone: site.announcement ? 'success' : 'default',
        },
      ]}
      actions={
        <ButtonLink href="/admin/support/banners" variant="primary">
          Use the announcement banner
        </ButtonLink>
      }
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Recorded broadcasts</CardTitle>
              <CardSub>Read-only</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Recorded broadcasts</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="font-mono text-12">{row.id}</td>
                    <td className="text-text-2">{String(row.fields['subject'] ?? '—')}</td>
                    <td className="text-text-3">{String(row.fields['status'] ?? '—')}</td>
                    <td className="text-text-3">{relative(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Broadcasts"
          collection="/broadcasts"
          how="Nothing writes this collection. A real broadcast is a queued fan-out — one notification document per member — which belongs to a Cloud Function that can batch, rate-limit and resume, not to a page request that would time out partway through."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Why the banner is usually right</CardTitle>
            <CardSub>Same reach, one write, instantly reversible</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            The announcement in <code className="font-mono text-12">/config/site</code> is read on every request,
            so every member sees it on their next page load. It costs one document write regardless of member
            count, and removing it is another — where {nf(members)} notification rows cannot be unsent.
          </p>
          <p className="mt-2">
            The case for a real broadcast is a message that must survive being missed: a payout delay, a policy
            change, an incident. That is exactly the case that needs the queue and the delivery record, which is
            why it is a Function rather than a shortcut here.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
