import type { Metadata } from 'next';
import { CheckCircle2, Clock, LifeBuoy, MessageSquare } from 'lucide-react';

import { nf } from '@/lib/format';
import { StatCard } from '@/components/ui/StatCard';
import { PageHeader } from '@/components/shell/PageHeader';
import { AdBanner, AdUnit } from '@/components/ads/AdUnit';
import { TicketInbox } from '@/components/pages/tickets/TicketInbox';
import { listUserTickets } from '@/server/support';
import { requireUser } from '@/server/session';

export const metadata: Metadata = { title: 'Support' };
export const dynamic = 'force-dynamic';

export default async function TicketsPage() {
  const claims = await requireUser();
  const tickets = await listUserTickets(claims.uid);

  const open = tickets.filter((t) => t.status === 'Open');
  const answered = tickets.filter((t) => t.status === 'Answered');
  const closed = tickets.filter((t) => t.status === 'Closed');

  return (
    <>
      <AdUnit placement="tickets.top" className="mb-4" />

      <PageHeader title="Support" sub="Tickets go to a human, and the whole thread stays here" />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Open" value={nf(open.length)} icon={Clock} sub="waiting on support" />
        <StatCard
          label="Answered"
          value={nf(answered.length)}
          icon={MessageSquare}
          sub="waiting on your reply"
        />
        <StatCard label="Closed" value={nf(closed.length)} icon={CheckCircle2} sub="resolved" />
        <StatCard
          label="Total"
          value={nf(tickets.length)}
          icon={LifeBuoy}
          sub="every ticket you have opened"
        />
      </div>

      <div className="mt-5">
        <TicketInbox initial={tickets} />
      </div>

      <AdBanner placement="tickets.bottom" />
    </>
  );
}
