import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listTickets } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';


export const metadata: Metadata = { title: 'Support analytics' };

/* ============================================================================
   /admin/analytics/support — ticket volume and state
   ----------------------------------------------------------------------------
   Counts by status, which is what a support lead actually schedules against.

   NO RESPONSE TIME, NO SLA, NO AGENT LEADERBOARD
   A first-response time needs the timestamp of the first STAFF message on each
   thread. Tickets store `lastMessageAt` and a preview, not a per-message author
   timeline, so a response time here would be the age of the last activity dressed
   up as a service level. Open counts and the oldest waiting thread are both exact,
   and between them they answer the same scheduling question.

   `Open` means waiting on us. `Answered` means waiting on the member — counting
   those as work makes the number permanently non-zero and therefore ignored.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function SupportAnalyticsPage() {
  await requirePermission('analytics.view');

  const [open, answered, closed, total, recent] = await Promise.all([
    countWhere('tickets', [['status', '==', 'Open']]),
    countWhere('tickets', [['status', '==', 'Answered']]),
    countWhere('tickets', [['status', '==', 'Closed']]),
    countWhere('tickets'),
    listTickets({ status: 'Open', limit: 10 }),
  ]);

  const oldest = recent[recent.length - 1];
  const unassigned = recent.filter((t) => !t.assignedTo).length;

  return (
    <ScaffoldPage
      perm="analytics.view"
      title="Support analytics"
      sub={`${nf(total)} tickets ever · ${nf(open)} waiting on a reply from us`}
      kpis={[
        {
          label: 'Open',
          value: nf(open),
          sub: 'waiting on us',
          tone: open ? 'danger' : 'success',
        },
        { label: 'Answered', value: nf(answered), sub: 'waiting on the member' },
        { label: 'Closed', value: nf(closed), sub: 'resolved' },
        { label: 'All tickets', value: nf(total), sub: 'documents in /tickets' },
        {
          label: 'Oldest open',
          value: oldest ? relative(oldest.updated) : '—',
          sub: oldest ? 'last activity on the oldest open thread' : 'nothing open',
        },
        {
          label: 'Unassigned',
          value: nf(unassigned),
          sub: 'of the ten oldest open threads',
        },
      ]}
    >
      {recent.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Oldest open threads</CardTitle>
              <CardSub>Ten longest without a reply from us</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Open support tickets, oldest activity first</caption>
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Member</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Category</th>
                  <th scope="col">Assigned</th>
                  <th scope="col">Last activity</th>
                </tr>
              </thead>
              <tbody>
                {[...recent].reverse().map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-12">{t.id}</td>
                    <td className="text-text-2">{t.username}</td>
                    <td className="text-text-2">{t.subject || '—'}</td>
                    <td className="text-text-3">{t.category}</td>
                    <td className="text-text-3">{t.assignedTo ?? 'nobody'}</td>
                    <td className="text-text-3">{relative(t.updated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what="Support tickets"
          collection="/tickets"
          how="A document appears when a member opens a ticket from the in-app support panel. Nothing is waiting right now."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Not measured here</CardTitle>
            <CardSub>Response time, SLA breach, per-agent throughput</CardSub>
          </div>
        </CardHead>
        <div className="p-5 text-13 leading-body text-text-3">
          All three need a per-message author and timestamp timeline. A ticket stores{' '}
          <code className="font-mono text-12">lastMessageAt</code> and a preview, so the only durations
          derivable are thread ages — which is what the KPI band above shows, under its own name rather than
          as a service level.
        </div>
      </Card>
    </ScaffoldPage>
  );
}
