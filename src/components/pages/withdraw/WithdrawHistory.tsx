'use client';

import * as React from 'react';
import { Copy } from 'lucide-react';

import { copyText } from '@/lib/utils';
import { dateTime, shortAddr } from '@/lib/format';
import type { WithdrawalRecord, WithdrawalStatus } from '@/lib/models';
import { IconButton } from '@/components/ui/Button';
import { Card, CardHead, CardSub, CardTitle } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Select } from '@/components/ui/Select';
import { StatusPill } from '@/components/ui/Pill';
import { useToast } from '@/components/ui/Toast';

/* ============================================================================
   WITHDRAWAL HISTORY
   ----------------------------------------------------------------------------
   Status leads, because it is the only thing anyone opens this table to check.
   The destination address, which nobody reads in full, is truncated with a copy
   button beside it.

   Amounts sort on the parsed number rather than the rendered string: "412.50000
   DOGE" and "0.00004120 BTC" do not order correctly as text, and a payout table
   that sorts wrong looks like a payout table that pays wrong.
   ========================================================================== */

const STATUSES: WithdrawalStatus[] = [
  'Pending',
  'HeldForReview',
  'Processing',
  'Completed',
  'Rejected',
  'Failed',
  'Reversed',
];

export function WithdrawHistory({ rows: all }: { rows: WithdrawalRecord[] }) {
  const [filter, setFilter] = React.useState<'' | WithdrawalStatus>('');
  const { toast } = useToast();

  const rows = React.useMemo(
    () => (filter ? all.filter((w) => w.status === filter) : all),
    [all, filter],
  );

  const copy = async (value: string) => {
    const success = await copyText(value);
    toast(success ? 'Address copied' : 'Could not copy', success ? 'success' : 'danger');
  };

  const columns: Array<Column<WithdrawalRecord>> = [
    {
      id: 'status',
      header: 'Status',
      sortValue: (r) => r.status,
      cell: (r) => (
        <span className="flex flex-col gap-1">
          <StatusPill status={r.status === 'HeldForReview' ? 'Pending' : r.status} />
          {r.failureReason ? (
            <span className="text-[10px] leading-tight text-text-3">{r.failureReason}</span>
          ) : r.status === 'HeldForReview' ? (
            <span className="text-[10px] leading-tight text-text-3">Manual review</span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'method',
      header: 'Method',
      sortValue: (r) => r.rail,
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span>{r.rail}</span>
          <span className="text-11 text-text-3">{r.network}</span>
        </span>
      ),
    },
    {
      id: 'amount',
      header: 'Amount',
      numeric: true,
      sortValue: (r) => parseFloat(r.receiveAmount) || 0,
      cell: (r) => (
        <span className="flex flex-col leading-tight">
          <span>
            {r.receiveAmount} {r.coin}
          </span>
          <span className="text-11 text-text-3">{r.tokenCost.toLocaleString('en-US')} tokens</span>
        </span>
      ),
    },
    {
      id: 'dest',
      header: 'Destination',
      cell: (r) => (
        <span className="flex items-center gap-1">
          <span className="font-mono text-text-3">{shortAddr(r.address)}</span>
          <IconButton
            size="sm"
            aria-label={`Copy destination ${shortAddr(r.address)}`}
            onClick={() => void copy(r.address)}
          >
            <Copy />
          </IconButton>
        </span>
      ),
    },
    {
      id: 'txid',
      header: 'Transaction',
      cell: (r) =>
        r.txid ? (
          <span className="font-mono text-text-3">{shortAddr(r.txid, 8, 6)}</span>
        ) : (
          <span className="text-text-3">—</span>
        ),
    },
    {
      id: 'time',
      header: 'Time',
      numeric: true,
      sortValue: (r) => Date.parse(r.at),
      cell: (r) => <span className="text-12 text-text-3">{dateTime(r.processedAt ?? r.at)}</span>,
    },
  ];

  return (
    <Card as="section">
      <CardHead>
        <div className="min-w-0">
          <CardTitle>Withdrawal history</CardTitle>
          <CardSub>
            {all.length
              ? 'Automated rails settle in under a minute; on-chain payouts are batched'
              : 'Nothing withdrawn yet'}
          </CardSub>
        </div>
        {all.length ? (
          <Select
            aria-label="Filter by status"
            value={filter}
            onChange={(e) => setFilter(e.target.value as '' | WithdrawalStatus)}
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s === 'HeldForReview' ? 'Held for review' : s}
              </option>
            ))}
          </Select>
        ) : null}
      </CardHead>

      <DataTable
        caption="Your withdrawal history"
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.id}
        initialSort={{ id: 'time', dir: 'desc' }}
        empty={
          <EmptyState
            art={all.length ? 'search' : 'inbox'}
            title={all.length ? 'No withdrawals match that filter' : 'No withdrawals yet'}
            body={
              all.length
                ? 'Clear the filter to see your full payout history.'
                : 'Once you request a payout it appears here with its live status and, when it lands, its transaction id.'
            }
          />
        }
      />
    </Card>
  );
}
