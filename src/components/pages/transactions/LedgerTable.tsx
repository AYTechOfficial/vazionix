'use client';

import * as React from 'react';
import { ArrowDownToLine, Coins } from 'lucide-react';

import { ApiError, api } from '@/lib/api';
import { dateTime, signedTokens } from '@/lib/format';
import type { ClaimSource, LedgerEntry } from '@/lib/models';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill } from '@/components/ui/Pill';

/* ============================================================================
   LEDGER TABLE
   ----------------------------------------------------------------------------
   Every credit and debit on the account, newest first, paged by cursor.

   CURSOR PAGING, NOT OFFSET
   Firestore bills `offset(n)` as n document reads, so "page 20" of a ledger
   would cost twenty pages. The cursor is the last row's timestamp, and the
   server resumes from it — one page costs one page.

   Amounts are signed with a true minus sign and rendered in mono with tabular
   figures, so a column of credits and debits aligns on the digit rather than
   jittering as values change width.
   ========================================================================== */

const SOURCE_TONE: Record<string, 'mint' | 'violet' | 'blue' | 'info' | 'warning' | 'danger' | 'neutral' | 'success'> = {
  faucet: 'mint',
  ptc: 'blue',
  shortlink: 'violet',
  offerwall: 'info',
  bonus: 'success',
  challenge: 'warning',
  referral: 'violet',
  coupon: 'info',
  lottery: 'violet',
  adjustment: 'neutral',
  withdrawal: 'danger',
  refund: 'warning',
};

const SOURCE_LABEL: Record<string, string> = {
  faucet: 'Faucet',
  ptc: 'PTC',
  shortlink: 'Shortlink',
  offerwall: 'Offerwall',
  bonus: 'Bonus',
  challenge: 'Challenge',
  referral: 'Referral',
  coupon: 'Coupon',
  lottery: 'Lottery',
  adjustment: 'Adjustment',
  withdrawal: 'Withdrawal',
  refund: 'Refund',
};

export interface LedgerTableProps {
  title?: string;
  initialEntries: LedgerEntry[];
  initialCursor: string | null;
  source?: ClaimSource;
  emptyMessage?: string;
  /** Renders inside a Card. Set false when the parent already provides one. */
  card?: boolean;
  maxHeight?: number;
}

export function LedgerTable({
  title = 'Transactions',
  initialEntries,
  initialCursor,
  source,
  emptyMessage = 'Nothing here yet. Every claim, bonus and withdrawal shows up in this list.',
  card = true,
  maxHeight,
}: LedgerTableProps) {
  const [entries, setEntries] = React.useState(initialEntries);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadMore = async () => {
    if (!cursor || loading) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ cursor, limit: '25' });
      if (source) params.set('source', source);
      const result = await api.get<{ entries: LedgerEntry[]; cursor: string | null }>(
        `/api/transactions?${params.toString()}`,
      );
      setEntries((current) => [...current, ...result.entries]);
      setCursor(result.cursor);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load more.');
    } finally {
      setLoading(false);
    }
  };

  const columns: Array<Column<LedgerEntry>> = [
    {
      id: 'source',
      header: 'Source',
      cell: (row) => (
        <Pill tone={SOURCE_TONE[row.source] ?? 'neutral'}>
          {SOURCE_LABEL[row.source] ?? row.source}
        </Pill>
      ),
      sortValue: (row) => row.source,
    },
    {
      id: 'label',
      header: 'Detail',
      cell: (row) => <span className="text-13 text-text-2">{row.label}</span>,
    },
    {
      id: 'exp',
      header: 'EXP',
      numeric: true,
      cell: (row) => (row.exp ? `+${row.exp}` : '—'),
      sortValue: (row) => row.exp,
    },
    {
      id: 'amount',
      header: 'Tokens',
      numeric: true,
      cell: (row) => (
        <span className={row.amount < 0 ? 'font-semibold text-danger' : 'font-semibold text-mint'}>
          {signedTokens(row.amount)}
        </span>
      ),
      sortValue: (row) => row.amount,
    },
    {
      id: 'at',
      header: 'When',
      numeric: true,
      cell: (row) => <span className="text-12 text-text-3">{dateTime(row.at)}</span>,
      sortValue: (row) => Date.parse(row.at),
    },
  ];

  const body = (
    <>
      <DataTable
        caption={title}
        columns={columns}
        rows={entries}
        getRowKey={(row) => row.id}
        maxHeight={maxHeight}
        empty={
          <EmptyState
            art="inbox"
            title="No transactions yet"
            body={emptyMessage}
            action={
              <ButtonLink href="/faucet" variant="primary" size="sm">
                <Coins aria-hidden="true" />
                Start earning
              </ButtonLink>
            }
          />
        }
      />

      {error ? <p className="mt-3 text-12 text-danger">{error}</p> : null}

      {cursor ? (
        <div className="mt-4 flex justify-center">
          <Button variant="ghost" size="sm" onClick={loadMore} disabled={loading}>
            <ArrowDownToLine aria-hidden="true" />
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
    </>
  );

  if (!card) return body;

  return (
    <Card as="section" pad="md">
      <CardTitle className="mb-3">{title}</CardTitle>
      {body}
    </Card>
  );
}
