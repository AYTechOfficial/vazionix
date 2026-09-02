'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ExternalLink, X } from 'lucide-react';

import { cryptoAmount, dateTime, relative, shortAddr, tokens, usd } from '@/lib/format';
import { ApiError, api } from '@/lib/api';
import { Alert } from '@/components/ui/Alert';
import { Button } from '@/components/ui/Button';
import { CountryChip } from '@/components/ui/Avatar';
import { Field, Hint, Input, Label } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Pill, StatusPill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   PAYOUT QUEUE
   ----------------------------------------------------------------------------
   The withdrawal queue with its three operator decisions attached to each row.
   Every button here posts to `/api/admin/payouts/[id]/[action]`, which re-checks
   `withdrawal.approve` against the verified session — the buttons below are
   affordances, not authority.

   WHAT EACH ACTION ACTUALLY DOES, because the difference matters at the moment
   somebody is about to click:

     APPROVE  claims the row (Processing, inside a transaction) and then calls the
              rail. An ambiguous provider answer leaves it Processing with the
              tokens still locked rather than marking it paid. Only offered when
              the rail's credentials are present — an automated rail with no key
              refuses server-side, and a button that always fails is worse than an
              absent one.
     REJECT   refunds the locked tokens and notifies the user. Requires a reason,
              because the reason is what the user is shown.
     SETTLE   records a txid for a Direct on-chain payout broadcast from custody
              tooling. Signing keys do not live in a web process, so this is how
              the ledger learns the transaction went out.

   After any action the component calls `router.refresh()` rather than mutating a
   local copy: the server owns the status, and a row that says Completed because a
   click succeeded — while the rail actually returned Processing — is exactly the
   lie this screen cannot afford.
   ========================================================================== */

export interface PayoutRow {
  id: string;
  uid: string;
  username: string;
  email: string;
  countryCode: string;
  coin: string;
  rail: string;
  network: string;
  address: string;
  amount: string;
  fee: string;
  receiveAmount: string;
  tokenCost: number;
  status: string;
  txid: string | null;
  at: string;
  processedAt: string | null;
  failureReason: string | null;
  usdValue: number;
  reviewedBy: string | null;
  ip: string | null;
}

export interface RailState {
  automated: boolean;
  configured: boolean;
}

type Pending = { row: PayoutRow; action: 'reject' | 'settle' } | null;

