import type { Metadata } from 'next';
import Link from 'next/link';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listTickets } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Change requests' };

/* ============================================================================
   /admin/requests — member requests that need an operator
   ----------------------------------------------------------------------------
   The intended shape is a member asking for something they cannot do
   themselves — a username change past the cooldown, an email correction, a
   data export. Nothing in the member-facing app writes such a record: account
   settings either change a field directly or refuse, with no "ask a human"
   path in between. So there is no requests table, and this screen cannot
   pretend to list one.

   What it shows instead is the real queue where those requests arrive today:
   Open support tickets. A member who needs an exception opens a ticket, the
   decision is made from the ticket thread, and the audit trail on the account
   records what was done. That keeps the screen truthful — and makes it a
   triage view rather than dead weight.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function RequestsPage() {
  const [session, openCount, recent] = await Promise.all([
    requirePermission('user.edit'),
    countWhere('tickets', [['status', '==', 'Open']]),
    listTickets({ status: 'Open', limit: 10 }),
  ]);
  void session;

  return (
    <ScaffoldPage
      perm="user.edit"
      title="Change requests"
      sub="Member requests that need a decision from staff"
      kpis={[
        {
          label: 'Open tickets',
          value: nf(openCount),
          sub: 'where these requests arrive instead today',
          tone: openCount ? 'danger' : 'success',
        },
        { label: 'Requests table', value: 'None', sub: 'no member flow writes one' },
      ]}
    >
      {recent.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Open tickets</CardTitle>
              <CardSub>
                Answered from{' '}
                <Link href="/admin/support/tickets" className="text-mint underline underline-offset-2">
                  Support tickets
                </Link>{' '}
                — this is a triage view, not a second queue
              </CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Open tickets needing staff</caption>
              <thead>
                <tr>
                  <th scope="col">Member</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Category</th>
                  <th scope="col">Last activity</th>
                  <th scope="col">State</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((t) => (
                  <tr key={t.id}>
                    <td className="text-text-2">{t.username}</td>
                    <td className="max-w-[320px] truncate text-text-3">{t.subject}</td>
                    <td className="text-text-3">{t.category}</td>
                    <td className="text-text-3">{relative(t.updated)}</td>
                    <td>
                      <Pill tone={t.unreadForSupport ? 'warning' : 'neutral'}>
                        {t.unreadForSupport ? 'unread' : 'seen'}
                      </Pill>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Change requests"
          collection="/tickets"
          how="A member request would arrive as a support ticket — a username change past the cooldown, an email correction, a data export. There are no open tickets right now, so there is nothing waiting on a decision."
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
          address, country, a balance correction — needs staff, and those arrive as tickets.
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
