import 'server-only';

import type { SupportTicket, TicketMessage } from '@/lib/models';

import { AppError, bool, db, isoOr, isServerFirebaseReady, now, str } from './db';

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

  const ref = db().collection('tickets').doc();
  const preview = body.slice(0, 140);

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
  const ref = db().doc(`tickets/${ticketId}`);
  const snap = await ref.get();
  if (!snap.exists || str(snap.get('uid')) !== uid) return;
  if (!bool(snap.get('unreadForUser'))) return;
  await ref.update({ unreadForUser: false, updatedAt: now() });
}
