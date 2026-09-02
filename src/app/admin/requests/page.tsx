import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Change requests' };

/* ============================================================================
   /admin/requests — member requests that need an operator
   ----------------------------------------------------------------------------
   Reads `/changeRequests`, which is what the sidebar's request badge counts.

   The intended shape is a member asking for something they cannot do themselves — a
   username change past the cooldown, an email correction, a data export. Nothing in
   the member-facing app writes one yet: account settings either change a field
   directly or refuse, with no "ask a human" path in between.

   Worth stating because the absence is the interesting part: without this queue, a
   member who needs an exception has to open a support ticket, and the exception ends
   up being made from the ticket thread with no record of the decision on the account.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  await requirePermission('user.edit');

  const [rows, pending, tickets] = await Promise.all([
    listCatalogue('changeRequests', 100),
    countWhere('changeRequests', [['status', '==', 'pending']]),
    countWhere('tickets', [['status', '==', 'Open']]),
  ]);

  return (
    <ScaffoldPage
      perm="user.edit"
      title="Change requests"
      sub="Member requests that need a decision from staff"
      kpis={[
        {
          label: 'Pending',
          value: nf(pending),
          sub: 'the number the sidebar badge shows',
          tone: pending ? 'danger' : 'success',
        },
        { label: 'All requests', value: nf(rows.length), sub: 'documents in /changeRequests' },
        {
          label: 'Open tickets',
          value: nf(tickets),
          sub: 'where these requests arrive instead today',
        },
      ]}
    >
      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Requests</CardTitle>
              <CardSub>Read-only — no approve or reject route exists</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Member change requests</caption>
              <thead>
                <tr>
                  <th scope="col">Id</th>
                  <th scope="col">Member</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Requested value</th>
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
                    <td className="max-w-[280px] truncate text-text-3">
                      {String(row.fields['value'] ?? '—')}
                    </td>
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
          what="Change requests"
          collection="/changeRequests"
          how="A document would be written when a member asks for something they cannot do themselves — a username change past the cooldown, an email correction, a data export. No member-facing flow creates one yet, so these arrive as support tickets instead."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>What a member can already change</CardTitle>
            <CardSub>Without asking anybody</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          Display preferences, notification settings and the withdrawal address book are all self-service in
          account settings. A username change is rate-limited rather than approved. Everything else — email
          address, country, a balance correction — needs staff, which is what this queue would route.
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
