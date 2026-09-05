import 'server-only';

import type { SupportTicket, TicketMessage } from '@/lib/models';

import { AppError, bool, db, isoOr, isServerFirebaseReady, now, str } from './db';
import { isSupabaseBackend } from '@/lib/backend';

/* ============================================================================
   SUPPORT TICKETS
   ----------------------------------------------------------------------------
   `/tickets/{id}` with messages in `/tickets/{id}/messages/{id}`.

   TWO UNREAD FLAGS, NOT ONE
   `unreadForUser` and `unreadForSupport` are separate booleans. A single "unread"
   field cannot answer both "does this user have a reply waiting" and "does the
   support queue have work", and a queue badge that counts tickets waiting on the
   USER is a badge that is permanently non-zero and therefore ignored.

   The preview and timestamp are denormalised onto the parent so the inbox list is
   one query rather than one query plus a subcollection read per row.
   ========================================================================== */

export const TICKET_CATEGORIES = [
  'Offerwall',
  'Withdraw',
  'Referrals',
  'Account',
  'Advertising',
  'Other',
] as const;

export type TicketCategory = (typeof TICKET_CATEGORIES)[number];

export async function listUserTickets(uid: string, limit = 50): Promise<SupportTicket[]> {
  if (isSupabaseBackend) {
    const { supabaseListUserTickets, supabaseListTicketMessages } = await import('./data-supabase');
    const tickets = await supabaseListUserTickets(uid, limit);
    if (!tickets.length) return [];

    /* One query for every message across the user's tickets, then grouped in
       memory: a handful of tickets makes N+1 queries pointless overhead. */
    const ids = tickets.map((t) => String(t.id));
    const messages = await supabaseListTicketMessages(ids);
    const byTicket = new Map<string, TicketMessage[]>();
    for (const m of messages) {
      const role = String(m.author_role ?? 'user');
      const list = byTicket.get(String(m.ticket_id)) ?? [];
      list.push({
        id: String(m.id ?? ''),
        from: role === 'support' ? 'agent' : role === 'ai' ? 'ai' : 'you',
        at: m.created_at ? new Date(m.created_at as string).toISOString() : new Date().toISOString(),
        body: String(m.body ?? ''),
        agent: role === 'support' ? String(m.author_name ?? 'Support') : null,
      });
      byTicket.set(String(m.ticket_id), list);
    }

    return tickets.map((t) => ({
      id: String(t.id),
      subject: String(t.subject ?? 'Support request'),
      category: String(t.category ?? 'Other'),
      status: (String(t.status ?? 'Open') as SupportTicket['status']),
      unread: t.unread_for_user === true,
      updated: t.last_message_at ? new Date(t.last_message_at as string).toISOString() : new Date().toISOString(),
      messages: byTicket.get(String(t.id)) ?? [],
    }));
  }

  if (!isServerFirebaseReady()) return [];

  const snap = await db()
    .collection('tickets')
    .where('uid', '==', uid)
    .orderBy('lastMessageAt', 'desc')
    .limit(limit)
    .get();

  /* Messages are fetched per ticket rather than in one collection-group query:
     a user has a handful of tickets, and the group query would need its own
     composite index for a saving of nothing at this cardinality. */
  return Promise.all(
    snap.docs.map(async (doc) => {
      const data = doc.data();
      const messages = await db()
        .collection(`tickets/${doc.id}/messages`)
        .orderBy('createdAt', 'asc')
        .limit(200)
        .get();

      return {
        id: doc.id,
        subject: str(data.subject, 'Support request'),
        category: str(data.category, 'Other'),
        status: (str(data.status, 'Open') as SupportTicket['status']),
        unread: bool(data.unreadForUser),
        updated: isoOr(data.lastMessageAt),
        messages: messages.docs.map((m): TicketMessage => {
          const md = m.data();
          const role = str(md.authorRole, 'user');
          return {
            id: m.id,
            from: role === 'support' ? 'agent' : role === 'ai' ? 'ai' : 'you',
            at: isoOr(md.createdAt),
            body: str(md.body),
            agent: role === 'support' ? str(md.authorName, 'Support') : null,
          };
        }),
      };
    }),
  );
}