export function PayoutQueue({
  rows,
  rails,
  canApprove,
  cursor,
  status,
}: {
  rows: PayoutRow[];
  rails: Record<string, RailState>;
  /** `withdrawal.approve`, resolved server-side. */
  canApprove: boolean;
  /** Next-page cursor from `listWithdrawalQueue`, or null on the last page. */
  cursor: string | null;
  status: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<Pending>(null);
  const [reason, setReason] = React.useState('');
  const [txid, setTxid] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);

  const post = async (row: PayoutRow, action: string, payload?: Record<string, unknown>) => {
    setBusyId(row.id);
    setError(null);
    try {
      const result = await api.post<{ status?: string; detail?: string }>(
        `/api/admin/payouts/${row.id}/${action}`,
        payload,
      );
      toast(
        result.detail ?? `${row.id} is now ${result.status ?? 'updated'}.`,
        result.status === 'Completed' ? 'success' : 'info',
      );
      setPending(null);
      setReason('');
      setTxid('');
      router.refresh();
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'That did not go through.';
      setError(message);
      toast(message, 'danger');
    } finally {
      setBusyId(null);
    }
  };

  if (!rows.length) {
    return (
      <Alert tone="success">
        Nothing in the <strong>{status}</strong> queue. New requests land in{' '}
        <code className="font-mono">/withdrawals</code> the moment a user submits one.
      </Alert>
    );
  }

  return (
    <section className="rounded-md border border-line bg-surface-1">
      <div className="w-full overflow-auto">
        <table className="vf-table">
          <caption className="sr-only">
            Withdrawal queue with the operator decision for each request
          </caption>
          <thead>
            <tr>
              <th scope="col">Requested</th>
              <th scope="col">User</th>
              <th scope="col">Asset</th>
              <th scope="col" className="th-num">
                Sending
              </th>
              <th scope="col" className="th-num">
                Value
              </th>
              <th scope="col">Destination</th>
              <th scope="col">Status</th>
              <th scope="col">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const rail = rails[row.rail];
              const automated = rail?.automated ?? false;
              const configured = rail?.configured ?? false;
              const busy = busyId === row.id;
              const open = ['Pending', 'HeldForReview'].includes(row.status);
              const processing = row.status === 'Processing';

              return (
                <tr key={row.id}>
                  <td>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-text-2">{relative(row.at)}</span>
                      <span className="font-mono text-11 text-text-3">{row.id}</span>
                    </span>
                  </td>
                  <td>
                    <Link
                      href={`/admin/users/${row.uid}`}
                      className="flex items-center gap-2 font-semibold text-text hover:text-mint"
                    >
                      <CountryChip code={row.countryCode} />
                      {row.username}
                    </Link>
                  </td>
                  <td>
                    <span className="flex flex-col">
                      <span className="text-text-2">
                        {row.coin} · {row.rail}
                      </span>
                      <span className="text-11 text-text-3">
                        {row.network}
                        {automated ? (
                          configured ? null : (
                            <span className="ml-1 text-warning">· no API key</span>
                          )
                        ) : (
                          <span className="ml-1 text-info">· manual</span>
                        )}
                      </span>
                    </span>
                  </td>
                  <td className="td-num tabular">
                    <span className="flex flex-col items-end">
                      <span>{cryptoAmount(Number(row.receiveAmount), row.coin)}</span>
                      <span className="text-11 text-text-3">
                        fee {cryptoAmount(Number(row.fee), row.coin)}
                      </span>
                    </span>
                  </td>
                  <td className="td-num tabular">
                    <span className="flex flex-col items-end">
                      <span>{usd(row.usdValue)}</span>
                      <span className="text-11 text-text-3">{tokens(row.tokenCost)} tokens</span>
                    </span>
                  </td>
                  <td>
                    <span className="flex flex-col">
                      <span className="font-mono text-12" title={row.address}>
                        {shortAddr(row.address, 8, 8)}
                      </span>
                      {row.txid ? (
                        <span className="inline-flex items-center gap-1 font-mono text-11 text-text-3">
                          <ExternalLink aria-hidden="true" className="size-3" />
                          {shortAddr(row.txid, 8, 6)}
                        </span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <span className="flex flex-col gap-1">
                      <StatusPill status={row.status} />
                      {row.status === 'HeldForReview' ? (
                        <span className="text-11 text-warning">over the review threshold</span>
                      ) : null}
                      {row.failureReason ? (
                        <span className="text-11 text-danger">{row.failureReason}</span>
                      ) : null}
                      {row.processedAt ? (
                        <span className="text-11 text-text-3">{dateTime(row.processedAt)}</span>
                      ) : null}
                    </span>
                  </td>
                  <td>
                    <span className="flex flex-wrap justify-end gap-1.5">
                      {open && automated ? (
                        <Button
                          variant="primary"
                          size="sm"
                          disabled={!canApprove || busy || !configured}
                          onClick={() => post(row, 'approve')}
                          title={
                            !canApprove
                              ? 'Needs withdrawal.approve'
                              : configured
                                ? undefined
                                : `${row.rail} has no API key configured — the send would fail`
                          }
                        >
                          <Check aria-hidden="true" />
                          Approve
                        </Button>
                      ) : null}

                      {(open || processing) && !automated ? (
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={!canApprove || busy}
                          onClick={() => {
                            setPending({ row, action: 'settle' });
                            setError(null);
                          }}
                        >
                          Record txid
                        </Button>
                      ) : null}

                      {open || processing ? (
                        <Button
                          variant="danger"
                          size="sm"
                          disabled={!canApprove || busy}
                          onClick={() => {
                            setPending({ row, action: 'reject' });
                            setError(null);
                          }}
                        >
                          <X aria-hidden="true" />
                          Reject
                        </Button>
                      ) : (
                        <Pill tone="neutral">closed</Pill>
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {cursor ? (
        <div className="flex items-center justify-end border-t border-line px-5 py-3">
          <Link
            href={`/admin/payouts?status=${encodeURIComponent(status)}&cursor=${encodeURIComponent(cursor)}`}
            className="text-12 font-semibold text-text-2 hover:text-text"
          >
            Next page →
          </Link>
        </div>
      ) : null}

      <Modal
        open={pending !== null}
        onClose={() => setPending(null)}
        title={pending?.action === 'reject' ? 'Reject this withdrawal' : 'Record the transaction id'}
        description={pending ? `${pending.row.id} · ${pending.row.username} · ${usd(pending.row.usdValue)}` : ''}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button
              variant={pending?.action === 'reject' ? 'danger' : 'primary'}
              disabled={
                busyId !== null ||
                (pending?.action === 'reject' ? reason.trim().length < 3 : txid.trim().length < 6)
              }
              onClick={() => {
                if (!pending) return;
                if (pending.action === 'reject') void post(pending.row, 'reject', { reason: reason.trim() });
                else void post(pending.row, 'settle', { txid: txid.trim() });
              }}
            >
              {pending?.action === 'reject' ? 'Reject and refund' : 'Mark completed'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          {pending?.action === 'reject' ? (
            <Field>
              <Label htmlFor="reject-reason">Reason</Label>
              <Input
                id="reject-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Address belongs to a suspended account"
              />
              <Hint>
                Shown to the user with their refund notification, so write it as something a member can act
                on. {pending ? tokens(pending.row.tokenCost) : '0'} tokens go back to their balance.
              </Hint>
            </Field>
          ) : (
            <Field>
              <Label htmlFor="settle-txid">Transaction id</Label>
              <Input
                id="settle-txid"
                mono
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                placeholder="0x… / on-chain hash"
              />
              <Hint>
                Recorded against the withdrawal and shown in the member&apos;s history. This marks the payout
                Completed — only do it once the transaction is actually broadcast.
              </Hint>
            </Field>
          )}

          {error ? <Alert tone="danger">{error}</Alert> : null}
        </div>
      </Modal>
    </section>
  );
}
