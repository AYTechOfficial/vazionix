'use client';

import * as React from 'react';
import { Ticket, TrendingUp } from 'lucide-react';

import { compact, dateTime, nf, shortAddr } from '@/lib/format';
import { ApiError, endpoints } from '@/lib/api';
import type { LotteryState } from '@/lib/models';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { Card, CardBody, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { StatusPill } from '@/components/ui/Pill';
import { Field, Input, Label } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useSession } from '@/components/providers/SessionProvider';

/* ============================================================================
   LOTTERY PANEL
   ----------------------------------------------------------------------------
   Buying tickets debits the balance through the ledger, so a purchase appears in
   Transactions like everything else. The odds are stated because the two numbers
   needed to compute them are already on the page, and a lottery that shows a pool
   and a ticket count but not the probability is asking the user to guess.
   ========================================================================== */

export function LotteryPanel({ initialState }: { initialState: LotteryState }) {
  const [state, setState] = React.useState(initialState);
  const [count, setCount] = React.useState(1);
  const [busy, setBusy] = React.useState(false);

  const { balance, applyClaim, setProfile } = useSession();
  const { toast } = useToast();

  const mine = state.myTickets.filter((t) => t.status === 'Pending').length;
  const cost = count * state.ticketPriceTokens;
  const affordable = balance >= cost;

  /* Chance of holding at least one winner: 1 - P(none of my tickets drawn). */
  const perTicket = state.totalTickets > 0 ? state.winnersPerDraw / state.totalTickets : 0;
  const chance = mine > 0 ? (1 - Math.pow(1 - Math.min(1, perTicket), mine)) * 100 : 0;

  const buy = async () => {
    if (busy || !affordable) return;
    setBusy(true);
    try {
      const result = await endpoints.buyTickets(count);
      setState(result.state);
      applyClaim(-cost, `${result.bought} ticket${result.bought > 1 ? 's' : ''} bought`);
      if ('profile' in result && result.profile) setProfile(result.profile as never);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Could not buy tickets.', 'danger');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card as="section" className="mt-5">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Buy tickets</CardTitle>
            <CardSub>
              {nf(state.ticketPriceTokens)} tokens each · up to {state.maxPerUser} per round
            </CardSub>
          </div>
        </CardHead>

        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field className="w-[140px]">
              <Label htmlFor="lottery-count">Tickets</Label>
              <Input
                id="lottery-count"
                type="number"
                min={1}
                max={state.maxPerUser}
                value={count}
                onChange={(e) =>
                  setCount(Math.max(1, Math.min(state.maxPerUser, Number(e.target.value) || 1)))
                }
              />
            </Field>

            <div className="flex flex-col gap-0.5">
              <span className="text-11 uppercase tracking-wide text-text-3">Cost</span>
              <span className="font-mono text-16 font-semibold tabular text-text">
                {nf(cost)} <span className="text-11 text-text-3">tokens</span>
              </span>
            </div>

            <Button variant="primary" onClick={buy} disabled={busy || !affordable}>
              <Ticket aria-hidden="true" />
              {busy ? 'Buying…' : affordable ? `Buy ${count} ticket${count > 1 ? 's' : ''}` : 'Not enough tokens'}
            </Button>
          </div>

          {mine > 0 ? (
            <Alert tone="info" icon={TrendingUp} className="mt-4">
              You hold <strong>{nf(mine)}</strong> ticket{mine === 1 ? '' : 's'} in a pool of{' '}
              {nf(state.totalTickets)}. With {state.winnersPerDraw} winners drawn, your chance of holding at
              least one is roughly <strong>{chance.toFixed(2)}%</strong>. Tickets do not roll over between
              rounds.
            </Alert>
          ) : (
            <p className="mt-4 text-12 text-text-3">
              The pool grows with every ticket sold, and the whole pool is paid out to{' '}
              {state.winnersPerDraw} winners each draw.
            </p>
          )}
        </CardBody>
      </Card>

      <Card as="section" className="mt-5">
        <CardHead>
          <div className="min-w-0">
            <CardTitle>Your tickets</CardTitle>
            <CardSub>Round {state.round} and earlier</CardSub>
          </div>
        </CardHead>

        {state.myTickets.length === 0 ? (
          <CardBody>
            <EmptyState
              art="inbox"
              title="No tickets yet"
              body="Buy a ticket above to enter the next draw. Every entry is recorded in your transaction history."
            />
          </CardBody>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="vf-table">
              <caption className="sr-only">Your lottery tickets</caption>
              <thead>
                <tr>
                  <th scope="col">Status</th>
                  <th scope="col">Ticket ID</th>
                  <th scope="col">Issued</th>
                  <th scope="col" className="th-num">
                    Prize
                  </th>
                </tr>
              </thead>
              <tbody>
                {state.myTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <StatusPill status={t.status} />
                    </td>
                    <td className="font-mono text-text-3">{shortAddr(t.id, 10, 8)}</td>
                    <td className="text-text-3">{dateTime(t.at)}</td>
                    <td className="td-num tabular">{t.prize ? compact(t.prize) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