export async function openTicket(args: {
  uid: string;
  username: string;
  subject: string;
  category: string;
  body: string;
}): Promise<SupportTicket> {
  const subject = args.subject.trim();
  const body = args.body.trim();
  if (subject.length < 4) throw new AppError('Give the ticket a subject.', 400, 'missing_subject');
  if (body.length < 10) {
    throw new AppError('Describe the problem in a sentence or two so support can act on it.', 400, 'missing_body');
  }

  const category = (TICKET_CATEGORIES as readonly string[]).includes(args.category)
    ? args.category
    : 'Other';

  const preview = body.slice(0, 140);

  if (isSupabaseBackend) {
    const { supabaseInsertTicket, supabaseInsertTicketMessage } = await import('./data-supabase');
    const nowIso = new Date().toISOString();
    const id = await supabaseInsertTicket({
      user_id: args.uid,
      subject,
      category,
      status: 'Open',
      last_message_preview: preview,
      last_message_at: nowIso,
      unread_for_user: false,
      unread_for_support: true,
      assigned_to: null,
      source_chat_id: null,
    });
    await supabaseInsertTicketMessage({
      ticket_id: id,
      author_uid: args.uid,
      author_role: 'user',
      author_name: args.username,
      body,
      attachments: [],
    });
    return {
      id,
      subject,
      category,
      status: 'Open',
      unread: false,
      updated: nowIso,
      messages: [{ id: 'first', from: 'you', at: nowIso, body, agent: null }],
    };
  }

  const ref = db().collection('tickets').doc();

  await ref.set({
    uid: args.uid,
    username: args.username,
    subject,
    category,
    status: 'Open',
    lastMessagePreview: preview,
    lastMessageAt: now(),
    unreadForUser: false,
    unreadForSupport: true,
    assignedTo: null,
    sourceChatUid: null,
    createdAt: now(),
    updatedAt: now(),
  });

  await db().collection(`tickets/${ref.id}/messages`).add({
    authorUid: args.uid,
    authorRole: 'user',
    authorName: args.username,
    body,
    attachments: [],
    createdAt: now(),
  });

  return {
    id: ref.id,
    subject,
    category,
    status: 'Open',
    unread: false,
    updated: new Date().toISOString(),
    messages: [
      { id: 'first', from: 'you', at: new Date().toISOString(), body, agent: null },
    ],
  };
}

export async function replyToTicket(args: {
  uid: string;
  username: string;
  ticketId: string;
  body: string;
}): Promise<void> {
  const body = args.body.trim();
  if (!body) throw new AppError('Write a reply first.', 400, 'empty_reply');

  if (isSupabaseBackend) {
    const { supabaseGetTicket, supabaseInsertTicketMessage, supabaseUpdateTicket } =
      await import('./data-supabase');
    const ticket = await supabaseGetTicket(args.ticketId);
    if (!ticket) throw new AppError('Ticket not found.', 404, 'not_found');

    /* Ownership is checked here as well as by RLS: a user must not be able to
       append to somebody else's ticket by guessing an id. */
    if (String(ticket.user_id) !== args.uid) {
      throw new AppError('That is not your ticket.', 403, 'forbidden');
    }
    if (String(ticket.status) === 'Closed') {
      throw new AppError('That ticket is closed. Open a new one and reference its id.', 400, 'closed');
    }

    await supabaseInsertTicketMessage({
      ticket_id: args.ticketId,
      author_uid: args.uid,
      author_role: 'user',
      author_name: args.username,
      body,
      attachments: [],
    });
    await supabaseUpdateTicket(args.ticketId, {
      status: 'Open',
      last_message_preview: body.slice(0, 140),
      last_message_at: new Date().toISOString(),
      unread_for_user: false,
      unread_for_support: true,
      updated_at: new Date().toISOString(),
    });
    return;
  }

  const ref = db().doc(`tickets/${args.ticketId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new AppError('Ticket not found.', 404, 'not_found');

  /* Ownership is checked here as well as in rules: a user must not be able to
     append to somebody else's ticket by guessing an id. */
  if (str(snap.get('uid')) !== args.uid) {
    throw new AppError('That is not your ticket.', 403, 'forbidden');
  }
  if (str(snap.get('status')) === 'Closed') {
    throw new AppError('That ticket is closed. Open a new one and reference its id.', 400, 'closed');
  }

  await db().collection(`tickets/${args.ticketId}/messages`).add({
    authorUid: args.uid,
    authorRole: 'user',
    authorName: args.username,
    body,
    attachments: [],
    createdAt: now(),
  });

  await ref.update({
    status: 'Open',
    lastMessagePreview: body.slice(0, 140),
    lastMessageAt: now(),
    unreadForUser: false,
    unreadForSupport: true,
    updatedAt: now(),
  });
}

export async function markTicketRead(uid: string, ticketId: string): Promise<void> {
  if (isSupabaseBackend) {
    const { supabaseGetTicket, supabaseUpdateTicket } = await import('./data-supabase');
    const ticket = await supabaseGetTicket(ticketId);
    if (!ticket || String(ticket.user_id) !== uid) return;
    if (ticket.unread_for_user !== true) return;
    await supabaseUpdateTicket(ticketId, { unread_for_user: false, updated_at: new Date().toISOString() });
    return;
  }
  const ref = db().doc(`tickets/${ticketId}`);
  const snap = await ref.get();
  if (!snap.exists || str(snap.get('uid')) !== uid) return;
  if (!bool(snap.get('unreadForUser'))) return;
  await ref.update({ unreadForUser: false, updatedAt: now() });
}
