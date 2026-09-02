import type { Metadata } from 'next';

import { nf } from '@/lib/format';
import { brand } from '@/lib/brand';
import { requirePermission } from '@/lib/admin/guard';
import { countWhere } from '@/server/admin';
import { ScaffoldPage } from '@/components/admin/ScaffoldPage';
import { NotConfigured } from '@/components/admin/NotConfigured';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { ButtonLink } from '@/components/ui/Button';

export const metadata: Metadata = { title: 'Live chat' };

/* ============================================================================
   /admin/support/chats — the escalation queue that does not exist yet
   ----------------------------------------------------------------------------
   The member-facing app has a support panel, and it produces TICKETS. There is no
   live chat transport: no websocket, no presence for staff, no typing state, no
   queue. So there is nothing for this screen to poll and no operator to hand a
   conversation to.

   The distinction matters because a chat queue sets an expectation of seconds. A
   ticket sets an expectation of hours, and the product currently keeps the second
   promise. Wiring a chat UI without a staffed rota behind it would turn every
   conversation into an unanswered one in public.
   ========================================================================== */

export const dynamic = 'force-dynamic';

export default async function ChatsPage() {
  await requirePermission('support.view');

  const [chats, openTickets, tickets] = await Promise.all([
    countWhere('chats'),
    countWhere('tickets', [['status', '==', 'Open']]),
    countWhere('tickets'),
  ]);

  return (
    <ScaffoldPage
      perm="support.view"
      title="Live chat"
      sub="No chat transport exists — member conversations arrive as tickets"
      kpis={[
        { label: 'Chat threads', value: nf(chats), sub: 'documents in /chats' },
        {
          label: 'Open tickets',
          value: nf(openTickets),
          sub: 'where conversations actually are',
          tone: openTickets ? 'danger' : 'success',
        },
        { label: 'Tickets ever', value: nf(tickets), sub: 'documents in /tickets' },
      ]}
      actions={
        <ButtonLink href="/admin/support/tickets" variant="primary">
          Go to the ticket inbox
        </ButtonLink>
      }
    >
      <NotConfigured
        what="Live chat threads"
        collection="/chats"
        how="Nothing writes this collection. The in-app support panel opens a ticket rather than a chat: there is no realtime transport, no staff presence and no rota, and a chat window with nobody behind it is worse than a ticket form that sets the right expectation."
      />

      <Card as="section">
        <CardHead>
          <div>
            <CardTitle>What the member sees today</CardTitle>
            <CardSub>The support panel, and what it does</CardSub>
          </div>
        </CardHead>
        <CardBody className="text-13 leading-body text-text-3">
          <p>
            The panel takes a subject and a message and writes a ticket, then shows the thread in the member&apos;s
            own ticket list. Replies from staff appear there. That is a slower promise than chat and it is one the
            product can keep.
          </p>
          <p className="mt-2">
            For anything urgent the support address is {brand.email.support}, which is on every page footer and in
            the panel itself.
          </p>
        </CardBody>
      </Card>
    </ScaffoldPage>
  );
}
