import type { Metadata } from 'next';
import Link from 'next/link';

import { nf, relative } from '@/lib/format';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere, listTickets } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { Pill, StatusPill } from '@/components/ui/Pill';

export const metadata: Metadata = { title: 'Ticket inbox' };

/* ============================================================================
   /admin/support/tickets — the inbox
   ----------------------------------------------------------------------------
   Reads `/tickets` ordered by last activity, filtered by status from the URL so a
   link to "everything open" is shareable.

   REPLYING IS NOT WIRED, AND THE SCREEN SAYS SO RATHER THAN SHOWING A DEAD BOX
   A reply writes to `/tickets/{id}/messages`, flips `unreadForSupport`, and bumps
   `lastMessageAt` — three writes that belong in one transaction behind a route that
   re-checks `support.reply`. No such route exists in this build. A compose field
   that discarded what you typed would be worse than its absence, so the thread view
   is read-only and the missing piece is named.
   ========================================================================== */

export const dynamic = 'force-dynamic';

const FILTERS = [
  { value: 'Open', label: 'Open' },
  { value: 'Answered', label: 'Answered' },
  { value: 'Closed', label: 'Closed' },
  { value: 'all', label: 'Everything' },
];

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params] = await Promise.all([searchParams, requirePermission('support.view')]);

  const raw = params['status'];
  const requested = (Array.isArray(raw) ? raw[0] : raw) ?? 'Open';
  const status = FILTERS.some((f) => f.value === requested) ? requested : 'Open';

  const [rows, open, answered, total, unread] = await Promise.all([
    listTickets({ status, limit: 100 }),
    countWhere('tickets', [['status', '==', 'Open']]),
    countWhere('tickets', [['status', '==', 'Answered']]),
    countWhere('tickets'),
    countWhere('tickets', [['unreadForSupport', '==', true]]),
  ]);

  return (
    <ScaffoldPage
      perm="support.view"
      title="Ticket inbox"
      sub={`${nf(open)} open · ${nf(answered)} waiting on the member · ${nf(total)} ever`}
      kpis={[
        { label: 'Open', value: nf(open), sub: 'waiting on us', tone: open ? 'danger' : 'success' },
        { label: 'Unread', value: nf(unread), sub: 'new member message since we last looked' },
        { label: 'Answered', value: nf(answered), sub: 'waiting on the member' },
        { label: 'All tickets', value: nf(total), sub: 'documents in /tickets' },
        { label: 'This view', value: nf(rows.length), sub: status === 'all' ? 'every status' : status },
      ]}
    >
      <nav aria-label="Ticket filters" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.value}
            href={`/admin/support/tickets?status=${encodeURIComponent(f.value)}`}
            className={
              f.value === status
                ? 'rounded-sm border border-line-accent bg-mint-dim px-3 py-1.5 text-12 font-semibold text-mint'
                : 'rounded-sm border border-line bg-surface-1 px-3 py-1.5 text-12 font-semibold text-text-3 hover:border-line-strong hover:text-text-2'
            }
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {rows.length ? (
        <Card as="section">
          <CardHead>
            <div>
              <CardTitle>Threads</CardTitle>
              <CardSub>Most recent activity first · read-only, see the note below</CardSub>
            </div>
          </CardHead>
          <div className="w-full overflow-auto">
            <table className="vf-table">
              <caption className="sr-only">Support tickets with status, category and last activity</caption>
              <thead>
                <tr>
                  <th scope="col">Ticket</th>
                  <th scope="col">Member</th>
                  <th scope="col">Subject</th>
                  <th scope="col">Last message</th>
                  <th scope="col">Category</th>
                  <th scope="col">Assigned</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-12">{t.id}</td>
                    <td>
                      <Link href={`/admin/users/${t.uid}`} className="font-semibold hover:text-mint">
                        {t.username}
                      </Link>
                    </td>
                    <td className="text-text-2">
                      <span className="flex items-center gap-2">
                        {t.subject || '—'}
                        {t.unreadForSupport ? <Pill tone="mint">new</Pill> : null}
                      </span>
                    </td>
                    <td className="max-w-[280px] truncate text-text-3">{t.lastMessagePreview || '—'}</td>
                    <td className="text-text-3">{t.category}</td>
                    <td className="text-text-3">{t.assignedTo ?? 'nobody'}</td>
                    <td>
                      <StatusPill status={t.status} />
                    </td>
                    <td className="text-text-3">{relative(t.updated)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <NotConfigured
          what={status === 'all' ? 'Support tickets' : `${status} tickets`}
          collection="/tickets"
          how="A document appears when a member opens a ticket from the in-app support panel. Members can already do that — this is simply empty."
        />
      )}

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>Replying, assigning and closing</CardTitle>
            <CardSub>Not wired in this build</CardSub>
          </div>
        </CardHead>
        <div className="p-5 text-13 leading-body text-text-3">
          <p>
            A reply is three writes in one transaction — append to{' '}
            <code className="font-mono text-12">/tickets/&#123;id&#125;/messages</code>, clear{' '}
            <code className="font-mono text-12">unreadForSupport</code>, bump{' '}
            <code className="font-mono text-12">lastMessageAt</code> — behind a route that re-checks{' '}
            <code className="font-mono text-12">support.reply</code>. That route does not exist yet, so this
            screen reads and does not write.
          </p>
          <p className="mt-2">
            Until it does, the fastest honest path is the member&apos;s email from their account page. Every
            ticket row links to it.
          </p>
        </div>
      </Card>
    </ScaffoldPage>
  );
}
