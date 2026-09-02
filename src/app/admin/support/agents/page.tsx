import type { Metadata } from 'next';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listCatalogue, listTickets } from '@/server/admin';
import { ROLES, isAdminRole } from '@/lib/admin/rbac';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Support agents' };

/* ============================================================================
   /admin/support/agents — who is carrying the queue
   ----------------------------------------------------------------------------
   Assignment is a real field: a ticket carries `assignedTo`. So load per agent is
   countable and that is what this screen counts.

   WHAT IS NOT COUNTABLE IS PERFORMANCE. Resolution time, first-response time and
   tickets-closed-per-day all need a per-message author timeline, and a ticket stores
   `lastMessageAt` plus a preview. An agent leaderboard built from thread ages would
   rank people by how long their tickets sat, which rewards closing hard cases fast and
   punishes picking them up at all.

   Assigning is also not wired — there is no route that writes `assignedTo` — so this
   screen reports the distribution rather than letting you change it.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function AgentsPage() {
  await requirePermission('support.assign');

  const [staff, open, openCount, total] = await Promise.all([
    listCatalogue('staff', 100),
    listTickets({ status: 'Open', limit: 100 }),
    countWhere('tickets', [['status', '==', 'Open']]),
    countWhere('tickets'),
  ]);

  const load = new Map<string, number>();
  for (const ticket of open) {
    const key = ticket.assignedTo ?? '__unassigned';
    load.set(key, (load.get(key) ?? 0) + 1);
  }
  const unassigned = load.get('__unassigned') ?? 0;

  const supportStaff = staff.filter((row) => {
    const role = String(row.fields['role'] ?? '');
    return isAdminRole(role) && ROLES[role].perms.includes('support.reply');
  });

  return (
    <ScaffoldPage
      perm="support.assign"
      title="Support agents"
      sub={`${nf(openCount)} open tickets · ${nf(unassigned)} unassigned`}
      kpis={[
        {
          label: 'Open tickets',
          value: nf(openCount),
          sub: 'waiting on a reply from us',
          tone: openCount ? 'danger' : 'success',
        },
        {
          label: 'Unassigned',
          value: nf(unassigned),
          sub: unassigned ? 'nobody has picked these up' : 'everything is owned',
          tone: unassigned ? 'danger' : 'success',
        },
        {
          label: 'Agents with reply access',
          value: nf(supportStaff.length),
          sub: 'staff records holding support.reply',
        },
        { label: 'Tickets ever', value: nf(total), sub: 'documents in /tickets' },
      ]}
    >
      {supportStaff.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Agents</CardTitle>
              <CardSub>Open tickets currently assigned to each</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Support agents and their open ticket load</caption>
              <thead>
                <tr>
                  <th scope="col">Agent</th>
                  <th scope="col">Role</th>
                  <th scope="col" className="th-num">
                    Open assigned
                  </th>
                  <th scope="col">Record updated</th>
                </tr>
              </thead>
              <tbody>
                {supportStaff.map((row) => {
                  const role = String(row.fields['role'] ?? '');
                  const count = load.get(row.id) ?? 0;
                  return (
                    <tr key={row.id}>
                      <td className="font-semibold text-text">{String(row.fields['name'] ?? row.id)}</td>
                      <td>
                        {isAdminRole(role) ? (
                          <Pill tone={ROLES[role].tone}>{ROLES[role].label}</Pill>
                        ) : (
                          <Pill tone="neutral">{role || 'unknown'}</Pill>
                        )}
                      </td>
                      <td className="td-num tabular">{nf(count)}</td>
                      <td className="text-text-3">{relative(row.updatedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <CardBody className="border-t border-line text-12 leading-body text-text-3">
            Counted over the {nf(open.length)} most recently active open tickets. An agent with zero may simply
            have closed everything.
          </CardBody>
        </Card>
      ) : (
        <NotConfigured
          what="Support agents"
          collection="/staff"
          how="A record appears when a Super Admin grants a console role with support.reply — Support, Moderator or Admin. Until then tickets have nobody to be assigned to."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Not measured</CardTitle>
            <CardSub>Response time, resolution time, per-agent throughput</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          All three need the author and timestamp of each message on a thread. Tickets store{' '}
          <code className="font-mono text-12">lastMessageAt</code> and a preview, so the only derivable duration
          is thread age — which would rank agents by how long their hardest cases took. That is worse than no
          ranking.
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
