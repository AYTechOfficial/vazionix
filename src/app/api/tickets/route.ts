import { AppError } from '@/server/db';
import { handler, ok, optionalString, requireString } from '@/server/http';
import { requireUser } from '@/server/session';
import { getProfile } from '@/server/users';
import { listUserTickets, markTicketRead, openTicket, replyToTicket } from '@/server/support';

/* ============================================================================
   GET  /api/tickets — the viewer's tickets with their messages
   POST /api/tickets — { action: 'open' | 'reply' | 'read' }
   ----------------------------------------------------------------------------
   Ownership is enforced server-side on every action. `firestore.rules` says the
   same thing, but a route handler that trusts a ticket id from the body is a
   route handler that lets somebody append to a stranger's ticket.
   ========================================================================== */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async () => {
  const claims = await requireUser();
  return ok({ tickets: await listUserTickets(claims.uid) });
});

export const POST = handler(async (ctx) => {
  const claims = await requireUser();
  const body = await ctx.body();
  const action = requireString(body, 'action', 20);

  const profile = await getProfile(claims.uid, claims.emailVerified);
  const username = profile?.username ?? 'member';

  if (action === 'open') {
    const ticket = await openTicket({
      uid: claims.uid,
      username,
      subject: requireString(body, 'subject', 160),
      category: optionalString(body, 'category') ?? 'Other',
      body: requireString(body, 'body', 4000),
    });
    return ok({ ok: true, ticket, tickets: await listUserTickets(claims.uid) });
  }

  if (action === 'reply') {
    await replyToTicket({
      uid: claims.uid,
      username,
      ticketId: requireString(body, 'ticketId', 200),
      body: requireString(body, 'body', 4000),
    });
    return ok({ ok: true, tickets: await listUserTickets(claims.uid) });
  }

  if (action === 'read') {
    await markTicketRead(claims.uid, requireString(body, 'ticketId', 200));
    return ok({ ok: true });
  }

  throw new AppError(`Unknown action "${action}".`, 400, 'bad_action');
});
