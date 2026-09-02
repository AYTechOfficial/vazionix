'use client';

import * as React from 'react';
import { MessageSquarePlus, Send } from 'lucide-react';

import { cn } from '@/lib/utils';
import { dateTime, relative } from '@/lib/format';
import { ApiError, api } from '@/lib/api';
import type { SupportTicket } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Field, Input, Label, Textarea } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pill, StatusPill } from '@/components/ui/Pill';
import { Select } from '@/components/ui/Select';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   TICKET INBOX
   ----------------------------------------------------------------------------
   A two-pane inbox: the list on the left, the selected conversation on the
   right. Opening a ticket marks it read, which is what clears the badge — a
   badge you cannot clear is a badge people learn to ignore.

   Replies post to `/api/tickets` and the whole list comes back in the response
   rather than being patched locally. The list carries denormalised previews and
   unread flags, and reconstructing those on the client is how they drift.
   ========================================================================== */

const CATEGORIES = ['Offerwall', 'Withdraw', 'Referrals', 'Account', 'Advertising', 'Other'] as const;

export function TicketInbox({ initial }: { initial: SupportTicket[] }) {
  const [tickets, setTickets] = React.useState(initial);
  const [selectedId, setSelectedId] = React.useState<string | null>(initial[0]?.id ?? null);
  const [composing, setComposing] = React.useState(false);
  const [reply, setReply] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const { toast } = useToast();

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  const select = async (id: string) => {
    setSelectedId(id);
    setReply('');
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket?.unread) return;

    setTickets((current) => current.map((t) => (t.id === id ? { ...t, unread: false } : t)));
    try {
      await api.post('/api/tickets', { action: 'read', ticketId: id });
    } catch {
      // Cosmetic; the next load reports the true state.
    }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim() || busy) return;
    setBusy(true);
    try {
      const result = await api.post<{ tickets: SupportTicket[] }>('/api/tickets', {
        action: 'reply',
        ticketId: selected.id,
        body: reply,
      });
      setTickets(result.tickets);
      setReply('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not send that reply.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Card as="section" className="min-w-0">
          <CardHead>
            <div className="min-w-0">
              <CardTitle>Your tickets</CardTitle>
              <CardSub>{tickets.length ? `${tickets.length} total` : 'None yet'}</CardSub>
            </div>
            <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
              <MessageSquarePlus aria-hidden="true" />
              New
            </Button>
          </CardHead>

          {tickets.length === 0 ? (
            <CardBody>
              <p className="text-12 leading-body text-text-3">
                Nothing open. If something looks wrong — a conversion that has not credited, a payout that has
                not landed — open a ticket and include the id from the relevant row.
              </p>
            </CardBody>
          ) : (
            <ul className="flex max-h-[560px] flex-col overflow-y-auto">
              {tickets.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => void select(t.id)}
                    className={cn(
                      'flex w-full flex-col gap-1.5 border-b border-line px-4 py-3 text-left',
                      'transition-colors duration-fast ease-out hover:bg-surface-2',
                      selectedId === t.id && 'bg-surface-2',
                      t.unread && 'bg-mint-dim',
                    )}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-13 font-semibold text-text">{t.subject}</span>
                      {t.unread ? <Pill tone="mint">New</Pill> : null}
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusPill status={t.status} />
                      <span className="text-11 text-text-3">{relative(t.updated)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card as="section" className="min-w-0">
          {selected ? (
            <>
              <CardHead>
                <div className="min-w-0">
                  <CardTitle>{selected.subject}</CardTitle>
                  <CardSub>
                    {selected.category} · opened {dateTime(selected.messages[0]?.at ?? selected.updated)}
                  </CardSub>
                </div>
                <StatusPill status={selected.status} />
              </CardHead>

              <CardBody className="flex max-h-[440px] flex-col gap-3 overflow-y-auto">
                {selected.messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn(
                      'max-w-[85%] rounded-md border p-3',
                      m.from === 'you'
                        ? 'self-end border-mint/30 bg-mint-dim'
                        : 'self-start border-line bg-surface-2',
                    )}
                  >
                    <div className="mb-1 flex items-center gap-2 text-11 text-text-3">
                      <strong className="font-semibold text-text-2">
                        {m.from === 'you' ? 'You' : m.from === 'ai' ? 'Assistant' : (m.agent ?? 'Support')}
                      </strong>
                      {dateTime(m.at)}
                    </div>
                    <p className="whitespace-pre-wrap text-13 leading-body text-text-2">{m.body}</p>
                  </div>
                ))}
              </CardBody>

              {selected.status === 'Closed' ? (
                <div className="border-t border-line p-4">
                  <Alert tone="info" className="text-12">
                    This ticket is closed. Open a new one and quote its reference if the problem comes back.
                  </Alert>
                </div>
              ) : (
                <div className="flex flex-col gap-2 border-t border-line p-4">
                  <label htmlFor="ticket-reply" className="sr-only">
                    Your reply
                  </label>
                  <Textarea
                    id="ticket-reply"
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Add anything that would help support reproduce it — ids, amounts, timestamps."
                  />
                  <div className="flex justify-end">
                    <Button variant="primary" onClick={sendReply} disabled={busy || !reply.trim()}>
                      <Send aria-hidden="true" />
                      {busy ? 'Sending…' : 'Send reply'}
                    </Button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <EmptyState
              art="inbox"
              title="No ticket selected"
              body="Open a ticket and it appears here with the whole conversation."
              action={
                <Button variant="primary" size="sm" onClick={() => setComposing(true)}>
                  <MessageSquarePlus aria-hidden="true" />
                  New ticket
                </Button>
              }
            />
          )}
        </Card>
      </div>

      <ComposeModal
        open={composing}
        onClose={() => setComposing(false)}
        onCreated={(next, id) => {
          setTickets(next);
          setSelectedId(id);
          setComposing(false);
        }}
      />
    </>
  );
}

function ComposeModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (tickets: SupportTicket[], id: string) => void;
}) {
  const [subject, setSubject] = React.useState('');
  const [category, setCategory] = React.useState<string>('Other');
  const [body, setBody] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.post<{ ticket: SupportTicket; tickets: SupportTicket[] }>('/api/tickets', {
        action: 'open',
        subject,
        category,
        body,
      });
      setSubject('');
      setBody('');
      onCreated(result.tickets, result.ticket.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not open that ticket.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Open a ticket"
      description="Support reads these directly. Specifics get a faster answer than urgency."
    >
      <div className="flex flex-col gap-4">
        <Field>
          <Label htmlFor="t-subject">Subject</Label>
          <Input
            id="t-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Offerwall conversion has not credited"
          />
        </Field>

        <Field>
          <Label htmlFor="t-category">Category</Label>
          <Select id="t-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>

        <Field>
          <Label htmlFor="t-body">What happened</Label>
          <Textarea
            id="t-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Include the conversion or withdrawal id, the amount, and roughly when it happened."
          />
        </Field>

        {error ? (
          <Alert tone="danger" className="text-12">
            {error}
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} disabled={busy || !subject.trim() || !body.trim()}>
            {busy ? 'Opening…' : 'Open ticket'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
